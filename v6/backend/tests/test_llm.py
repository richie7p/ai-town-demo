import re
from types import SimpleNamespace

from aitown.agents.llm import LLMChoice, LLMDecisionProvider, make_provider
from aitown.engine import Simulation


class FakeMessages:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return self.behaviour(kwargs)


class FakeClient:
    def __init__(self, behaviour):
        self.messages = FakeMessages(behaviour)


def choice(**kw):
    base = dict(action="move", location="plaza", intention="去廣場", reasoning="想看看公告欄")
    base.update(kw)
    return SimpleNamespace(stop_reason="end_turn", parsed_output=LLMChoice(**base))


def test_llm_decisions_are_labelled_and_still_validated_by_the_engine():
    def behaviour(kwargs):
        if re.search(r'"self": \{\s*"id": "yu"', kwargs["messages"][0]["content"]):
            return choice(action="shop", location="home_chen", item="bread", reasoning="想闖進陳伯家")
        return choice()

    client = FakeClient(behaviour)
    sim = Simulation(seed=1, mode="llm", llm_client=client)
    assert sim.config()["mode"] == "llm" and sim.state.mode == "llm"
    sim.step()
    calls = client.messages.calls
    assert len(calls) == 6
    assert calls[0]["output_format"] is LLMChoice and calls[0]["model"]
    yu_entry = next(e for e in sim.state.log if e.actor == "yu")
    assert yu_entry.source == "llm" and not yu_entry.success  # 自然語言不能直接改世界
    assert "不能擅自進入" in yu_entry.reason
    assert sim.state.residents["wang"].decision_source == "llm"
    assert sim.state.residents["wang"].reasoning == "想看看公告欄"


def test_llm_errors_fall_back_to_rules_and_say_so():
    def behaviour(kwargs):
        raise TimeoutError("網路逾時")

    sim = Simulation(seed=1, mode="llm", llm_client=FakeClient(behaviour))
    sim.step()
    person = sim.state.residents["lin"]
    assert person.decision_source == "llm_fallback"
    assert "網路逾時" in person.fallback_reason
    assert person.reasoning.startswith("規則：")


def test_refusal_and_empty_output_fall_back():
    provider = LLMDecisionProvider(seed=1, client=FakeClient(lambda k: SimpleNamespace(stop_reason="refusal", parsed_output=None)))
    sim = Simulation(seed=1)
    from aitown.perception import perceive

    decision = provider.decide(perceive(sim.state, "lin"))
    assert decision.source == "llm_fallback" and "拒絕" in decision.fallback_reason


def test_llm_mode_without_api_key_runs_rule_based(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    provider, info = make_provider("llm", 1)
    assert provider.mode == "rule" and info["mode"] == "rule"
    assert "ANTHROPIC_API_KEY" in info["reason"]
    sim = Simulation(seed=1, mode="llm")
    sim.run()
    assert sim.state.finished and sim.state.mode == "rule"
