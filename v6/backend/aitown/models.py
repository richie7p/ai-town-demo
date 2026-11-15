"""世界狀態的資料結構（Pydantic，可直接序列化成 JSON 存檔）。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ActionType = Literal["move", "work", "rest", "eat", "shop", "chat", "invite", "cooperate"]
DecisionSource = Literal["rule", "llm", "llm_fallback", "engine"]


class Needs(BaseModel):
    hunger: int = 30  # 0 飽 ~ 100 極餓
    energy: int = 80  # 0 精疲力盡 ~ 100 精神飽滿
    social: int = 30  # 0 滿足 ~ 100 很孤單


class Goal(BaseModel):
    kind: Literal["money", "friends", "counter", "event"]
    target: int
    text: str
    counter: Optional[str] = None
    progress: int = 0
    done: bool = False


class Relation(BaseModel):
    familiarity: int = 0  # 0~100
    trust: int = 30  # 0~100
    interactions: int = 0
    last_tick: Optional[int] = None


class Memory(BaseModel):
    tick: int
    kind: str
    text: str
    with_ids: list[str] = Field(default_factory=list)
    importance: int = 1  # 1~5


class Fact(BaseModel):
    """居民「知道」的一件事。資訊只會透過親眼看到、公告欄或聊天傳播。"""

    id: str
    text: str
    learned_tick: int
    source: str  # "seen" / "board" / 居民 id
    importance: int = 2
    expires_tick: Optional[int] = None


class Equipment(BaseModel):
    id: str
    name: str
    working: bool = True
    broken_tick: Optional[int] = None


class Notice(BaseModel):
    fact_id: str
    text: str
    posted_tick: int
    by: str


class Location(BaseModel):
    id: str
    name: str
    kind: Literal["home", "market", "cafe", "workshop", "plaza"]
    owner: Optional[str] = None
    open_slots: list[int]
    x: int
    y: int
    w: int
    h: int
    equipment: dict[str, Equipment] = Field(default_factory=dict)
    stock: dict[str, int] = Field(default_factory=dict)
    warehouse: dict[str, int] = Field(default_factory=dict)
    notices: list[Notice] = Field(default_factory=list)


class Action(BaseModel):
    """Agent 提出的結構化行動。引擎驗證後才會改變世界。"""

    type: ActionType
    location: str
    target: Optional[str] = None
    item: Optional[str] = None
    quantity: int = 1
    invite_location: Optional[str] = None
    invite_day: Optional[int] = None
    invite_slot: Optional[int] = None
    purpose: Optional[Literal["meal", "event", "help"]] = None
    say: Optional[str] = None


class Decision(BaseModel):
    action: Action
    intention: str  # 當前短期目標（顯示在 UI 上）
    reasoning: str  # 決策理由（規則型會標明是規則）
    source: DecisionSource = "rule"
    fallback_reason: Optional[str] = None


class Resident(BaseModel):
    id: str
    name: str
    job: str
    occupation: str
    color: str
    personality: list[str]
    traits: dict[str, float]
    bio: str
    home: str
    location: str
    prev_location: str
    needs: Needs
    money: int
    inventory: dict[str, int] = Field(default_factory=dict)
    goal: Goal
    intention: str = ""
    reasoning: str = ""
    decision_source: DecisionSource = "rule"
    fallback_reason: Optional[str] = None
    activity: str = "起床"
    last_action: Optional[Action] = None
    last_result: str = ""
    last_success: bool = True
    memories: list[Memory] = Field(default_factory=list)
    facts: dict[str, Fact] = Field(default_factory=dict)
    beliefs: dict[str, dict] = Field(default_factory=dict)
    relations: dict[str, Relation] = Field(default_factory=dict)
    counters: dict[str, int] = Field(default_factory=dict)


class Invitation(BaseModel):
    id: str
    by: str
    to: str
    location: str
    day: int
    slot: int
    purpose: str
    created_tick: int
    status: Literal["pending", "accepted", "declined", "fulfilled", "broken", "expired"] = "pending"
    note: str = ""


class Transaction(BaseModel):
    id: str
    tick: int
    action_id: str
    buyer: str
    seller: Optional[str]  # None 代表鎮外（供應商、外地訂單）
    item: Optional[str]
    quantity: int
    total: int
    kind: Literal["purchase", "meal", "wage", "repair_fee", "coop_share"]


class LogEntry(BaseModel):
    id: str
    tick: int
    day: int
    slot: int
    kind: str  # action / chat / invite / cooperate / event / meeting / system
    actor: Optional[str] = None
    targets: list[str] = Field(default_factory=list)
    location: Optional[str] = None
    action: Optional[str] = None
    success: bool = True
    text: str
    reason: str = ""
    changes: list[str] = Field(default_factory=list)
    source: DecisionSource = "engine"
    say: Optional[str] = None


class ScheduledEvent(BaseModel):
    tick: int
    type: str
    params: dict = Field(default_factory=dict)
    fired: bool = False


class ActiveEvent(BaseModel):
    id: str
    type: str
    title: str
    detail: str
    start_tick: int
    end_tick: int
    location: Optional[str] = None
    params: dict = Field(default_factory=dict)
    resolved: bool = False


class WorldState(BaseModel):
    version: str
    seed: int
    days: int
    tick: int = 0
    mode: Literal["rule", "llm"] = "rule"
    residents: dict[str, Resident]
    locations: dict[str, Location]
    invitations: dict[str, Invitation] = Field(default_factory=dict)
    ledger: list[Transaction] = Field(default_factory=list)
    log: list[LogEntry] = Field(default_factory=list)
    schedule: list[ScheduledEvent] = Field(default_factory=list)
    events: list[ActiveEvent] = Field(default_factory=list)
    stats_history: list[dict] = Field(default_factory=list)
    counters: dict[str, int] = Field(default_factory=dict)
    next_id: int = 1

    @property
    def finished(self) -> bool:
        return self.tick >= self.days * 6

    def new_id(self, prefix: str) -> str:
        value = f"{prefix}{self.next_id}"
        self.next_id += 1
        return value
