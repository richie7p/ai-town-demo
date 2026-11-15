import json

from aitown.engine import Simulation
from aitown.persistence import dump_state, export_run, load_from_file, load_state, save_to_file
from aitown.perception import perceive
from aitown.world import create_world


def test_reset_restores_the_initial_world():
    sim = Simulation(seed=42)
    fresh = dump_state(sim.state)
    sim.run(3)
    sim.trigger_event("market_shortage")
    sim.run(4)
    assert dump_state(sim.state) != fresh
    sim.reset()
    assert dump_state(sim.state) == fresh


def test_reset_with_new_seed_matches_create_world():
    sim = Simulation(seed=1)
    sim.run(3)
    sim.reset(seed=99)
    assert sim.state.seed == 99 and sim.state.tick == 0
    expected = create_world(seed=99)
    assert dump_state(sim.state)["residents"] == dump_state(expected)["residents"]


def test_save_and_load_continue_identically(tmp_path):
    sim = Simulation(seed=8)
    sim.run(5)
    save_to_file(sim.state, tmp_path, "mid")
    sim.run(6)
    after = dump_state(sim.state)

    other = Simulation(seed=1)
    other.load(load_from_file(tmp_path, "mid"))
    assert other.state.tick == 5
    other.run(6)
    assert dump_state(other.state) == after


def test_snapshot_round_trips_through_json():
    sim = Simulation(seed=8)
    sim.run(4)
    data = json.loads(json.dumps(dump_state(sim.state)))
    assert dump_state(load_state(data)) == dump_state(sim.state)
    exported = export_run(sim.state)
    assert exported["format"] == "ai-town-v6-export" and exported["log"]


def test_perception_is_not_omniscient():
    sim = Simulation(seed=8)
    sim.run(2)
    p = perceive(sim.state, "yu")
    text = json.dumps(p, ensure_ascii=False)
    # 自己的狀態看得到
    assert p["self"]["money"] == sim.state.residents["yu"].money
    # 別人的需求、金錢、背包、記憶都看不到
    for person in p["here"]["people"]:
        assert set(person) == {"id", "name", "occupation", "doing"}
    for row in p["directory"]:
        assert not {"money", "needs", "inventory", "memories", "facts"} & set(row)
    assert all(m["kind"] != "home" or m["owner"] == "yu" for m in p["map"])
    assert "陳伯的家" not in text  # 別人家的內部不在可見地圖上
    # 不在市場就看不到貨架；別人的記憶不會出現
    sim.state.residents["yu"].location = "plaza"
    p = perceive(sim.state, "yu")
    assert "shelf" not in p["here"]
    chen_memory = sim.state.residents["chen"].memories[-1].text if sim.state.residents["chen"].memories else None
    if chen_memory:
        assert all(m["text"] != chen_memory or "yu" in m["with_ids"] for m in p["memories"])
