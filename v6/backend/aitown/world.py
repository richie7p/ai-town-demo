"""建立初始世界。同一組 seed 與居民名單永遠產生相同的初始狀態。"""

from __future__ import annotations

import copy
import math
from typing import Optional

from . import ENGINE_VERSION
from .config import (
    DAILY_DELIVERY,
    DEFAULT_DAYS,
    DEFAULT_SCHEDULE,
    INITIAL_RELATIONS,
    JOBS,
    LOCATIONS,
    RESIDENTS,
    SLOTS,
    SLOTS_PER_DAY,
)
from .models import (
    Equipment,
    Goal,
    Location,
    Needs,
    Relation,
    Resident,
    ScheduledEvent,
    WorldState,
)


def slot_of(tick: int) -> int:
    return tick % SLOTS_PER_DAY


def day_of(tick: int) -> int:
    return tick // SLOTS_PER_DAY + 1


def tick_of(day: int, slot: int) -> int:
    return (day - 1) * SLOTS_PER_DAY + slot


def clock_label(tick: int) -> str:
    return f"第 {day_of(tick)} 天 {SLOTS[slot_of(tick)]}"


def _home_position(index: int, total: int) -> tuple[int, int]:
    """住宅排在地圖左側，多於 6 戶時自動往下排。"""
    per_row = 3 if total <= 6 else math.ceil(total / 4)
    col, row = index % per_row, index // per_row
    return 75 + col * 105, 120 + row * 125


def create_world(
    seed: int = 20261115,
    days: int = DEFAULT_DAYS,
    residents: Optional[list[dict]] = None,
    schedule: Optional[list[tuple[int, int, str]]] = None,
    mode: str = "rule",
) -> WorldState:
    roster = copy.deepcopy(residents if residents is not None else RESIDENTS)
    ids = [r["id"] for r in roster]
    if len(set(ids)) != len(ids):
        raise ValueError("居民 id 不可重複")

    owner_jobs = {"market": "grocer", "cafe": "barista", "workshop": "carpenter"}

    def owner_for(loc_id: str, default: Optional[str]) -> Optional[str]:
        if default in ids:
            return default
        job = owner_jobs.get(loc_id)
        return next((r["id"] for r in roster if r["job"] == job), None)

    locations: dict[str, Location] = {}
    for loc_id, spec in LOCATIONS.items():
        locations[loc_id] = Location(
            id=loc_id,
            name=spec["name"],
            kind=spec["kind"],
            owner=owner_for(loc_id, spec["owner"]),
            open_slots=list(spec["open"]),
            x=spec["x"], y=spec["y"], w=spec["w"], h=spec["h"],
            equipment={k: Equipment(id=k, name=v) for k, v in spec["equipment"].items()},
        )
    market = locations["market"]
    market.stock = {"bread": 8, "vegetables": 6, "wood": 6, "parts": 3}
    market.warehouse = dict(DAILY_DELIVERY)
    locations["cafe"].stock = {"meal": 4}

    people: dict[str, Resident] = {}
    for i, spec in enumerate(roster):
        home_id = f"home_{spec['id']}"
        hx, hy = _home_position(i, len(roster))
        locations[home_id] = Location(
            id=home_id, name=f"{spec['name']}的家", kind="home", owner=spec["id"],
            open_slots=list(range(SLOTS_PER_DAY)), x=hx, y=hy, w=84, h=78,
        )
        job = JOBS[spec["job"]]
        people[spec["id"]] = Resident(
            id=spec["id"], name=spec["name"], job=spec["job"], occupation=job["title"],
            color=spec.get("color", "#999999"), personality=list(spec["personality"]),
            traits=dict(spec["traits"]), bio=spec["bio"], home=home_id,
            location=home_id, prev_location=home_id,
            needs=Needs(**spec["needs"]), money=spec["money"],
            inventory={k: v for k, v in spec["inventory"].items() if v > 0},
            goal=Goal(**spec["goal"]),
            intention="剛起床，準備開始新的一天",
            reasoning="尚未做出決策",
            counters={},
        )

    for a, b, familiarity, trust in INITIAL_RELATIONS:
        if a in people and b in people:
            for x, y in ((a, b), (b, a)):
                people[x].relations[y] = Relation(familiarity=familiarity, trust=trust)
    for person in people.values():
        for other in people:
            if other != person.id and other not in person.relations:
                person.relations[other] = Relation()

    plan = schedule if schedule is not None else DEFAULT_SCHEDULE
    events = [
        ScheduledEvent(tick=tick_of(day, slot), type=kind)
        for day, slot, kind in plan
        if tick_of(day, slot) < days * SLOTS_PER_DAY
    ]

    state = WorldState(
        version=ENGINE_VERSION, seed=seed, days=days, mode=mode,
        residents=people, locations=locations, schedule=events,
    )
    return state
