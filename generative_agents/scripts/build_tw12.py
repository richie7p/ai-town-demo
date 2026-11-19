"""
Builds the 12-resident base simulation `base_the_ville_tw12` and its map copy
`the_ville_tw` (the original map with homes renamed for the new residents).

  python scripts/build_tw12.py            # (re)generates both folders

The original map and the 25-person base are not modified. Character sheets
are written in English with Chinese names: they are inserted into the
original English prompts, and keeping them English keeps the action
descriptions English, which the code relies on. Conversations and thoughts
are switched to Traditional Chinese separately (GA_LANGUAGE in llm.py).
"""
from __future__ import annotations

import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "environment", "frontend_server", "static_dirs", "assets")
STORAGE = os.path.join(ROOT, "environment", "frontend_server", "storage")
SRC_MAP, NEW_MAP = "the_ville", "the_ville_tw"
SRC_BASE, NEW_BASE = "base_the_ville_n25", "base_the_ville_tw12"
START = "March 01, 2027"  # a Monday

SECTOR_RENAMES = {
  "Lin family's house": "Chen (陳) family's house",
  "Moreno family's house": "Wu (吳) family's house",
  "Moore family's house": "Chang (張) family's house",
  "Tamara Taylor and Carmen Ortiz's house": "Huang (黃) and Li (李)'s house",
  # Names containing "'s house" can only be entered by residents whose last
  # name appears in them (rule in run_gpt_prompt_action_sector), so the
  # unused homes are locked for everyone and 林志明's home only for him.
  "Isabella Rodriguez's apartment": "林志明's house",
  "Arthur Burton's apartment": "empty neighbor's house A",
  "Carlos Gomez's apartment": "empty neighbor's house B",
  "Giorgio Rossi's apartment": "empty neighbor's house C",
  "Ryan Park's apartment": "empty neighbor's house D",
  "Adam Smith's house": "empty neighbor's house E",
  "Yuriko Yamamoto's house": "empty neighbor's house F",
}
ARENA_RENAMES = {
  "Mei and John Lin's bedroom": "陳建國 and 陳美玲's bedroom",
  "Eddy Lin's bedroom": "陳宇翔's bedroom",
  "Tom and Jane Moreno's bedroom": "吳家豪 and 吳怡君's bedroom",
  "empty bedroom": "吳怡君's studio",
  "Tamara Taylor's room": "黃詩涵's room",
  "Carmen Ortiz's room": "李佳穎's room",
  "Latoya Williams's room": "周子豪's room",
  "Latoya Williams's bathroom": "周子豪's bathroom",
  "Rajiv Patel's room": "蔡依婷's room",
  "Rajiv Patel's bathroom": "蔡依婷's bathroom",
  "Abigail Chen's room": "spare room A", "Abigail Chen's bathroom": "spare bathroom A",
  "Francisco Lopez's room": "spare room B", "Francisco Lopez's bathroom": "spare bathroom B",
  "Hailey Johnson's room": "spare room C", "Hailey Johnson's bathroom": "spare bathroom C",
  "Klaus Mueller's room": "dorm room 1", "Maria Lopez's room": "dorm room 2",
  "Ayesha Khan's room": "dorm room 3", "Wolfgang Schulz's room": "dorm room 4",
}
PUBLIC = ["Hobbs Cafe", "The Rose and Crown Pub", "Harvey Oak Supply Store",
          "The Willows Market and Pharmacy", "Oak Hill College", "Johnson Park"]

