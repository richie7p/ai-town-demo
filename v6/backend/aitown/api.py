"""FastAPI 介面。前端只透過這些 API 觀察與操作模擬，不會碰到任何 API Key。

啟動：uvicorn aitown.api:app --reload --port 8000
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ENGINE_VERSION
from .engine import Simulation, SimulationFinished
from .events import EventError
from .perception import perceive
from .persistence import (SaveError, dump_state, export_run, list_saves, load_from_file, load_state,
                          save_to_file)

BACKEND_DIR = Path(__file__).resolve().parent.parent
SAVE_DIR = Path(os.environ.get("AI_TOWN_SAVE_DIR", BACKEND_DIR / "saves"))
DIST_DIR = Path(os.environ.get("AI_TOWN_DIST_DIR", BACKEND_DIR.parent / "frontend" / "dist"))


class ResetBody(BaseModel):
    seed: Optional[int] = None
    days: Optional[int] = None
    mode: Optional[Literal["rule", "llm"]] = None


class StepBody(BaseModel):
    count: int = 1


class TriggerBody(BaseModel):
    type: Literal["market_shortage", "equipment_failure", "community_event"]
    params: dict = {}


class SaveBody(BaseModel):
    name: str = "quicksave"


class LoadBody(BaseModel):
    name: Optional[str] = None
    snapshot: Optional[dict] = None


def create_app(simulation: Optional[Simulation] = None) -> FastAPI:
    sim = simulation or Simulation(
        seed=int(os.environ.get("AI_TOWN_SEED", "20261115")),
        mode=os.environ.get("AI_TOWN_MODE", "rule"),
    )
    lock = threading.Lock()
    app = FastAPI(title="AI Town v6.0", version=ENGINE_VERSION)

    def payload(entries=None) -> dict:
        return {
            "config": sim.config(),
            "state": dump_state(sim.state),
            "summary": sim.summary(),
            "new_entries": [e.model_dump(mode="json") for e in (entries or [])],
        }

    @app.get("/api/config")
    def get_config():
        return {**sim.config(), "engine_version": ENGINE_VERSION}

    @app.get("/api/state")
    def get_state():
        with lock:
            return payload()

    @app.post("/api/step")
    def step(body: StepBody = StepBody()):
        with lock:
            if sim.state.finished:
                raise HTTPException(409, "模擬已結束，請重置世界")
            entries = []
            for _ in range(max(1, min(body.count, 36))):
                try:
                    entries += sim.step()
                except SimulationFinished:
                    break
            return payload(entries)

    @app.post("/api/reset")
    def reset(body: ResetBody = ResetBody()):
        with lock:
            if body.days is not None and not 1 <= body.days <= 14:
                raise HTTPException(422, "模擬天數需介於 1~14")
            sim.reset(seed=body.seed, days=body.days, mode=body.mode)
            return payload()

    @app.post("/api/events/trigger")
    def trigger_event(body: TriggerBody):
        with lock:
            start = len(sim.state.log)
            try:
                sim.trigger_event(body.type, body.params)
            except EventError as exc:
                raise HTTPException(409, str(exc)) from exc
            return payload(sim.state.log[start:])

    @app.get("/api/residents/{rid}/perception")
    def resident_perception(rid: str):
        with lock:
            if rid not in sim.state.residents:
                raise HTTPException(404, "找不到這位居民")
            return perceive(sim.state, rid)

    @app.get("/api/saves")
    def saves():
        return list_saves(SAVE_DIR)

    @app.post("/api/save")
    def save(body: SaveBody = SaveBody()):
        with lock:
            try:
                path = save_to_file(sim.state, SAVE_DIR, body.name)
            except SaveError as exc:
                raise HTTPException(422, str(exc)) from exc
            return {"name": body.name, "tick": sim.state.tick, "bytes": path.stat().st_size}

    @app.post("/api/load")
    def load(body: LoadBody):
        with lock:
            try:
                if body.snapshot is not None:
                    state = load_state(body.snapshot)
                elif body.name:
                    state = load_from_file(SAVE_DIR, body.name)
                else:
                    raise SaveError("請提供存檔名稱或存檔內容")
            except SaveError as exc:
                raise HTTPException(422, str(exc)) from exc
            sim.load(state)
            return payload()

    @app.get("/api/export")
    def export():
        with lock:
            data = export_run(sim.state)
        filename = f"ai-town-v6-seed{sim.state.seed}-tick{sim.state.tick}.json"
        return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    if DIST_DIR.exists():
        app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(DIST_DIR / "index.html")

    return app


app = create_app()
