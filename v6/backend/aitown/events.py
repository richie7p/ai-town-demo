"""突發事件：市場缺貨、設備故障、社區活動。

事件會真正改變世界狀態（庫存、設備、廣場聚會），而且只有「在現場」或
「之後聽說」的居民才會知道。
"""

from __future__ import annotations

import random
from typing import Optional

from .config import DAILY_DELIVERY, EVENT_TYPES, ITEMS, SLOTS
from .models import ActiveEvent, Fact, LogEntry, Notice, WorldState
from .social import learn, remember
from .world import day_of, slot_of, tick_of

EVENT_SLOT = 4  # 社區活動固定在傍晚


class EventError(Exception):
    pass


def _log(state: WorldState, text: str, changes: list[str], location: Optional[str] = None,
         targets: Optional[list[str]] = None) -> LogEntry:
    entry = LogEntry(id=state.new_id("log"), tick=state.tick, day=day_of(state.tick), slot=slot_of(state.tick),
                     kind="event", location=location, text=text, changes=changes, targets=targets or [])
    state.log.append(entry)
    return entry


def _witnesses(state: WorldState, location_id: str) -> list[str]:
    return [p.id for p in state.residents.values() if p.location == location_id]


def broken_fact(state: WorldState, location_id: str, equipment_id: str) -> Fact:
    loc = state.locations[location_id]
    eq = loc.equipment[equipment_id]
    return Fact(id=f"broken:{location_id}:{equipment_id}", text=f"{loc.name}的{eq.name}故障了，需要修理",
                learned_tick=state.tick, source="seen", importance=4)


def fixed_fact(state: WorldState, location_id: str, equipment_id: str) -> Fact:
    loc = state.locations[location_id]
    eq = loc.equipment[equipment_id]
    return Fact(id=f"fixed:{location_id}:{equipment_id}:{state.tick}", text=f"{loc.name}的{eq.name}已經修好了",
                learned_tick=state.tick, source="seen", importance=2, expires_tick=state.tick + 12)


def shortage_active(state: WorldState) -> Optional[ActiveEvent]:
    for ev in state.events:
        if ev.type == "market_shortage" and ev.start_tick <= state.tick < ev.end_tick:
            return ev
    return None


def morning_delivery(state: WorldState) -> list[str]:
    """每天清晨供應商把貨送到市場倉庫；缺貨期間麵包與蔬菜送不來。"""
    market = state.locations.get("market")
    if market is None:
        return []
    blocked = shortage_active(state) is not None
    changes = []
    for item, qty in DAILY_DELIVERY.items():
        if blocked and item in ("bread", "vegetables"):
            changes.append(f"供應商今天沒送{ITEMS[item]['name']}（缺貨中）")
            continue
        before = market.warehouse.get(item, 0)
        market.warehouse[item] = before + qty
        changes.append(f"市場倉庫 {ITEMS[item]['name']} {before}→{market.warehouse[item]}")
    return changes


def end_shortages(state: WorldState) -> list[LogEntry]:
    """缺貨結束時供應商補送一批貨，老闆會先知道。"""
    entries = []
    market = state.locations.get("market")
    for ev in state.events:
        if ev.type != "market_shortage" or ev.resolved or state.tick < ev.end_tick or market is None:
            continue
        ev.resolved = True
        changes = []
        for item in ("bread", "vegetables"):
            before = market.warehouse.get(item, 0)
            market.warehouse[item] = before + DAILY_DELIVERY[item]
            changes.append(f"市場倉庫 {ITEMS[item]['name']} {before}→{market.warehouse[item]}")
        if market.owner:
            owner = state.residents[market.owner]
            owner.facts.pop("shortage:market", None)
            remember(owner, state.tick, "event", "供應商終於補貨了，要趕快上架", importance=3)
        entries.append(_log(state, "市場供應恢復：供應商補送了麵包和蔬菜到倉庫（要等陳伯上架才買得到）", changes,
                            location="market"))
    return entries


def trigger(state: WorldState, kind: str, params: Optional[dict] = None, manual: bool = False) -> ActiveEvent:
    params = dict(params or {})
    if kind not in EVENT_TYPES:
        raise EventError(f"未知的事件類型：{kind}")
    if state.finished:
        raise EventError("模擬已結束，請先重置世界")
    handler = {"market_shortage": _market_shortage, "equipment_failure": _equipment_failure,
               "community_event": _community_event}[kind]
    event = handler(state, params)
    if manual:
        event.params["manual"] = True
    state.events.append(event)
    state.counters["events"] = state.counters.get("events", 0) + 1
    return event


