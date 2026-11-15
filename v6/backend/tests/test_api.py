from fastapi.testclient import TestClient

from aitown import api
from aitown.engine import Simulation


def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "SAVE_DIR", tmp_path)
    return TestClient(api.create_app(Simulation(seed=5)))


def test_state_step_reset(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    data = client.get("/api/state").json()
    assert data["config"]["mode"] == "rule"
    assert len(data["state"]["residents"]) == 6
    assert "ANTHROPIC" not in str(data["config"].get("model"))
    stepped = client.post("/api/step", json={"count": 2}).json()
    assert stepped["state"]["tick"] == 2 and stepped["new_entries"]
    reset = client.post("/api/reset", json={"seed": 9}).json()
    assert reset["state"]["tick"] == 0 and reset["state"]["seed"] == 9


def test_trigger_save_load_export(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    res = client.post("/api/events/trigger", json={"type": "market_shortage"})
    assert res.status_code == 200
    assert res.json()["state"]["locations"]["market"]["stock"]["bread"] == 0
    assert client.post("/api/events/trigger", json={"type": "market_shortage"}).status_code == 409
    client.post("/api/step")
    assert client.post("/api/save", json={"name": "demo"}).status_code == 200
    assert [s["name"] for s in client.get("/api/saves").json()] == ["demo"]
    client.post("/api/step", json={"count": 3})
    loaded = client.post("/api/load", json={"name": "demo"}).json()
    assert loaded["state"]["tick"] == 1
    assert client.post("/api/save", json={"name": "../evil"}).status_code == 422
    export = client.get("/api/export")
    assert export.headers["content-disposition"].startswith("attachment")
    assert export.json()["format"] == "ai-town-v6-export"
    perception = client.get("/api/residents/yu/perception").json()
    assert perception["self"]["id"] == "yu"


def test_finished_simulation_refuses_more_steps(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    client.post("/api/step", json={"count": 36})
    assert client.post("/api/step").status_code == 409
