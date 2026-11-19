"""
Offline stand-ins for the 34 prompt functions in run_gpt_prompt.py.

They return the same Python types the real functions return after parsing,
so the full cognitive pipeline (planning, reactions, conversations,
reflection, path finding) can run without the API -- for tests, and for a free
dry run of the headless runner on a new machine. Results are plain and
repetitive on purpose; they are not meant to look like a real simulation.

  import fake_cognition; fake_cognition.install()
"""
from __future__ import annotations

import random
import sys
import threading

_lock = threading.Lock()
_rng = random.Random(1234)


def _r():
  with _lock:
    return _rng.random()


def _choice(seq):
  with _lock:
    return _rng.choice(seq)


def _hour_activity(hour: int) -> str:
  if hour < 7 or hour >= 23:
    return "sleeping"
  return {7: "having breakfast", 12: "having lunch", 18: "having dinner",
          19: "relaxing at home", 20: "relaxing at home", 21: "reading a book",
          22: "getting ready for bed"}.get(hour, "working on daily tasks")


def _split(text: str) -> list[str]:
  return [x.strip() for x in text.split(",") if x.strip()]


def wake_up_hour(persona, test_input=None, verbose=False):
  return 7, []


def daily_plan(persona, wake_up_hour, test_input=None, verbose=False):
  plan = [f"wake up and complete the morning routine at {wake_up_hour}:00 am",
          "have breakfast", "work on daily tasks", "have lunch at 12:00 pm",
          "work on daily tasks", "have dinner at 6:00 pm", "go to bed at 11:00 pm"]
  return plan, []


def generate_hourly_schedule(persona, curr_hour_str, p_f_ds_hourly_org, hour_str,
                             intermission2=None, test_input=None, verbose=False):
  hour = int(curr_hour_str.split(":")[0]) % 12 + (12 if "PM" in curr_hour_str else 0)
  return _hour_activity(hour), []


def task_decomp(persona, task, duration, test_input=None, verbose=False):
  # Like real decompositions: short subtasks, so nothing is decomposed twice.
  parts, left, i = [], duration, 1
  while left > 0:
    d = min(15, left)
    parts.append([f"{task} (step {i})", d])
    left -= d
    i += 1
  return parts, []


def action_sector(action_description, persona, maze, test_input=None, verbose=False):
  world = maze.access_tile(persona.scratch.curr_tile)["world"]
  home = persona.scratch.living_area.split(":")[1]
  if any(w in action_description for w in ("sleep", "bed", "home", "breakfast", "dinner", "routine")):
    return home, []
  sectors = [x for x in _split(persona.s_mem.get_str_accessible_sectors(world))
             if _split(persona.s_mem.get_str_accessible_sector_arenas(f"{world}:{x}"))]
  return (_choice(sectors) if sectors else home), []


def action_arena(action_description, persona, maze, act_world, act_sector,
                 test_input=None, verbose=False):
  arenas = _split(persona.s_mem.get_str_accessible_sector_arenas(f"{act_world}:{act_sector}"))
  if not arenas:
    return persona.scratch.living_area.split(":")[2], []
  return _choice(arenas), []


def action_game_object(action_description, persona, maze, temp_address,
                       test_input=None, verbose=False):
  objects = _split(persona.s_mem.get_str_accessible_arena_game_objects(temp_address))
  return (_choice(objects) if objects else "<random>"), []


def pronunciatio(action_description, persona, verbose=False):
  return "🙂", []


def event_triple(action_description, persona, verbose=False):
  return (persona.name, "is", action_description), []


def act_obj_desc(act_game_object, act_desp, persona, verbose=False):
  return "being used", []


def act_obj_event_triple(act_game_object, act_obj_desc, persona, verbose=False):
  return (act_game_object, "is", act_obj_desc), []


def new_decomp_schedule(persona, main_act_dur, truncated_act_dur, start_time_hour,
                        end_time_hour, inserted_act, inserted_act_dur,
                        test_input=None, verbose=False):
  # The original's own fallback when the model output cannot be parsed.
  dur_sum = sum(dur for _act, dur in main_act_dur)
  ret = [list(x) for x in truncated_act_dur]
  ret += [list(x) for x in main_act_dur[len(ret) - 1:]]
  total, count, over = 0, 0, None
  for _act, dur in ret:
    total += dur
    if total == dur_sum:
      break
    if total > dur_sum:
      over = total - dur_sum
      break
    count += 1
  if over:
    ret = ret[:count + 1]
    ret[-1][1] -= over
  return ret, []


def decide_to_talk(persona, target_persona, retrieved, test_input=None, verbose=False):
  return ("yes" if _r() < 0.3 else "no"), []


