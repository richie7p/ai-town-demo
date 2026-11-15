"""Decision Provider 介面。

引擎只依賴這個介面：給一份居民的「觀察」，回傳一個結構化 Decision。
規則型與 LLM 型都實作同一個介面，因此可以隨時替換，或在 LLM 失敗時
退回規則型。
"""

from __future__ import annotations

from typing import Protocol

from ..models import Decision


class DecisionProvider(Protocol):
    mode: str  # "rule" 或 "llm"

    def decide(self, perception: dict) -> Decision:
        """根據單一居民的觀察提出下一個時段的行動。"""
        ...

    def respond_invitation(self, perception: dict, invitation: dict) -> tuple[bool, str]:
        """被當面邀約時決定是否答應，回傳 (是否答應, 理由)。"""
        ...
