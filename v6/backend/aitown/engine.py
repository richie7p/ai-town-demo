"""模擬主迴圈：每呼叫一次 step() 推進一個時段。"""

from __future__ import annotations

from typing import Any, Optional

from .actions import Resolver, need
from .agents import make_provider
from .config import NEED_DRIFT, NIGHT, SLEEP_DRIFT, SLOTS
from .events import EventError, end_shortages, morning_delivery, trigger
from .goals import update_goals
from .models import Action, Decision, Invitation, LogEntry, WorldState
from .perception import observe_surroundings, perceive
from .social import clamp, expire_facts, mutual, remember
from .stats import snapshot, summarize
from .world import create_world, day_of, slot_of


class SimulationFinished(Exception):
    pass


class Simulation:
    def __init__(self, seed: int = 20261115, days: int = 3, mode: str = "rule",
                 residents: Optional[list[dict]] = None, schedule: Optional[list] = None,
                 llm_client: Any = None):
        self.residents_spec = residents
        self.schedule_spec = schedule
        self.llm_client = llm_client
        self.reset(seed=seed, days=days, mode=mode)

    # ------------------------------------------------------------------ 生命週期
    def reset(self, seed: Optional[int] = None, days: Optional[int] = None, mode: Optional[str] = None) -> WorldState:
        self.seed = seed if seed is not None else self.seed
        self.days = days if days is not None else self.days
        requested = mode if mode is not None else getattr(self, "requested_mode", "rule")
        self.requested_mode = requested
        self.provider, self.provider_info = make_provider(requested, self.seed, client=self.llm_client)
        self.state = create_world(self.seed, self.days, self.residents_spec, self.schedule_spec,
                                  mode=self.provider.mode)
        self.state.stats_history.append(snapshot(self.state))
        self.state.log.append(self._system(f"世界建立：{len(self.state.residents)} 位居民，"
                                           f"模擬 {self.days} 天，seed={self.seed}，"
                                           f"{'LLM Mode' if self.provider.mode == 'llm' else 'Rule-based Mode'}"))
        return self.state

    def load(self, state: WorldState) -> None:
        self.state = state
        self.seed, self.days = state.seed, state.days
        self.requested_mode = state.mode
        self.provider, self.provider_info = make_provider(state.mode, state.seed, client=self.llm_client)
        self.state.mode = self.provider.mode

    def _system(self, text: str, changes: Optional[list[str]] = None) -> LogEntry:
        s = self.state
        return LogEntry(id=s.new_id("log"), tick=s.tick, day=day_of(s.tick), slot=slot_of(s.tick),
                        kind="system", text=text, changes=changes or [])

    # ------------------------------------------------------------------ 推進
    def step(self) -> list[LogEntry]:
        state = self.state
        if state.finished:
            raise SimulationFinished("模擬已經結束")
        start = len(state.log)
        tick, slot = state.tick, slot_of(state.tick)

        if slot == 0:
            changes = morning_delivery(state)
            state.log.append(self._system(f"第 {day_of(tick)} 天開始。清晨供應商送貨到市場倉庫。", changes))
        end_shortages(state)
        for person in state.residents.values():
            expire_facts(person, tick)

        for scheduled in state.schedule:
            if scheduled.tick == tick and not scheduled.fired:
                scheduled.fired = True
                try:
                    trigger(state, scheduled.type, scheduled.params)
                except EventError as exc:
                    state.log.append(self._system(f"預定事件「{scheduled.type}」沒有發生：{exc}"))

        decisions = self.decide_all()
        resolver = Resolver(state, decisions, self._respond)
        resolver.run()
        resolver.check_meetings()
        self._community_events()
        self._drift(resolver.resting)

        for person in state.residents.values():
            for text in observe_surroundings(state, person):
                remember(person, tick, "observe", text, importance=3)
        for rid in update_goals(state):
            person = state.residents[rid]
            remember(person, tick, "goal", f"達成目標：{person.goal.text}", importance=5)
            state.log.append(LogEntry(id=state.new_id("log"), tick=tick, day=day_of(tick), slot=slot, kind="goal",
                                      actor=rid, text=f"🎯 {person.name}達成個人目標：{person.goal.text}"))

        state.tick += 1
        state.stats_history.append(snapshot(state))
        if state.finished:
            state.log.append(self._system(f"模擬結束：{state.days} 天共 {state.days * 6} 個時段。"))
        return state.log[start:]

    def run(self, slots: Optional[int] = None) -> WorldState:
        remaining = slots if slots is not None else self.state.days * 6 - self.state.tick
        for _ in range(remaining):
            if self.state.finished:
                break
            self.step()
        return self.state

    def decide_all(self) -> dict[str, Decision]:
        decisions: dict[str, Decision] = {}
        for rid in sorted(self.state.residents):
            person = self.state.residents[rid]
            try:
                decision = self.provider.decide(perceive(self.state, rid))
            except Exception as exc:  # noqa: BLE001 — Provider 壞掉時讓居民原地休息，模擬不中斷
                decision = Decision(action=Action(type="rest", location=person.location),
                                    intention="（決策失敗，原地休息）", reasoning=f"引擎：Provider 錯誤 {exc}",
                                    source="engine")
            person.intention = decision.intention
            person.reasoning = decision.reasoning
            person.decision_source = decision.source
            person.fallback_reason = decision.fallback_reason
            decisions[rid] = decision
        return decisions

    def _respond(self, state: WorldState, rid: str, invitation: Invitation) -> tuple[bool, str]:
        return self.provider.respond_invitation(perceive(state, rid), invitation.model_dump())

    def _community_events(self) -> None:
        state = self.state
        for ev in state.events:
            if ev.type != "community_event" or ev.resolved or ev.params.get("at_tick") != state.tick:
                continue
            ev.resolved = True
            host = state.residents.get(ev.params.get("host"))
            attendees = sorted(p.id for p in state.residents.values() if p.location == "plaza")
            changes: list[str] = []
            if host is None or host.id not in attendees:
                text = f"「{ev.title}」的時間到了，但主辦人沒有出現，活動取消"
                success = False
            elif len(attendees) < 2:
                text = f"「{ev.title}」只有{host.name}一個人到場，冷冷清清"
                success = False
            else:
                for i, a in enumerate(attendees):
                    for b in attendees[i + 1:]:
                        changes += mutual(state, a, b, 5, 2)
                for rid in attendees:
                    person = state.residents[rid]
                    need(person, "social", -30, changes)
                    others = [state.residents[o].name for o in attendees if o != rid]
                    remember(person, state.tick, "event", f"參加「{ev.title}」，和{'、'.join(others)}一起度過傍晚",
                             [o for o in attendees if o != rid], 4)
                host.counters["event_attendance"] = max(host.counters.get("event_attendance", 0), len(attendees))
                state.counters["social"] = state.counters.get("social", 0) + 1
                names = "、".join(state.residents[r].name for r in attendees)
                text = f"「{ev.title}」在公共廣場舉行，共 {len(attendees)} 人參加：{names}"
                success = True
            ev.params["attendees"] = attendees
            state.log.append(LogEntry(id=state.new_id("log"), tick=state.tick, day=day_of(state.tick),
                                      slot=slot_of(state.tick), kind="event", actor=host.id if host else None,
                                      targets=attendees, location="plaza", success=success, text=text,
                                      changes=changes))

    def _drift(self, sleeping: set[str]) -> None:
        for person in self.state.residents.values():
            drift = SLEEP_DRIFT if person.id in sleeping else NEED_DRIFT
            for key, delta in drift.items():
                setattr(person.needs, key, clamp(getattr(person.needs, key) + delta))
            if person.needs.hunger >= 95:
                person.needs.energy = clamp(person.needs.energy - 5)

    # ------------------------------------------------------------------ 事件與查詢
    def trigger_event(self, kind: str, params: Optional[dict] = None):
        start = len(self.state.log)
        event = trigger(self.state, kind, params, manual=True)
        for entry in self.state.log[start:]:
            entry.text = entry.text.replace("【突發事件】", "【手動觸發】")
        return event

    def config(self) -> dict:
        return {**self.provider_info, "seed": self.seed, "days": self.days,
                "slots": SLOTS, "night_slot": NIGHT}

    def summary(self) -> dict:
        return summarize(self.state)
