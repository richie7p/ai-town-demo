"""存檔、讀檔與匯出。存檔就是完整的 WorldState JSON（不含任何 API Key）。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from . import ENGINE_VERSION
from .models import WorldState
from .stats import summarize

SAVE_NAME = re.compile(r"^[\w\-]{1,40}$")


class SaveError(Exception):
    pass


def dump_state(state: WorldState) -> dict:
    return state.model_dump(mode="json")


def load_state(data: dict) -> WorldState:
    version = data.get("version")
    if version is None or version.split(".")[0] != ENGINE_VERSION.split(".")[0]:
        raise SaveError(f"存檔版本 {version} 與目前引擎 {ENGINE_VERSION} 不相容")
    try:
        return WorldState.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        raise SaveError(f"存檔格式錯誤：{exc}") from exc


def save_to_file(state: WorldState, directory: Path, name: str) -> Path:
    if not SAVE_NAME.match(name):
        raise SaveError("存檔名稱只能使用英數字、底線或連字號（最多 40 字）")
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.json"
    path.write_text(json.dumps(dump_state(state), ensure_ascii=False), encoding="utf-8")
    return path


def load_from_file(directory: Path, name: str) -> WorldState:
    if not SAVE_NAME.match(name):
        raise SaveError("存檔名稱不合法")
    path = directory / f"{name}.json"
    if not path.exists():
        raise SaveError(f"找不到存檔「{name}」")
    return load_state(json.loads(path.read_text(encoding="utf-8")))


def list_saves(directory: Path) -> list[dict]:
    if not directory.exists():
        return []
    rows = []
    for path in sorted(directory.glob("*.json")):
        stat = path.stat()
        rows.append({"name": path.stem, "bytes": stat.st_size,
                     "saved_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()})
    return rows


def export_run(state: WorldState) -> dict:
    """研究用匯出：事件紀錄、交易、統計與最終狀態。"""
    return {
        "format": "ai-town-v6-export",
        "engine_version": ENGINE_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "seed": state.seed,
        "mode": state.mode,
        "days": state.days,
        "tick": state.tick,
        "summary": summarize(state),
        "events": [e.model_dump(mode="json") for e in state.events],
        "log": [e.model_dump(mode="json") for e in state.log],
        "transactions": [t.model_dump(mode="json") for t in state.ledger],
        "invitations": [i.model_dump(mode="json") for i in state.invitations.values()],
        "final_state": dump_state(state),
    }
