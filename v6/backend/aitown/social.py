"""記憶、知識與人際關係。所有社交後果都經過這裡，方便統一記錄。"""

from __future__ import annotations

from typing import Optional

from .models import Fact, Memory, Relation, Resident, WorldState

MEMORY_LIMIT = 60


def clamp(value: float, low: int = 0, high: int = 100) -> int:
    return int(max(low, min(high, round(value))))


def remember(person: Resident, tick: int, kind: str, text: str,
             with_ids: Optional[list[str]] = None, importance: int = 1) -> None:
    person.memories.append(
        Memory(tick=tick, kind=kind, text=text, with_ids=list(with_ids or []), importance=importance)
    )
    if len(person.memories) > MEMORY_LIMIT:
        # 優先遺忘最舊且最不重要的記憶
        drop = min(range(len(person.memories) - 10),
                   key=lambda i: (person.memories[i].importance, person.memories[i].tick))
        person.memories.pop(drop)


def learn(person: Resident, fact: Fact, tick: int, source: str) -> bool:
    """居民得知一件事。回傳是否為新知識。"""
    if fact.id in person.facts:
        return False
    if fact.id.startswith("broken:"):
        key = fact.id.removeprefix("broken:")
        fixed = [f for f in person.facts if f.startswith(f"fixed:{key}:")]
        if fixed and source != "seen":
            return False  # 已經知道修好了，舊消息不採信
        for fid in fixed:
            person.facts.pop(fid)
    if fact.id.startswith("fixed:"):
        loc, eq = fact.id.split(":")[1:3]
        person.facts.pop(f"broken:{loc}:{eq}", None)
    person.facts[fact.id] = fact.model_copy(update={"learned_tick": tick, "source": source})
    return True


def forget(person: Resident, fact_id: str) -> None:
    person.facts.pop(fact_id, None)


def expire_facts(person: Resident, tick: int) -> None:
    for fid in [f.id for f in person.facts.values() if f.expires_tick is not None and f.expires_tick <= tick]:
        person.facts.pop(fid)


def adjust_relation(state: WorldState, a: str, b: str, familiarity: int = 0, trust: int = 0,
                    interaction: bool = True) -> list[str]:
    """單向調整 a 對 b 的關係，回傳可讀的變化描述。"""
    person = state.residents[a]
    rel = person.relations.setdefault(b, Relation())
    before_f, before_t = rel.familiarity, rel.trust
    rel.familiarity = clamp(rel.familiarity + familiarity)
    rel.trust = clamp(rel.trust + trust)
    if interaction:
        rel.interactions += 1
        rel.last_tick = state.tick
    other = state.residents[b].name
    changes = []
    if rel.familiarity != before_f:
        changes.append(f"{person.name}→{other} 熟悉度 {before_f}→{rel.familiarity}")
    if rel.trust != before_t:
        changes.append(f"{person.name}→{other} 信任 {before_t}→{rel.trust}")
    return changes


def mutual(state: WorldState, a: str, b: str, familiarity: int, trust: int) -> list[str]:
    return adjust_relation(state, a, b, familiarity, trust) + adjust_relation(state, b, a, familiarity, trust)


def shareable_fact(speaker: Resident, listener: Resident) -> Optional[Fact]:
    """說話者挑一件對方還不知道、最重要的事情分享。"""
    candidates = [f for f in speaker.facts.values() if f.id not in listener.facts]
    if not candidates:
        return None
    return max(candidates, key=lambda f: (f.importance, f.learned_tick))


def friends_count(person: Resident, threshold: int = 40) -> int:
    return sum(1 for rel in person.relations.values() if rel.familiarity >= threshold)
