"""LLM Decision Provider（Claude）。

- API Key 只從後端環境變數 ANTHROPIC_API_KEY 讀取，前端永遠拿不到。
- 用 Structured Outputs 讓模型回傳固定格式的行動，再交給引擎驗證；
  模型說什麼都不會直接改變世界。
- 呼叫失敗、拒答或格式錯誤時，改用規則型決策，並在決策上標記
  source="llm_fallback" 與原因，UI 會清楚顯示。
- 回應邀約目前仍使用規則（見 README「尚未完成」）。
"""

from __future__ import annotations

import json
import os
from typing import Any, Literal, Optional

from pydantic import BaseModel

from ..models import Action, Decision
from .rule_based import RuleBasedProvider

DEFAULT_MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """你正在扮演一個小鎮模擬中的居民。每次你會收到「只有這位居民看得到」的資訊，
請以這位居民的性格與處境，決定下一個時段（約三小時）要去哪裡、做什麼。

規則：
- 你只能提出行動；小鎮引擎會檢查條件（營業時間、金錢、庫存、精力、對方是否在場），不合理的行動會失敗。
- 每個時段只能做一件事，地點必須是 map 裡的 id，對象必須是 directory 裡的居民 id。
- 不要假設你不知道的事，例如別人現在在哪裡、店裡還有多少貨。你只知道 here、facts、beliefs、memories 裡的內容。
- 行動類型：
  move 前往某地（在廣場就是散步，也用於參加活動）
  work 在自己的工作地點工作（job_sites，且需在營業時段）
  rest 休息（在自己家效果最好；夜晚回家睡覺）
  eat 吃東西（在咖啡廳不填 item 就是買套餐；或吃自己背包裡的 bread / vegetables）
  shop 在市場購買 item（bread / vegetables / wood / parts），quantity 1~5
  chat 和 target 聊天（對方必須在同一地點），可在 say 填一句話
  invite 當面邀請 target，在 invite_day / invite_slot 到 invite_location 見面，purpose 為 meal / event / help
  cooperate 協助 target 工作（對方必須在同地點且正在工作）
- intention 用一句話寫你現在的短期目標；reasoning 用一兩句話說明理由。全部使用繁體中文。"""


class LLMChoice(BaseModel):
    action: Literal["move", "work", "rest", "eat", "shop", "chat", "invite", "cooperate"]
    location: str
    target: Optional[str] = None
    item: Optional[Literal["bread", "vegetables", "meal", "wood", "parts"]] = None
    quantity: int = 1
    invite_location: Optional[str] = None
    invite_day: Optional[int] = None
    invite_slot: Optional[int] = None
    purpose: Optional[Literal["meal", "event", "help"]] = None
    say: Optional[str] = None
    intention: str
    reasoning: str


def build_prompt(perception: dict) -> str:
    slim = {k: v for k, v in perception.items() if k not in ("beliefs",)}
    slim["beliefs"] = {k: v for k, v in perception.get("beliefs", {}).items() if k != "told"}
    return ("以下是你目前能知道的一切（JSON）。請決定這個時段的行動。\n\n"
            + json.dumps(slim, ensure_ascii=False, indent=1))


class LLMDecisionProvider:
    mode = "llm"

    def __init__(self, seed: int = 0, model: Optional[str] = None, client: Any = None, max_tokens: int = 1024):
        self.fallback = RuleBasedProvider(seed)
        self.model = model or os.environ.get("AI_TOWN_LLM_MODEL", DEFAULT_MODEL)
        self.max_tokens = max_tokens
        if client is None:
            import anthropic  # 延遲匯入：規則模式完全不需要這個套件

            client = anthropic.Anthropic()  # 會自動讀取 ANTHROPIC_API_KEY
        self.client = client
        self.calls = 0
        self.failures = 0

    def decide(self, perception: dict) -> Decision:
        self.calls += 1
        try:
            response = self.client.messages.parse(
                model=self.model,
                max_tokens=self.max_tokens,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": build_prompt(perception)}],
                output_format=LLMChoice,
            )
            if getattr(response, "stop_reason", None) == "refusal":
                raise RuntimeError("模型拒絕回答")
            choice: Optional[LLMChoice] = getattr(response, "parsed_output", None)
            if choice is None:
                raise ValueError("模型沒有回傳可解析的行動")
            action = Action(
                type=choice.action, location=choice.location, target=choice.target, item=choice.item,
                quantity=choice.quantity, invite_location=choice.invite_location, invite_day=choice.invite_day,
                invite_slot=choice.invite_slot, purpose=choice.purpose, say=choice.say,
            )
            return Decision(action=action, intention=choice.intention, reasoning=choice.reasoning, source="llm")
        except Exception as exc:  # noqa: BLE001 — 任何錯誤都退回規則型，模擬不中斷
            self.failures += 1
            fallback = self.fallback.decide(perception)
            fallback.source = "llm_fallback"
            fallback.fallback_reason = f"{type(exc).__name__}: {exc}"[:240]
            return fallback

    def respond_invitation(self, perception: dict, invitation: dict) -> tuple[bool, str]:
        return self.fallback.respond_invitation(perception, invitation)


def make_provider(mode: str, seed: int, client: Any = None) -> tuple[Any, dict]:
    """依設定建立 Provider。要求 LLM 但條件不足時，安全地退回規則型並說明原因。"""
    info = {"requested": mode, "mode": "rule", "model": None, "llm_available": False, "reason": ""}
    if mode != "llm":
        info["reason"] = "預設使用規則型 Agent（不需要 API Key）"
        return RuleBasedProvider(seed), info
    if client is None and not os.environ.get("ANTHROPIC_API_KEY"):
        info["reason"] = "沒有設定 ANTHROPIC_API_KEY，已改用規則型 Agent"
        return RuleBasedProvider(seed), info
    try:
        provider = LLMDecisionProvider(seed, client=client)
    except ImportError:
        info["reason"] = "尚未安裝 anthropic 套件（pip install -r requirements-llm.txt），已改用規則型 Agent"
        return RuleBasedProvider(seed), info
    info.update(mode="llm", model=provider.model, llm_available=True, reason="使用 Claude 進行決策")
    return provider, info


def llm_available() -> bool:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True
