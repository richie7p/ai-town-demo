"""Headless runner: runs offline, checkpoints, resumes after a crash without
duplicating or losing steps."""
import gzip
import json
import os
import shutil

import pytest

import headless
import llm

BASE = os.path.join(os.path.dirname(headless.__file__), "..", "..", "environment",
                    "frontend_server", "storage", "base_the_ville_n25")


@pytest.fixture
def storage(tmp_path, monkeypatch):
  root = tmp_path / "storage"
  root.mkdir()
  shutil.copytree(BASE, root / "base_the_ville_n25")
  monkeypatch.setattr(headless, "fs_storage", str(root))
  monkeypatch.setenv("GA_USAGE_LOG", str(tmp_path / "usage.jsonl"))
  import fake_cognition
  fake_cognition.install()
  yield root
  fake_cognition.uninstall()
  llm.set_llm(None)


def steps_logged(sim_dir):
  out = []
  folder = os.path.join(sim_dir, "movement_log")
  for name in sorted(os.listdir(folder)):
    opener = gzip.open if name.endswith(".gz") else open
    with opener(os.path.join(folder, name), "rt") as fh:
      out += [json.loads(line)["step"] for line in fh]
  return out


def test_run_checkpoint_crash_and_resume(storage, monkeypatch):
  sim = headless.HeadlessSimulation("t", fork="base_the_ville_n25", workers=8)
  assert sim.run(until_day=1, checkpoint_every=50, max_cost=None, stop_file=None,
                 max_steps=120) == "paused"
  sim_dir = os.path.join(storage, "t")
  status = json.load(open(os.path.join(sim_dir, "run_status.json")))
  assert status["step"] == 120 and status["state"] == "paused"

  # Crash in the middle of step 130: the half-finished step must not be saved.
  sim = headless.HeadlessSimulation("t", workers=8)
  assert sim.step == 120
  real = headless.parallel_move
  calls = {"n": 0}

  def flaky(*args, **kwargs):
    calls["n"] += 1
    if calls["n"] == 11:
      raise RuntimeError("simulated crash")
    return real(*args, **kwargs)

  monkeypatch.setattr(headless, "parallel_move", flaky)
  with pytest.raises(RuntimeError, match="simulated crash"):
    sim.run(until_day=1, checkpoint_every=50, max_cost=None, stop_file=None, max_steps=100)
  assert json.load(open(os.path.join(sim_dir, "run_status.json")))["state"] == "crashed"
  monkeypatch.setattr(headless, "parallel_move", real)

  # Resume from the last good checkpoint (step 120: no checkpoint since).
  sim = headless.HeadlessSimulation("t", workers=8)
  assert sim.resumed and sim.step == 120
  sim.run(until_day=1, checkpoint_every=50, max_cost=None, stop_file=None, max_steps=30)
  steps = steps_logged(sim_dir)
  assert steps == list(range(150)), "every step exactly once, in order"


def test_stop_file_and_budget(storage, tmp_path):
  stop = tmp_path / "STOP"
  sim = headless.HeadlessSimulation("s", fork="base_the_ville_n25", workers=4)
  stop.write_text("x")
  assert sim.run(1, 50, None, str(stop), max_steps=10) == "stopped"
  stop.unlink()
  sim = headless.HeadlessSimulation("s", workers=4)
  llm.get_llm().usage.cost_usd = 5.0
  assert sim.run(1, 50, max_cost=1.0, stop_file=str(stop), max_steps=10) == "budget_reached"
