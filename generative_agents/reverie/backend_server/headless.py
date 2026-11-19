"""
Headless runner: advances a simulation without the browser frontend.

The original backend waits for the Phaser frontend to report every persona's
tile before each step. Here the backend applies its own movement, runs the
personas in parallel (parallel_step.py), checkpoints regularly and can resume
after a crash, a VM restart or a deliberate stop.

  python headless.py --fork base_the_ville_n25 --sim run1 --days 1
  python headless.py --sim run1 --days 100          # resume and continue

Simulation folder layout (under GA_STORAGE):
  <sim>/reverie/meta.json, personas/, environment/0.json   initial state (fork)
  <sim>/checkpoint/meta.json, tiles.json, personas/         latest checkpoint
  <sim>/movement_log/day-001.jsonl.gz                       one line per step
  <sim>/run_status.json                                     progress and cost
  <sim>/usage.jsonl                                         one line per API call
"""
from __future__ import annotations

import argparse
import datetime
import gzip
import json
import os
import shutil
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from utils import fs_storage
from maze import Maze
from persona.persona import Persona
import llm
from parallel_step import parallel_move

TIME_FMT = "%B %d, %Y, %H:%M:%S"


def _write_json_atomic(path, data):
  tmp = f"{path}.tmp"
  with open(tmp, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, ensure_ascii=False)
  os.replace(tmp, path)