# name, first, last, age, home sector, home arena, original occupant (start tile
# and sprite), innate, learned, currently, lifestyle, daily_plan_req
RESIDENTS = [
  ("陳建國", "建國", "陳", 48, "Chen (陳) family's house", "陳建國 and 陳美玲's bedroom", "John Lin",
   "practical, stubborn, warm-hearted",
   "陳建國 owns Harvey Oak Supply Store, the hardware store he took over from his father twenty years ago. He can fix almost anything and is proud of being useful to his neighbors. He is married to 陳美玲, and their son 陳宇翔 is a first-year student at Oak Hill College. He has known 張福來 since he was a boy.",
   "陳建國 is worried because sales at Harvey Oak Supply Store have dropped this year. He is thinking about offering repair classes on Saturday mornings to bring in customers, but has not decided yet.",
   "陳建國 goes to bed around 10pm and wakes up around 5:30am.",
   "陳建國 opens Harvey Oak Supply Store at 8am and closes it at 6pm, Monday to Saturday."),
  ("陳美玲", "美玲", "陳", 46, "Chen (陳) family's house", "陳建國 and 陳美玲's bedroom", "Mei Lin",
   "careful, caring, talkative",
   "陳美玲 is the pharmacist at The Willows Market and Pharmacy. Many neighbors ask her for health advice, and she keeps their secrets. She is married to 陳建國 and is the mother of 陳宇翔. She supervises 黃詩涵 at the pharmacy and wants to help her pass the pharmacist license exam.",
   "陳美玲 is planning a free health talk about sleep and stress at Johnson Park in two weeks and wants to invite as many neighbors as possible. She worries that her son 陳宇翔 is not eating or sleeping well.",
   "陳美玲 goes to bed around 11pm and wakes up around 6:30am.",
   "陳美玲 works at The Willows Market and Pharmacy from 9am to 5pm, Monday to Friday."),
  ("陳宇翔", "宇翔", "陳", 19, "Chen (陳) family's house", "陳宇翔's bedroom", "Eddy Lin",
   "curious, shy, easily distracted",
   "陳宇翔 is a first-year computer science student at Oak Hill College who still lives with his parents 陳建國 and 陳美玲. He plays guitar in his room every night and loves live music.",
   "陳宇翔 has midterm exams in three weeks and feels behind in his classes. He secretly wants to switch his major to music and admires 蔡依婷, who performs at The Rose and Crown Pub, but he has not told his parents.",
   "陳宇翔 goes to bed around 1am and wakes up around 8am.",
   "陳宇翔 attends classes at Oak Hill College from 10am to 4pm, Monday to Friday."),
  ("吳家豪", "家豪", "吳", 36, "Wu (吳) family's house", "吳家豪 and 吳怡君's bedroom", "Tom Moreno",
   "outgoing, generous, impulsive",
   "吳家豪 owns The Rose and Crown Pub, where there is live music on weekends. He likes to know everyone in town and often buys regulars a drink. He is married to 吳怡君.",
   "吳家豪 wants to start a monthly open-mic night at The Rose and Crown Pub and has asked 蔡依婷 to host it. He and 吳怡君 have been talking about whether to have a child, and he is excited about the idea.",
   "吳家豪 goes to bed around 1am and wakes up around 9am.",
   "吳家豪 opens The Rose and Crown Pub at 4pm and closes it at midnight, every day except Monday."),
  ("吳怡君", "怡君", "吳", 34, "Wu (吳) family's house", "吳家豪 and 吳怡君's bedroom", "Jane Moreno",
   "thoughtful, independent, a little anxious",
   "吳怡君 is a freelance illustrator who works in her studio at home or at Hobbs Cafe. She is married to 吳家豪 and is good friends with 周子豪, whose paintings she admires.",
   "吳怡君 is drawing the illustrations for a children's picture book that is due in five weeks. She is not sure she is ready to have a child and has not yet told 吳家豪 about her worries.",
   "吳怡君 goes to bed around 11pm and wakes up around 7am.",
   "吳怡君 works on her illustrations from 9am to 5pm, often at Hobbs Cafe in the afternoon."),
  ("張福來", "福來", "張", 71, "Chang (張) family's house", "main room", "Sam Moore",
   "patient, humorous, old-fashioned",
   "張福來 is a retired carpenter who built much of the furniture in town. He has been married to 張秀琴 for forty-five years and plays chess in Johnson Park every morning. He has known 陳建國 since 陳建國 was a boy.",
   "張福來 wants to teach young people woodworking before he gets too old. He has started asking 陳建國 whether he could use the back of Harvey Oak Supply Store for a small weekend class.",
   "張福來 goes to bed around 9:30pm and wakes up around 5am.",
   "張福來 plays chess in Johnson Park in the morning and takes a nap after lunch."),
  ("張秀琴", "秀琴", "張", 68, "Chang (張) family's house", "main room", "Jennifer Moore",
   "energetic, nosy, kind",
   "張秀琴 is a retired school teacher and an active community volunteer who knows every family in town. She is married to 張福來.",
   "張秀琴 organizes a neighborhood potluck lunch at Johnson Park every Sunday at noon and wants more young residents to come. She is trying to introduce 李佳穎 to someone nice.",
   "張秀琴 goes to bed around 10pm and wakes up around 5:30am.",
   "張秀琴 buys groceries at The Willows Market and Pharmacy in the morning and visits neighbors in the afternoon."),
  ("黃詩涵", "詩涵", "黃", 29, "Huang (黃) and Li (李)'s house", "黃詩涵's room", "Tamara Taylor",
   "diligent, reserved, dryly funny",
   "黃詩涵 works as a pharmacy clerk at The Willows Market and Pharmacy under 陳美玲. She shares a house with her close friend 李佳穎.",
   "黃詩涵 is studying every evening for the pharmacist license exam in six weeks and is often tired. She knows that 李佳穎 has a crush on 周子豪 and teases her about it.",
   "黃詩涵 goes to bed around midnight and wakes up around 7am.",
   "黃詩涵 works at The Willows Market and Pharmacy from 9am to 5pm, Monday to Friday, and studies at the Oak Hill College library in the evening."),
  ("李佳穎", "佳穎", "李", 27, "Huang (黃) and Li (李)'s house", "李佳穎's room", "Carmen Ortiz",
   "cheerful, romantic, curious",
   "李佳穎 is a barista at Hobbs Cafe, which is owned by 林志明. She shares a house with her best friend 黃詩涵.",
   "李佳穎 dreams of opening her own small cafe someday and is saving money for it. She has a crush on 周子豪, who often sketches at Hobbs Cafe, but has only told 黃詩涵.",
   "李佳穎 goes to bed around 11pm and wakes up around 6am.",
   "李佳穎 works at Hobbs Cafe from 7am to 3pm, Monday to Saturday."),
  ("周子豪", "子豪", "周", 26, "artist's co-living space", "周子豪's room", "Latoya Williams",
   "dreamy, sensitive, disorganized",
   "周子豪 is a painter who lives in the artist's co-living space with 蔡依婷. He likes to sketch people at Hobbs Cafe and is friends with 吳怡君.",
   "周子豪 has been offered a solo exhibition at Hobbs Cafe in four weeks by 林志明 and still needs to finish eight paintings. He has not noticed that 李佳穎 likes him.",
   "周子豪 goes to bed around 2am and wakes up around 10am.",
   "周子豪 paints in his room in the morning and sketches at Hobbs Cafe in the afternoon."),
  ("蔡依婷", "依婷", "蔡", 24, "artist's co-living space", "蔡依婷's room", "Rajiv Patel",
   "passionate, blunt, restless",
   "蔡依婷 is an independent musician who lives in the artist's co-living space with 周子豪. She performs at The Rose and Crown Pub on Friday and Saturday nights and teaches guitar to earn money.",
   "蔡依婷 is writing songs for her first EP and has been asked by 吳家豪 to host a monthly open-mic night at The Rose and Crown Pub. She is not sure she has time.",
   "蔡依婷 goes to bed around 2am and wakes up around 10am.",
   "蔡依婷 writes songs in the morning, teaches guitar in the afternoon, and performs at The Rose and Crown Pub at 8pm on Fridays and Saturdays."),
  ("林志明", "志明", "林", 45, "林志明's house", "main room", "Isabella Rodriguez",
   "friendly, organized, a good listener",
   "林志明 owns Hobbs Cafe and lives alone after his divorce. He likes to support local artists and knows most of the regulars by name. 李佳穎 works for him as a barista.",
   "林志明 is preparing 周子豪's solo exhibition at Hobbs Cafe in four weeks and wants to turn it into a community event. He is also thinking about hiring another barista because 李佳穎 is often overworked.",
   "林志明 goes to bed around 11pm and wakes up around 6am.",
   "林志明 opens Hobbs Cafe at 7am and closes it at 7pm every day."),
]


