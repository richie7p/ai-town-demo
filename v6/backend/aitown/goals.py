"""個人長期目標的進度，完全由世界狀態計算，不由 Agent 自己宣稱。"""

from __future__ import annotations

from .models import Resident, WorldState
from .social import friends_count


def goal_progress(state: WorldState, person: Resident) -> int:
    goal = person.goal
    if goal.kind == "money":
        return person.money
    if goal.kind == "friends":
        return friends_count(person)
    if goal.kind == "counter":
        return person.counters.get(goal.counter or "", 0)
    if goal.kind == "event":
        return person.counters.get("event_attendance", 0)
    return 0


def update_goals(state: WorldState) -> list[str]:
    reached = []
    for person in state.residents.values():
        progress = goal_progress(state, person)
        person.goal.progress = progress
        if not person.goal.done and progress >= person.goal.target:
            person.goal.done = True
            reached.append(person.id)
    return reached