def decide_to_react(persona, target_persona, retrieved, test_input=None, verbose=False):
  return "3", []


def summarize_conversation(persona, conversation, test_input=None, verbose=False):
  names = sorted({line[0] for line in conversation}) if conversation else []
  return f"conversing about the day with {' and '.join(names) or 'a neighbor'}", []


def _text(*_a, **_k):
  return "nothing in particular", []


def event_poignancy(persona, event_description, test_input=None, verbose=False):
  return (1 if "idle" in event_description or "is" == event_description else 3), []


def thought_poignancy(persona, event_description, test_input=None, verbose=False):
  return 4, []


def chat_poignancy(persona, event_description, test_input=None, verbose=False):
  return 5, []


def focal_pt(persona, statements, n, test_input=None, verbose=False):
  return [f"what {persona.name} has been doing lately"] * n, []


def insight_and_guidance(persona, statements, n, test_input=None, verbose=False):
  return {f"{persona.name} keeps a steady daily routine": [0]}, []


def generate_iterative_chat_utt(maze, init_persona, target_persona, retrieved,
                                curr_context, curr_chat, test_input=None, verbose=False):
  end = len(curr_chat) >= 3
  line = "Good to see you!" if not curr_chat else "Same here, see you later."
  return {"utterance": line, "end": end}, []


def generate_safety_score(persona, comment, test_input=None, verbose=False):
  return 1, []


def extract_keywords(persona, description, test_input=None, verbose=False):
  return set(description.lower().split()[:3]), []


FAKES = {
  "wake_up_hour": wake_up_hour, "daily_plan": daily_plan,
  "generate_hourly_schedule": generate_hourly_schedule, "task_decomp": task_decomp,
  "action_sector": action_sector, "action_arena": action_arena,
  "action_game_object": action_game_object, "pronunciatio": pronunciatio,
  "event_triple": event_triple, "act_obj_desc": act_obj_desc,
  "act_obj_event_triple": act_obj_event_triple,
  "new_decomp_schedule": new_decomp_schedule, "decide_to_talk": decide_to_talk,
  "decide_to_react": decide_to_react, "summarize_conversation": summarize_conversation,
  "event_poignancy": event_poignancy, "thought_poignancy": thought_poignancy,
  "chat_poignancy": chat_poignancy, "focal_pt": focal_pt,
  "insight_and_guidance": insight_and_guidance,
  "generate_iterative_chat_utt": generate_iterative_chat_utt,
  "generate_safety_score": generate_safety_score, "extract_keywords": extract_keywords,
}
TEXT_ONLY = ["create_conversation", "keyword_to_thoughts", "convo_to_thoughts",
             "agent_chat_summarize_ideas", "agent_chat_summarize_relationship",
             "agent_chat", "summarize_ideas", "generate_next_convo_line",
             "generate_whisper_inner_thought", "planning_thought_on_convo",
             "memo_on_convo"]


def install():
  """Replace run_gpt_prompt_* everywhere they were imported, and embeddings."""
  import llm
  from persona.prompt_template import run_gpt_prompt as rgp

  table = dict(FAKES)
  table.update({name: _text for name in TEXT_ONLY})
  replaced = 0
  for mod in list(sys.modules.values()):
    if mod is None or not getattr(mod, "__name__", "").startswith(("persona", "reverie", "__main__")):
      continue
    for attr in list(vars(mod)):
      if attr.startswith("run_gpt_"):
        key = attr.removeprefix("run_gpt_prompt_").removeprefix("run_gpt_")
        if key in table:
          setattr(mod, attr, llm.tag_task(_named(table[key], attr)))
          replaced += 1
  missing = [n for n in dir(rgp) if n.startswith("run_gpt_")
             and n.removeprefix("run_gpt_prompt_").removeprefix("run_gpt_") not in table]
  if missing:
    raise RuntimeError(f"fake_cognition has no stand-in for {missing}")

  class _FakeEmbedLLM(llm.LLM):
    def embed(self, text):
      # Deterministic pseudo-vector; size follows GA_EMBED_DIMENSIONS so it
      # matches the base simulation (1536 for the original n25 base).
      rng = random.Random(text)
      return [rng.random() - 0.5 for _ in range(self.embed_dimensions or 1536)]

    def complete(self, prompt, **kwargs):
      raise AssertionError(f"unexpected model call in fake mode: {prompt[:80]!r}")

  llm.set_llm(_FakeEmbedLLM(client=object()))
  return replaced


def _named(fn, name):
  def wrapper(*args, **kwargs):
    return fn(*args, **kwargs)
  wrapper.__name__ = name
  return wrapper