def rename_map():
  src = os.path.join(ASSETS, SRC_MAP, "matrix")
  dst = os.path.join(ASSETS, NEW_MAP, "matrix")
  if os.path.isdir(dst):
    shutil.rmtree(dst)
  shutil.copytree(src, dst)
  blocks = os.path.join(dst, "special_blocks")
  for fname in ("sector_blocks.csv", "arena_blocks.csv", "spawning_location_blocks.csv",
                "game_object_blocks.csv"):
    path = os.path.join(blocks, fname)
    out = []
    with open(path, encoding="utf-8") as fh:
      for line in fh.read().splitlines():
        fields = [f.strip() for f in line.split(",")]
        if len(fields) >= 3:
          fields[2] = SECTOR_RENAMES.get(fields[2], fields[2])
        if len(fields) >= 4 and fname != "game_object_blocks.csv":
          fields[3] = ARENA_RENAMES.get(fields[3], fields[3])
        out.append(", ".join(fields))
    with open(path, "w", encoding="utf-8") as fh:
      fh.write("\n".join(out) + "\n")


def build_tree(maze, sectors):
  tree = {}
  for key in maze.address_tiles:
    if key.startswith("<"):
      continue
    parts = key.split(":")
    if len(parts) < 3 or parts[1] not in sectors:
      continue
    world, sector, arena = parts[:3]
    objects = tree.setdefault(world, {}).setdefault(sector, {}).setdefault(arena, [])
    if len(parts) == 4 and parts[3] not in objects:
      objects.append(parts[3])
  return tree


