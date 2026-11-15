"""每位居民各自的觀察（非全知視角）。

perceive() 產生的字典就是 Agent 唯一能看到的資訊：
- 自己的狀態、記憶、知識、人際關係、邀約
- 目前所在地點能直接看到的東西（在場的人、貨架、設備、公告欄）
- 小鎮的公開資訊（地圖、營業時間、價格、大家的職業與工作地點）
看不到：其他人的需求、金錢、背包、記憶，以及不在場地點的即時狀態。
"""

from __future__ import annotations

from .config import ITEMS, JOBS, SLOT_TIMES, SLOTS
from .events import broken_fact, shortage_active
from .goals import goal_progress
from .models import Fact, Resident, WorldState
from .social import learn
from .world import day_of, slot_of


def location_open(state: WorldState, location_id: str, slot: int) -> bool:
    loc = state.locations.get(location_id)
    return bool(loc) and slot in loc.open_slots


def public_directory(state: WorldState) -> list[dict]:
    """鎮上人人都知道的公開資訊：誰做什麼、通常在哪裡工作。"""
    rows = []
    for p in state.residents.values():
        job = JOBS[p.job]
        rows.append({"id": p.id, "name": p.name, "occupation": p.occupation,
                     "workplaces": [p.home if s == "home" else s for s in job["sites"]],
                     "work_slots": [SLOTS[s] for s in job["slots"]], "home": p.home})
    return rows


def perceive(state: WorldState, rid: str) -> dict:
    me = state.residents[rid]
    slot = slot_of(state.tick)
    here = state.locations[me.location]
    present = [p for p in state.residents.values() if p.location == me.location and p.id != rid]
    visible_here: dict = {
        "id": here.id, "name": here.name, "kind": here.kind, "open_now": slot in here.open_slots,
        "people": [{"id": p.id, "name": p.name, "occupation": p.occupation, "doing": p.activity}
                   for p in present],
        "equipment": [{"id": e.id, "name": e.name, "working": e.working} for e in here.equipment.values()],
    }
    if here.kind == "market":
        visible_here["shelf"] = {k: v for k, v in here.stock.items()}
    if here.kind == "cafe":
        visible_here["meals_left"] = here.stock.get("meal", 0)
    if here.kind == "plaza":
        visible_here["notice_board"] = [n.text for n in here.notices[-5:]]

    my_invites = []
    for inv in state.invitations.values():
        if rid not in (inv.by, inv.to) or inv.status not in ("pending", "accepted"):
            continue
        other = inv.to if inv.by == rid else inv.by
        my_invites.append({
            "id": inv.id, "from_me": inv.by == rid, "with": other, "with_name": state.residents[other].name,
            "location": inv.location, "day": inv.day, "slot": inv.slot, "slot_name": SLOTS[inv.slot],
            "tick": (inv.day - 1) * 6 + inv.slot, "purpose": inv.purpose, "status": inv.status,
        })

    return {
        "time": {"tick": state.tick, "day": day_of(state.tick), "slot": slot, "slot_name": SLOTS[slot],
                 "clock": SLOT_TIMES[slot], "days_total": state.days, "slots": SLOTS},
        "self": {
            "id": me.id, "name": me.name, "occupation": me.occupation, "job": me.job,
            "personality": me.personality, "traits": me.traits, "bio": me.bio,
            "home": me.home, "location": me.location,
            "needs": me.needs.model_dump(), "money": me.money, "inventory": dict(me.inventory),
            "goal": me.goal.model_dump(), "goal_progress": goal_progress(state, me),
            "counters": dict(me.counters), "last_result": me.last_result,
            "job_sites": [me.home if s == "home" else s for s in JOBS[me.job]["sites"]],
            "work_slots": JOBS[me.job]["slots"],
        },
        "here": visible_here,
        "map": [{"id": l.id, "name": l.name, "kind": l.kind, "owner": l.owner, "open_slots": l.open_slots,
                 "open_now": slot in l.open_slots} for l in state.locations.values()
                if l.kind != "home" or l.owner == rid],
        "prices": {k: v["price"] for k, v in ITEMS.items()},
        "directory": public_directory(state),
        "facts": [f.model_dump() for f in sorted(me.facts.values(), key=lambda f: -f.importance)],
        "beliefs": me.beliefs,
        "relations": {oid: {"name": state.residents[oid].name, **rel.model_dump()}
                      for oid, rel in me.relations.items() if oid in state.residents},
        "memories": [m.model_dump() for m in me.memories[-8:]],
        "invitations": my_invites,
    }


def observe_surroundings(state: WorldState, person: Resident) -> list[str]:
    """居民在時段結束時看到身邊的事物，更新信念與知識。回傳新知道的事。"""
    loc = state.locations[person.location]
    learned = []
    beliefs = person.beliefs
    seen = beliefs.setdefault("seen", {})
    for other in state.residents.values():
        if other.id != person.id and other.location == person.location:
            seen[other.id] = {"location": loc.id, "tick": state.tick}
    for eq in loc.equipment.values():
        if not eq.working:
            fact = broken_fact(state, loc.id, eq.id)
            if learn(person, fact, state.tick, "seen"):
                learned.append(fact.text)
    if loc.kind == "market":
        beliefs["market_stock"] = {"tick": state.tick, **loc.stock}
        if shortage_active(state):
            fact = Fact(id="shortage:market", text="市場的麵包和蔬菜缺貨了", learned_tick=state.tick,
                        source="seen", importance=4, expires_tick=shortage_active(state).end_tick + 1)
            if learn(person, fact, state.tick, "seen"):
                learned.append(fact.text)
        elif "shortage:market" in person.facts:
            person.facts.pop("shortage:market")
    if loc.kind == "cafe":
        beliefs["cafe_meals"] = {"tick": state.tick, "meals": loc.stock.get("meal", 0)}
    if loc.kind == "plaza":
        for notice in loc.notices:
            fact = Fact(id=notice.fact_id, text=notice.text, learned_tick=state.tick, source="board",
                        importance=3 if notice.fact_id.startswith("community") else 2)
            if notice.fact_id.startswith("community:"):
                fact.expires_tick = int(notice.fact_id.split(":")[1]) + 1
                if fact.expires_tick <= state.tick:
                    continue
            if notice.fact_id.startswith("shortage") and not shortage_active(state):
                continue
            if notice.fact_id.startswith("broken:"):
                _, lid, eid = notice.fact_id.split(":")
                if state.locations[lid].equipment[eid].working:
                    continue
            if learn(person, fact, state.tick, "board"):
                learned.append(f"從公告欄得知：{fact.text}")
    return learned