def _market_shortage(state: WorldState, params: dict) -> ActiveEvent:
    market = state.locations.get("market")
    if market is None:
        raise EventError("小鎮沒有市場")
    if shortage_active(state):
        raise EventError("市場已經在缺貨中")
    changes = []
    for item in ("bread", "vegetables"):
        for where, store in (("貨架", market.stock), ("倉庫", market.warehouse)):
            before = store.get(item, 0)
            store[item] = 0
            if before:
                changes.append(f"市場{where} {ITEMS[item]['name']} {before}→0")
    # 一直持續到隔天清晨的送貨也被取消為止
    end = tick_of(day_of(state.tick) + 1, 0) + 1
    fact = Fact(id="shortage:market", text="市場的麵包和蔬菜缺貨了，供應商明天清晨也送不來",
                learned_tick=state.tick, source="seen", importance=4, expires_tick=end + 1)
    knowers = set(_witnesses(state, "market"))
    if market.owner:
        knowers.add(market.owner)  # 供應商會直接通知老闆
    for rid in sorted(knowers):
        learn(state.residents[rid], fact, state.tick, "seen" if state.residents[rid].location == "market" else "supplier")
        remember(state.residents[rid], state.tick, "event", "得知市場缺貨，麵包和蔬菜都沒了", importance=4)
    event = ActiveEvent(id=state.new_id("ev"), type="market_shortage", title="市場缺貨",
                        detail="上游供應中斷：貨架與倉庫的麵包、蔬菜全部清空，隔天清晨也不會補貨。",
                        start_tick=state.tick, end_tick=end, location="market")
    _log(state, "【突發事件】市場缺貨！麵包和蔬菜一夕之間全部賣光，供應商通知明天也送不來。",
         changes + [f"知情者：{', '.join(state.residents[r].name for r in sorted(knowers)) or '無'}"],
         location="market", targets=sorted(knowers))
    return event


def _equipment_failure(state: WorldState, params: dict) -> ActiveEvent:
    choices = [(loc.id, eq.id) for loc in state.locations.values() for eq in loc.equipment.values() if eq.working]
    if not choices:
        raise EventError("目前沒有可以故障的設備")
    target = (params.get("location"), params.get("equipment"))
    if target not in choices:
        preferred = [c for c in choices if c[0] == "cafe"]
        if params.get("location") or params.get("equipment") or not preferred or state.counters.get("equipment_failures"):
            rng = random.Random(f"{state.seed}:failure:{state.tick}")
            target = rng.choice(sorted(choices))
        else:
            target = preferred[0]
    loc_id, eq_id = target
    loc = state.locations[loc_id]
    eq = loc.equipment[eq_id]
    eq.working = False
    eq.broken_tick = state.tick
    state.counters["equipment_failures"] = state.counters.get("equipment_failures", 0) + 1
    fact = broken_fact(state, loc_id, eq_id)
    knowers = set(_witnesses(state, loc_id))
    for rid in sorted(knowers):
        learn(state.residents[rid], fact, state.tick, "seen")
        remember(state.residents[rid], state.tick, "event", f"親眼看到{loc.name}的{eq.name}壞掉了", importance=4)
    event = ActiveEvent(id=state.new_id("ev"), type="equipment_failure", title=f"{loc.name}{eq.name}故障",
                        detail=f"{eq.name}突然冒煙停擺，在修好之前{loc.name}的相關工作都無法進行。",
                        start_tick=state.tick, end_tick=state.days * 6, location=loc_id,
                        params={"location": loc_id, "equipment": eq_id})
    _log(state, f"【突發事件】{loc.name}的{eq.name}故障了！在修好之前無法使用。",
         [f"{loc.name} {eq.name}：正常→故障",
          f"目擊者：{', '.join(state.residents[r].name for r in sorted(knowers)) or '無（要等有人來才會發現）'}"],
         location=loc_id, targets=sorted(knowers))
    return event


def _community_event(state: WorldState, params: dict) -> ActiveEvent:
    if "plaza" not in state.locations:
        raise EventError("小鎮沒有公共廣場")
    slot = slot_of(state.tick)
    day = day_of(state.tick) if slot < EVENT_SLOT else day_of(state.tick) + 1
    at_tick = tick_of(day, EVENT_SLOT)
    if at_tick >= state.days * 6:
        raise EventError("剩下的時間不夠舉辦社區活動")
    if any(e.type == "community_event" and not e.resolved for e in state.events):
        raise EventError("已經有一場社區活動在籌備中")
    organizers = [p for p in state.residents.values() if p.job == "organizer"]
    host = organizers[0] if organizers else max(state.residents.values(), key=lambda p: p.traits["sociable"])
    title = params.get("title") or "廣場夏日聚會"
    fact = Fact(id=f"community:{at_tick}", text=f"第 {day} 天{SLOTS[EVENT_SLOT]}在公共廣場有「{title}」，歡迎大家參加",
                learned_tick=state.tick, source=host.id, importance=3, expires_tick=at_tick + 1)
    learn(host, fact, state.tick, "organizer")
    remember(host, state.tick, "event", f"決定在第 {day} 天傍晚辦「{title}」，要記得邀請大家", importance=4)
    plaza = state.locations["plaza"]
    plaza.notices.append(Notice(fact_id=fact.id, text=fact.text, posted_tick=state.tick, by=host.id))
    knowers = {host.id}
    for rid in _witnesses(state, "plaza"):
        if learn(state.residents[rid], fact, state.tick, "board"):
            knowers.add(rid)
    event = ActiveEvent(id=state.new_id("ev"), type="community_event", title=title,
                        detail=f"由{host.name}發起，第 {day} 天{SLOTS[EVENT_SLOT]}在公共廣場舉行。消息要靠公告欄和口耳相傳。",
                        start_tick=state.tick, end_tick=at_tick + 1, location="plaza",
                        params={"at_tick": at_tick, "host": host.id, "fact_id": fact.id})
    _log(state, f"【社區活動】{host.name}宣布第 {day} 天{SLOTS[EVENT_SLOT]}在公共廣場舉辦「{title}」，公告已貼上公告欄。",
         [f"公告欄 +1 則公告", f"知情者：{', '.join(state.residents[r].name for r in sorted(knowers))}"],
         location="plaza", targets=sorted(knowers))
    return event
