"""
用中文整理一次模擬的結果：進度、API 呼叫與花費、對話紀錄、每位居民最後在做什麼。

  python scripts/summarize_run.py <模擬名稱> [--out 報告.md]

讀取 GA_STORAGE（預設 environment/frontend_server/storage）底下的
run_status.json、usage.jsonl 與 movement_log/。
"""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_STORAGE = os.path.join(ROOT, "environment", "frontend_server", "storage")

TASK_NAMES = {
  "event_poignancy": "事件重要性評分", "chat_poignancy": "對話重要性評分",
  "thought_poignancy": "想法重要性評分", "pronunciatio": "動作表情符號",
  "event_triple": "動作描述", "action_sector": "選擇地點", "action_arena": "選擇房間",
  "action_game_object": "選擇物件", "act_obj_desc": "物件狀態", "act_obj_event_triple": "物件描述",
  "generate_iterative_chat_utt": "對話內容", "agent_chat_summarize_relationship": "整理彼此關係",
  "decide_to_talk": "決定要不要聊天", "decide_to_react": "決定要不要等待",
  "new_decomp_schedule": "對話後重排行程", "planning_thought_on_convo": "對話後的計畫",
  "memo_on_convo": "對話後的心得", "summarize_conversation": "對話摘要",
  "generate_hourly_schedule": "每小時行程", "task_decomp": "拆解工作",
  "daily_plan": "每日計畫", "wake_up_hour": "起床時間", "focal_pt": "反思主題",
  "insight_and_guidance": "反思心得", "revise_identity": "每日近況更新",
}


def read_movement(folder):
  rows = []
  log_dir = os.path.join(folder, "movement_log")
  if not os.path.isdir(log_dir):
    return rows
  for name in sorted(os.listdir(log_dir)):
    opener = gzip.open if name.endswith(".gz") else open
    with opener(os.path.join(log_dir, name), "rt", encoding="utf-8") as fh:
      rows += [json.loads(line) for line in fh if line.strip()]
  return rows


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("sim")
  ap.add_argument("--out")
  args = ap.parse_args()
  storage = os.environ.get("GA_STORAGE") or DEFAULT_STORAGE
  folder = os.path.join(storage, args.sim)
  lines = [f"# 模擬報告：{args.sim}", ""]

  status_path = os.path.join(folder, "run_status.json")
  if os.path.exists(status_path):
    st = json.load(open(status_path, encoding="utf-8"))
    state = {"running": "執行中", "finished": "已完成", "paused": "已暫停", "stopped": "已停止",
             "budget_reached": "已達花費上限", "crashed": "當機（會從存檔接續）",
             "fatal_error": "設定錯誤而停止"}.get(st["state"], st["state"])
    llm = st.get("llm", {})
    lines += [
      f"- 狀態：{state}", f"- 模擬時間：{st['sim_time']}（第 {st['sim_day']} 天，目標 {st['target_day']} 天）",
      f"- 居民：{st['personas']} 位", f"- 現實執行時間：{st['wall_seconds'] / 3600:.2f} 小時",
      f"- API：{llm.get('calls', 0)} 次生成、{llm.get('embed_calls', 0)} 次文字向量、"
      f"失敗 {llm.get('failures', 0)} 次", f"- 依設定價格計算的花費：${llm.get('cost_usd', 0):.2f}", ""]

  usage_path = os.path.join(folder, "usage.jsonl")
  if os.path.exists(usage_path):
    by_task = collections.defaultdict(lambda: [0, 0.0, 0, 0.0])
    with open(usage_path, encoding="utf-8") as fh:
      for line in fh:
        r = json.loads(line)
        t = by_task[r["task"]]
        t[0] += 1; t[1] += r["usd"]; t[2] += r["out"]; t[3] += r["sec"]
    lines += ["## API 呼叫（依類型）", "", "| 類型 | 次數 | 花費 | 平均輸出 token | 平均秒數 |", "|---|---|---|---|---|"]
    for task, (n, usd, out, sec) in sorted(by_task.items(), key=lambda x: -x[1][0]):
      lines.append(f"| {TASK_NAMES.get(task, task)} | {n} | ${usd:.4f} | {out / n:.0f} | {sec / n:.1f} |")
    lines.append("")

  rows = read_movement(folder)
  if rows:
    seen, convos = set(), []
    for r in rows:
      for name, v in r["persona"].items():
        chat = v.get("chat")
        if chat:
          key = tuple(tuple(x) for x in chat)
          if key not in seen:
            seen.add(key)
            convos.append((r["time"], chat))
    lines += [f"## 對話（共 {len(convos)} 段）", ""]
    for when, chat in convos[-30:]:
      lines.append(f"**{when}**")
      for speaker, text in chat:
        lines.append(f"- {speaker}：{text}")
      lines.append("")
    last = rows[-1]
    lines += [f"## 每位居民最後的狀態（{last['time']}）", ""]
    for name, v in last["persona"].items():
      desc = v["description"].replace("@ the Ville:", "@ ")
      lines.append(f"- {v.get('pronunciatio') or ''} **{name}**：{desc}")
    lines.append("")

  report = "\n".join(lines)
  print(report)
  if args.out:
    with open(args.out, "w", encoding="utf-8") as fh:
      fh.write(report)


if __name__ == "__main__":
  main()
