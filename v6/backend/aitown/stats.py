"""研究用統計：資源、行動次數、社交互動、居民狀態。"""

from __future__ import annotations

from collections import Counter

from .ledger import audit
from .models import WorldState
from .world import day_of, slot_of


def snapshot(state: WorldState) -> dict:
    """每個時段結束後的一筆資源快照（用於折線圖）。"""
    market = state.locations.get("market")
    cafe = state.locations.get("cafe")
    people = list(state.residents.values())
    return {
        "tick": state.tick,
        "money_total": sum(p.money for p in people),
        "market_stock": sum(market.stock.values()) if market else 0,
        "cafe_meals": cafe.stock.get("meal", 0) if cafe else 0,
        "avg_hunger": round(sum(p.needs.hunger for p in people) / len(people), 1),
        "avg_energy": round(sum(p.needs.energy for p in people) / len(people), 1),
        "avg_social": round(sum(p.needs.social for p in people) / len(people), 1),
        "social_total": state.counters.get("social", 0),
    }


def summarize(state: WorldState) -> dict:
    actions = Counter()
    failed = Counter()
    sources = Counter()
    for entry in state.log:
        if entry.action:
            actions[entry.action] += 1
            if not entry.success:
                failed[entry.action] += 1
            sources[entry.source] += 1
    market = state.locations.get("market")
    cafe = state.locations.get("cafe")
    relations = [rel for p in state.residents.values() for rel in p.relations.values()]
    return {
        "tick": state.tick,
        "day": min(day_of(state.tick), state.days),
        "slot": slot_of(state.tick),
        "finished": state.finished,
        "actions": dict(actions),
        "failed_actions": dict(failed),
        "decision_sources": dict(sources),
        "total_actions": sum(actions.values()),
        "social_interactions": state.counters.get("social", 0),
        "chats": state.counters.get("chats", 0),
        "invitations": len(state.invitations),
        "invitations_fulfilled": sum(1 for i in state.invitations.values() if i.status == "fulfilled"),
        "cooperations": state.counters.get("cooperations", 0),
        "events": len(state.events),
        "transactions": len(state.ledger),
        "money_flow": sum(t.total for t in state.ledger),
        "resources": {
            "money_total": sum(p.money for p in state.residents.values()),
            "market_shelf": dict(market.stock) if market else {},
            "market_warehouse": dict(market.warehouse) if market else {},
            "cafe_meals": cafe.stock.get("meal", 0) if cafe else 0,
            "broken_equipment": [f"{l.name}{e.name}" for l in state.locations.values()
                                 for e in l.equipment.values() if not e.working],
        },
        "avg_familiarity": round(sum(r.familiarity for r in relations) / max(1, len(relations)), 1),
        "avg_trust": round(sum(r.trust for r in relations) / max(1, len(relations)), 1),
        "goals_done": sum(1 for p in state.residents.values() if p.goal.done),
        "residents": [
            {"id": p.id, "name": p.name, "location": p.location, "activity": p.activity,
             "money": p.money, **p.needs.model_dump(), "goal_progress": p.goal.progress,
             "goal_target": p.goal.target}
            for p in state.residents.values()
        ],
        "history": state.stats_history,
        "audit": audit(state),
    }
