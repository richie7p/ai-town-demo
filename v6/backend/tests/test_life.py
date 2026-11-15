from aitown.engine import Simulation
from aitown.ledger import audit


def test_residents_complete_a_basic_daily_life_cycle():
    sim = Simulation(seed=20261115)
    sim.run()
    state = sim.state
    assert state.finished and state.tick == 18
    for rid, person in state.residents.items():
        for day in (1, 2, 3):
            mine = [e for e in state.log if e.actor == rid and e.day == day and e.success]
            assert any(e.action == "eat" for e in mine), f"{person.name} 第 {day} 天沒吃東西"
            night = [e for e in mine if e.slot == 5]
            assert night and night[0].action == "rest", f"{person.name} 第 {day} 天晚上沒睡覺"
        assert any(e.actor == rid and e.action in ("work", "cooperate") and e.success for e in state.log), \
            f"{person.name} 三天都沒工作"
        for value in person.needs.model_dump().values():
            assert 0 <= value <= 100
        assert person.location == person.home  # 最後一個時段大家都回家睡了
    assert audit(state) == []


def test_every_decision_is_labelled_and_rule_mode_never_claims_llm():
    sim = Simulation(seed=3)
    sim.run()
    actions = [e for e in sim.state.log if e.action]
    assert actions and all(e.source == "rule" for e in actions)
    assert all(p.reasoning.startswith("規則：") for p in sim.state.residents.values())
    assert sim.config()["mode"] == "rule"


def test_same_seed_is_deterministic_and_different_seeds_diverge():
    a, b, c = Simulation(seed=11), Simulation(seed=11), Simulation(seed=12)
    for sim in (a, b, c):
        sim.run()
    texts = lambda s: [(e.tick, e.text) for e in s.state.log]  # noqa: E731
    assert texts(a) == texts(b)
    assert texts(a) != texts(c)


def test_simulation_supports_twelve_residents():
    from aitown.config import RESIDENTS

    roster = []
    for i in range(12):
        base = dict(RESIDENTS[i % 6])
        base["id"] = f"{base['id']}{i}"
        base["name"] = f"{base['name']}{i}"
        roster.append(base)
    sim = Simulation(seed=5, residents=roster)
    assert len(sim.state.residents) == 12
    assert len([l for l in sim.state.locations.values() if l.kind == "home"]) == 12
    sim.run()
    assert sim.state.finished
    assert audit(sim.state) == []
