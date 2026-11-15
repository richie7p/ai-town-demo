import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from aitown.engine import Simulation  # noqa: E402
from aitown.models import Action, Decision  # noqa: E402


class ScriptedProvider:
    """測試用：照劇本行動，沒寫到的人留在原地休息。"""

    mode = "rule"

    def __init__(self, script=None, accept=True):
        self.script = script or {}
        self.accept = accept

    def decide(self, perception):
        me = perception["self"]
        action = self.script.get(me["id"]) or Action(type="rest", location=me["location"])
        return Decision(action=action, intention="劇本", reasoning="測試劇本", source="rule")

    def respond_invitation(self, perception, invitation):
        return (self.accept, "測試回應")


@pytest.fixture
def sim():
    return Simulation(seed=7, schedule=[])


def scripted_step(sim, script, accept=True):
    provider = ScriptedProvider(script, accept)
    sim.provider = provider
    return sim.step()


def place(sim, **where):
    for rid, loc in where.items():
        sim.state.residents[rid].location = loc


def at_slot(sim, slot):
    """把時間快轉到第一天的某個時段（不執行任何行動）。"""
    sim.state.tick = slot