def build_base():
  sys.path.insert(0, os.path.join(ROOT, "reverie", "backend_server"))
  os.environ.setdefault("GA_ASSETS", ASSETS)
  from maze import Maze  # noqa: E402  (needs the renamed map on disk)

  maze = Maze(NEW_MAP)
  src_base = os.path.join(STORAGE, SRC_BASE)
  base = os.path.join(STORAGE, NEW_BASE)
  if os.path.isdir(base):
    shutil.rmtree(base)
  for sub in ("reverie", "environment", "personas", "movement"):
    os.makedirs(os.path.join(base, sub))
  with open(os.path.join(src_base, "environment", "0.json"), encoding="utf-8") as fh:
    src_env = json.load(fh)

  env, sprites, names = {}, {}, []
  for (name, first, last, age, sector, arena, original, innate, learned, currently,
       lifestyle, daily_req) in RESIDENTS:
    names.append(name)
    living = f"the Ville:{sector}:{arena}"
    assert f"the Ville:{sector}:{arena}" in maze.address_tiles, living
    if "'s house" in sector:
      assert last in sector, f"{name} would be locked out of {sector}"
    pos = src_env[original]
    env[name] = {"maze": NEW_MAP, "x": pos["x"], "y": pos["y"]}
    sprites[name] = original.replace(" ", "_")

    with open(os.path.join(src_base, "personas", original, "bootstrap_memory", "scratch.json"),
              encoding="utf-8") as fh:
      scratch = json.load(fh)
    scratch.update(name=name, first_name=first, last_name=last, age=age, innate=innate,
                   learned=learned, currently=currently, lifestyle=lifestyle,
                   living_area=living, daily_plan_req=daily_req)
    folder = os.path.join(base, "personas", name, "bootstrap_memory")
    os.makedirs(os.path.join(folder, "associative_memory"))
    with open(os.path.join(folder, "scratch.json"), "w", encoding="utf-8") as fh:
      json.dump(scratch, fh, indent=2, ensure_ascii=False)
    with open(os.path.join(folder, "spatial_memory.json"), "w", encoding="utf-8") as fh:
      json.dump(build_tree(maze, set(PUBLIC) | {sector}), fh, indent=2, ensure_ascii=False)
    am = os.path.join(folder, "associative_memory")
    for fname, data in (("nodes.json", {}), ("embeddings.json", {}),
                        ("kw_strength.json", {"kw_strength_event": {}, "kw_strength_thought": {}})):
      with open(os.path.join(am, fname), "w", encoding="utf-8") as fh:
        json.dump(data, fh)

  meta = {"fork_sim_code": NEW_BASE, "start_date": START, "curr_time": f"{START}, 00:00:00",
          "sec_per_step": 10, "maze_name": NEW_MAP, "persona_names": names, "step": 0,
          "sprites": sprites}
  with open(os.path.join(base, "reverie", "meta.json"), "w", encoding="utf-8") as fh:
    json.dump(meta, fh, indent=2, ensure_ascii=False)
  with open(os.path.join(base, "environment", "0.json"), "w", encoding="utf-8") as fh:
    json.dump(env, fh, indent=2, ensure_ascii=False)
  print(f"Built {base} with {len(names)} residents on map {NEW_MAP}")


if __name__ == "__main__":
  rename_map()
  build_base()
