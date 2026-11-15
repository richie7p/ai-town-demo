import pytest

from aitown.events import EventError
from aitown.models import Action

from .conftest import place, scripted_step


def test_market_shortage_empties_stock_and_blocks_purchases(sim):
    sim.state.tick = 1
    place(sim, yu="market")
    sim.trigger_event("market_shortage")
    market = sim.state.locations["market"]
    assert market.stock["bread"] == 0 and market.warehouse["vegetables"] == 0
    assert "shortage:market" in sim.state.residents["chen"].facts  # 老闆會被通知
    assert "shortage:market" in sim.state.residents["yu"].facts  # 在現場的人看到了
    assert "shortage:market" not in sim.state.residents["zhe"].facts  # 不在場的人不知道
    scripted_step(sim, {"yu": Action(type="shop", location="market", item="bread")})
    assert "缺貨" in [e for e in sim.state.log if e.actor == "yu"][-1].reason
    with pytest.raises(EventError):
        sim.trigger_event("market_shortage")


def test_equipment_failure_blocks_work_until_repaired(sim):
    sim.state.tick = 1
    place(sim, lin="cafe")
    sim.trigger_event("equipment_failure", {"location": "cafe", "equipment": "coffee_machine"})
    assert not sim.state.locations["cafe"].equipment["coffee_machine"].working
    scripted_step(sim, {"lin": Action(type="work", location="cafe")})
    assert "故障" in [e for e in sim.state.log if e.actor == "lin"][-1].reason
    sim.state.residents["kai"].location = "cafe"
    scripted_step(sim, {"kai": Action(type="work", location="cafe"), "lin": Action(type="work", location="cafe")})
    assert sim.state.locations["cafe"].equipment["coffee_machine"].working
    assert sim.state.residents["kai"].counters["repairs"] == 1
    assert "parts" not in sim.state.residents["kai"].inventory  # 用掉唯一的零件
    assert all(e.resolved for e in sim.state.events if e.type == "equipment_failure")


def test_community_event_brings_people_together(sim):
    sim.state.tick = 1
    sim.trigger_event("community_event")
    ev = sim.state.events[-1]
    assert ev.params["at_tick"] == 4
    assert any(n.fact_id == ev.params["fact_id"] for n in sim.state.locations["plaza"].notices)
    sim.state.tick = 4
    place(sim, wang="plaza", yu="plaza", zhe="plaza")
    before = sim.state.residents["yu"].relations["zhe"].familiarity
    scripted_step(sim, {rid: Action(type="move", location="plaza") for rid in ("wang", "yu", "zhe")})
    assert ev.resolved and ev.params["attendees"] == ["wang", "yu", "zhe"]
    assert sim.state.residents["yu"].relations["zhe"].familiarity > before
    assert sim.state.residents["wang"].counters["event_attendance"] == 3


def test_default_schedule_changes_the_world_during_a_run():
    from aitown.engine import Simulation

    sim = Simulation(seed=20261115)
    sim.run()
    kinds = {e.type for e in sim.state.events}
    assert kinds == {"equipment_failure", "market_shortage", "community_event"}
    failed_shopping = [e for e in sim.state.log if e.action == "shop" and not e.success]
    repairs = [e for e in sim.state.log if e.action == "work" and "修好" in e.text]
    assert failed_shopping, "缺貨應該讓某些購物失敗"
    assert repairs, "故障的設備應該被修好"
