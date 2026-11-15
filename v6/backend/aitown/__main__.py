"""命令列入口。

  python -m aitown serve [--port 8000]          啟動 API（與建置好的前端）
  python -m aitown run --seed 1 --days 3 --out run.json
                                               不開畫面直接跑完一次實驗並匯出 JSON
"""

from __future__ import annotations

import argparse
import json


def main() -> None:
    parser = argparse.ArgumentParser(prog="aitown")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="啟動 API 伺服器")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    run = sub.add_parser("run", help="無畫面執行一次完整模擬")
    run.add_argument("--seed", type=int, default=20261115)
    run.add_argument("--days", type=int, default=3)
    run.add_argument("--mode", choices=["rule", "llm"], default="rule")
    run.add_argument("--out", default=None)
    args = parser.parse_args()

    if args.command == "serve":
        import uvicorn

        uvicorn.run("aitown.api:app", host=args.host, port=args.port)
        return

    from .engine import Simulation
    from .persistence import export_run

    sim = Simulation(seed=args.seed, days=args.days, mode=args.mode)
    sim.run()
    summary = sim.summary()
    print(f"模式：{sim.provider_info['mode']}（{sim.provider_info['reason']}）")
    print(f"行動 {summary['total_actions']} 次，失敗 {sum(summary['failed_actions'].values())} 次，"
          f"社交互動 {summary['social_interactions']} 次，事件 {summary['events']} 個，"
          f"達成目標 {summary['goals_done']}/{len(sim.state.residents)} 人")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(export_run(sim.state), fh, ensure_ascii=False, indent=1)
        print(f"已匯出：{args.out}")


if __name__ == "__main__":
    main()
