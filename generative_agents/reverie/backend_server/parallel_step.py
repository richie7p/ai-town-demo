"""
Run one simulation step for all personas in parallel.

The original loop (Persona.move) handles personas one after another, and each
one waits for every model call it makes. With 16 personas and a thinking
model that is far too slow for 100 days, so the same cognitive sequence is
split into phases:

  A  (parallel)    perceive, retrieve, long-term plan, next action,
                   choose the event to focus on       -- own state only
  B  (parallel)    decide whether to chat with / wait for someone
                   (reads other personas, writes nothing)
  C  (sequential)  resolve conflicts in the original persona order: a persona
                   takes part in at most one new conversation per step
  D  (parallel)    generate each conversation (pairs are disjoint) and apply
                   it to both personas; apply "wait" reactions
  E  (sequential)  chat bookkeeping exactly as in plan()
  F  (parallel)    reflect, then execute (path finding)

Differences from the original, by design: within a step every persona sees
the others as they were at the start of phase B, so two personas can no longer
both start a conversation with the same third persona in one step.
"""
from __future__ import annotations

import datetime
from concurrent.futures import ThreadPoolExecutor

from persona.cognitive_modules import plan as plan_mod


def _new_day(persona, curr_time):
  if not persona.scratch.curr_time:
    return "First day"
  if (persona.scratch.curr_time.strftime("%A %B %d")
      != curr_time.strftime("%A %B %d")):
    return "New day"
  return False


def _map(pool: ThreadPoolExecutor, fn, items):
  # list() re-raises the first exception from any worker in this thread.
  return list(pool.map(fn, items))


def parallel_move(personas: dict, personas_tile: dict, maze, curr_time,
                  pool: ThreadPoolExecutor) -> dict:
  """Returns {name: (next_tile, pronunciatio, description)}."""
  names = list(personas.keys())

  # ---- A: own perception and planning --------------------------------------
  def phase_a(name):
    p = personas[name]
    p.scratch.curr_tile = personas_tile[name]
    new_day = _new_day(p, curr_time)
    p.scratch.curr_time = curr_time
    perceived = p.perceive(maze)
    retrieved = p.retrieve(perceived)
    if new_day:
      plan_mod._long_term_planning(p, new_day)
    if p.scratch.act_check_finished():
      plan_mod._determine_action(p, maze)
    focused = False
    if retrieved.keys():
      focused = plan_mod._choose_retrieved(p, retrieved)
    return focused

  focused = dict(zip(names, _map(pool, phase_a, names)))

  # ---- B: decide reactions (read-only towards others) ----------------------
  def phase_b(name):
    if not focused[name]:
      return False
    return plan_mod._should_react(personas[name], focused[name], personas)

  reactions = dict(zip(names, _map(pool, phase_b, names)))

  # ---- C: resolve conflicts in the original order ---------------------------
  busy: set[str] = set()
  chats: list[tuple[str, str]] = []
  waits: list[str] = []
  for name in names:
    mode = reactions[name]
    if not mode:
      continue
    if mode[:9] == "chat with":
      target = mode[9:].strip()
      if name in busy or target in busy or target not in personas:
        continue
      busy.update((name, target))
      chats.append((name, target))
    elif mode[:4] == "wait" and name not in busy:
      busy.add(name)
      waits.append(name)

  # ---- D: conversations (disjoint pairs) and waits --------------------------
  def phase_d(job):
    kind, name = job
    p = personas[name]
    if kind == "chat":
      plan_mod._chat_react(maze, p, focused[name], reactions[name], personas)
    else:
      plan_mod._wait_react(p, reactions[name])

  _map(pool, phase_d, [("chat", a) for a, _ in chats] + [("wait", w) for w in waits])

  # ---- E: chat bookkeeping (same as the end of plan()) ----------------------
  for name in names:
    p = personas[name]
    if p.scratch.act_event[1] != "chat with":
      p.scratch.chatting_with = None
      p.scratch.chat = None
      p.scratch.chatting_end_time = None
    for other, _count in p.scratch.chatting_with_buffer.items():
      if other != p.scratch.chatting_with:
        p.scratch.chatting_with_buffer[other] -= 1

  # ---- F: reflect and execute ------------------------------------------------
  def phase_f(name):
    p = personas[name]
    p.reflect()
    return p.execute(maze, personas, p.scratch.act_address)

  return dict(zip(names, _map(pool, phase_f, names)))


def step_time(curr_time: datetime.datetime, sec_per_step: int) -> datetime.datetime:
  return curr_time + datetime.timedelta(seconds=sec_per_step)