class HeadlessSimulation:
  def __init__(self, sim_code: str, fork: str | None = None, workers: int = 16):
    self.sim_code = sim_code
    self.folder = os.path.join(fs_storage, sim_code)
    if not os.path.isdir(self.folder):
      if not fork:
        raise SystemExit(f"Simulation '{sim_code}' does not exist; pass --fork")
      shutil.copytree(os.path.join(fs_storage, fork), self.folder)
      meta_path = os.path.join(self.folder, "reverie", "meta.json")
      with open(meta_path) as fh:
        meta = json.load(fh)
      meta["fork_sim_code"] = fork
      _write_json_atomic(meta_path, meta)
    self._recover_checkpoint_swap()

    ckpt = os.path.join(self.folder, "checkpoint")
    resuming = os.path.isfile(os.path.join(ckpt, "meta.json"))
    meta_path = os.path.join(ckpt if resuming else os.path.join(self.folder, "reverie"),
                             "meta.json")
    with open(meta_path) as fh:
      meta = json.load(fh)
    self.meta = meta
    self.start_time = datetime.datetime.strptime(f"{meta['start_date']}, 00:00:00", TIME_FMT)
    self.curr_time = datetime.datetime.strptime(meta["curr_time"], TIME_FMT)
    self.sec_per_step = meta["sec_per_step"]
    self.step = meta["step"]
    self.maze = Maze(meta["maze_name"])

    if resuming:
      with open(os.path.join(ckpt, "tiles.json")) as fh:
        tiles = {k: tuple(v) for k, v in json.load(fh).items()}
      persona_root = os.path.join(ckpt, "personas")
    else:
      with open(os.path.join(self.folder, "environment", f"{self.step}.json")) as fh:
        env = json.load(fh)
      tiles = {k: (v["x"], v["y"]) for k, v in env.items()}
      persona_root = os.path.join(self.folder, "personas")

    self.personas: dict[str, Persona] = {}
    self.personas_tile: dict[str, tuple] = {}
    for name in meta["persona_names"]:
      persona = Persona(name, os.path.join(persona_root, name))
      self.personas[name] = persona
      self.personas_tile[name] = tiles[name]
      self.maze.tiles[tiles[name][1]][tiles[name][0]]["events"].add(
        persona.scratch.get_curr_event_and_desc())
    # Tiles the personas will stand on at the start of the next step.
    self.next_tiles = dict(self.personas_tile)
    self.game_obj_cleanup: dict = {}

    self._trim_movement_log()
    self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="persona")
    self.resumed = resuming
    self._stop_requested = False
    status = self._read_status()
    self.cost_before = status.get("llm", {}).get("cost_usd", 0.0)
    self.wall_before = status.get("wall_seconds", 0.0)

  # ------------------------------------------------------------------ steps
  def step_once(self):
    maze = self.maze
    for key, val in self.game_obj_cleanup.items():
      maze.turn_event_from_tile_idle(key, val)
    self.game_obj_cleanup = {}
    for name, persona in self.personas.items():
      curr_tile = self.personas_tile[name]
      new_tile = self.next_tiles[name]
      self.personas_tile[name] = new_tile
      maze.remove_subject_events_from_tile(persona.name, curr_tile)
      maze.add_event_from_tile(persona.scratch.get_curr_event_and_desc(), new_tile)
      if not persona.scratch.planned_path:
        self.game_obj_cleanup[persona.scratch.get_curr_obj_event_and_desc()] = new_tile
        maze.add_event_from_tile(persona.scratch.get_curr_obj_event_and_desc(), new_tile)
        blank = (persona.scratch.get_curr_obj_event_and_desc()[0], None, None, None)
        maze.remove_event_from_tile(blank, new_tile)

    moves = parallel_move(self.personas, self.personas_tile, maze, self.curr_time, self.pool)

    record = {"step": self.step, "time": self.curr_time.strftime(TIME_FMT), "persona": {}}
    for name, (next_tile, pronunciatio, description) in moves.items():
      self.next_tiles[name] = tuple(next_tile)
      record["persona"][name] = {
        "movement": list(next_tile), "pronunciatio": pronunciatio,
        "description": description, "chat": self.personas[name].scratch.chat}
    self._log_movement(record)
    self.step += 1
    self.curr_time += datetime.timedelta(seconds=self.sec_per_step)

  def _day_index(self, when=None) -> int:
    when = when or self.curr_time
    return (when.date() - self.start_time.date()).days + 1

  def _log_movement(self, record):
    folder = os.path.join(self.folder, "movement_log")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"day-{self._day_index():03d}.jsonl")
    with open(path, "a", encoding="utf-8") as fh:
      fh.write(json.dumps(record, ensure_ascii=False) + "\n")

  def _trim_movement_log(self):
    """Drop steps logged after the checkpoint we resume from (they are rerun)."""
    folder = os.path.join(self.folder, "movement_log")
    if not os.path.isdir(folder):
      return
    path = os.path.join(folder, f"day-{self._day_index():03d}.jsonl")
    if not os.path.exists(path) and os.path.exists(path + ".gz"):
      with gzip.open(path + ".gz", "rb") as fin, open(path, "wb") as fout:
        shutil.copyfileobj(fin, fout)
      os.remove(path + ".gz")
    for fname in os.listdir(folder):       # later days were never reached
      if fname.startswith("day-") and int(fname[4:7]) > self._day_index():
        os.remove(os.path.join(folder, fname))
    if os.path.exists(path):
      tmp = path + ".tmp"
      with open(path, encoding="utf-8") as fin, open(tmp, "w", encoding="utf-8") as fout:
        for line in fin:
          if line.strip() and json.loads(line)["step"] < self.step:
            fout.write(line)
      os.replace(tmp, path)

  def _compress_finished_days(self):
    folder = os.path.join(self.folder, "movement_log")
    if not os.path.isdir(folder):
      return
    today = f"day-{self._day_index():03d}.jsonl"
    for fname in sorted(os.listdir(folder)):
      if fname.endswith(".jsonl") and fname != today:
        src = os.path.join(folder, fname)
        with open(src, "rb") as fin, gzip.open(src + ".gz", "wb") as fout:
          shutil.copyfileobj(fin, fout)
        os.remove(src)

  # ------------------------------------------------------------------ checkpoints
  def _recover_checkpoint_swap(self):
    ckpt = os.path.join(self.folder, "checkpoint")
    new, old = ckpt + ".new", ckpt + ".old"
    if not os.path.isdir(ckpt) and os.path.isfile(os.path.join(new, "meta.json")):
      os.rename(new, ckpt)                      # crashed between the two renames
    if os.path.isdir(new):
      shutil.rmtree(new)                        # incomplete checkpoint
    if os.path.isdir(old):
      shutil.rmtree(old)

  def checkpoint(self):
    ckpt = os.path.join(self.folder, "checkpoint")
    new, old = ckpt + ".new", ckpt + ".old"
    if os.path.isdir(new):
      shutil.rmtree(new)
    os.makedirs(os.path.join(new, "personas"))
    for name, persona in self.personas.items():
      folder = os.path.join(new, "personas", name, "bootstrap_memory")
      os.makedirs(os.path.join(folder, "associative_memory"))
      persona.save(folder)
    with open(os.path.join(new, "tiles.json"), "w") as fh:
      json.dump({k: list(v) for k, v in self.next_tiles.items()}, fh)
    meta = dict(self.meta)
    meta.update(curr_time=self.curr_time.strftime(TIME_FMT), step=self.step,
                sec_per_step=self.sec_per_step, persona_names=list(self.personas))
    with open(os.path.join(new, "meta.json"), "w") as fh:
      json.dump(meta, fh, indent=2)
    if os.path.isdir(ckpt):
      os.rename(ckpt, old)
    os.rename(new, ckpt)
    if os.path.isdir(old):
      shutil.rmtree(old)

  # ------------------------------------------------------------------ status
  def _status_path(self):
    return os.path.join(self.folder, "run_status.json")

  def _read_status(self) -> dict:
    try:
      with open(self._status_path()) as fh:
        return json.load(fh)
    except (OSError, ValueError):
      return {}

  def write_status(self, wall_seconds: float, state: str, target_day: int):
    usage = llm.get_llm().usage.as_dict()
    usage["cost_usd"] = round(self.cost_before + usage["cost_usd"], 4)
    day = self._day_index()
    status = {
      "sim_code": self.sim_code, "state": state, "step": self.step,
      "sim_time": self.curr_time.strftime(TIME_FMT), "sim_day": day,
      "target_day": target_day, "personas": len(self.personas),
      "wall_seconds": round(self.wall_before + wall_seconds, 1),
      "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "llm": usage,
    }
    _write_json_atomic(self._status_path(), status)
    return status

  # ------------------------------------------------------------------ main loop
  def run(self, until_day: int, checkpoint_every: int, max_cost: float | None,
          stop_file: str | None, max_steps: int | None = None):
    def request_stop(signum, _frame):
      print(f"Signal {signum}: finishing the current step, then checkpointing.", flush=True)
      self._stop_requested = True
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    started = time.monotonic()
    steps_done = 0
    state = "running"
    print(f"{'Resuming' if self.resumed else 'Starting'} {self.sim_code} at step {self.step} "
          f"({self.curr_time.strftime(TIME_FMT)}), {len(self.personas)} personas, "
          f"until end of day {until_day}", flush=True)
    try:
      while True:
        if self._day_index() > until_day:
          state = "finished"
          break
        if max_steps is not None and steps_done >= max_steps:
          state = "paused"
          break
        if self._stop_requested or (stop_file and os.path.exists(stop_file)):
          state = "stopped"
          break
        cost = self.cost_before + llm.get_llm().usage.cost_usd
        if max_cost is not None and cost >= max_cost:
          state = "budget_reached"
          print(f"Budget reached: ${cost:.2f} >= ${max_cost:.2f}", flush=True)
          break
        day_before = self._day_index()
        self.step_once()
        steps_done += 1
        if self._day_index() != day_before:
          self._compress_finished_days()
        if self.step % checkpoint_every == 0:
          self.checkpoint()
          s = self.write_status(time.monotonic() - started, state, until_day)
          print(f"[{s['sim_time']}] step {s['step']} day {s['sim_day']} | "
                f"calls {s['llm']['calls']} | ${s['llm']['cost_usd']:.2f} | "
                f"wall {s['wall_seconds'] / 3600:.2f} h", flush=True)
      # Only reached between steps, so the state is consistent. Nothing to
      # save if no step ran (the original save() cannot store a persona that
      # has never moved, and the files on disk are already current).
      if steps_done:
        self.checkpoint()
      self.write_status(time.monotonic() - started, state, until_day)
    except BaseException as exc:
      # A step failed half-way: its state is inconsistent, so it is NOT saved.
      # The next start resumes from the last good checkpoint.
      state = "fatal_error" if isinstance(exc, llm.FatalLLMError) else "crashed"
      self.write_status(time.monotonic() - started, state, until_day)
      print(f"{state.upper()}: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
      if not isinstance(exc, llm.FatalLLMError):
        raise
    finally:
      self.pool.shutdown(wait=True)
    print(f"{state}: step {self.step}, {self.curr_time.strftime(TIME_FMT)}", flush=True)
    return state


def silence_original_prints():
  """The original modules print constantly (prompts, schedules, every memory
  score). Over 100 days that is billions of lines, so it is muted unless
  GA_VERBOSE=1. Only module-level `print` is replaced; this runner's own
  progress lines are unaffected."""
  if os.environ.get("GA_VERBOSE") == "1":
    return
  quiet = lambda *args, **kwargs: None
  for name, mod in list(sys.modules.items()):
    if mod is not None and (name.startswith("persona") or name in (
        "maze", "path_finder", "global_methods", "reverie", "fake_cognition")):
      mod.print = quiet


def main(argv=None):
  ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
  ap.add_argument("--sim", required=True, help="simulation name (folder under storage)")
  ap.add_argument("--fork", help="base simulation to copy when --sim does not exist yet")
  ap.add_argument("--days", type=int, required=True, help="run until the end of this day")
  ap.add_argument("--workers", type=int, default=16)
  ap.add_argument("--checkpoint-every", type=int, default=360,
                  help="steps between checkpoints (360 = one hour at 10 s/step)")
  ap.add_argument("--max-cost", type=float, default=None, help="stop once this many USD are spent")
  ap.add_argument("--max-steps", type=int, default=None, help="stop after this many steps")
  ap.add_argument("--stop-file", default=None, help="stop gracefully when this file appears")
  ap.add_argument("--fake-llm", action="store_true",
                  help="no API calls: canned answers (dry run / tests, costs nothing)")
  args = ap.parse_args(argv)

  os.environ.setdefault("GA_USAGE_LOG", os.path.join(fs_storage, args.sim, "usage.jsonl"))
  llm.set_llm(None)  # pick up GA_USAGE_LOG
  if args.fake_llm:
    import fake_cognition
    fake_cognition.install()
  silence_original_prints()
  sim = HeadlessSimulation(args.sim, args.fork, workers=args.workers)
  state = sim.run(args.days, args.checkpoint_every, args.max_cost, args.stop_file, args.max_steps)
  return 0 if state in ("finished", "paused", "stopped", "budget_reached") else 1


if __name__ == "__main__":
  sys.exit(main())
