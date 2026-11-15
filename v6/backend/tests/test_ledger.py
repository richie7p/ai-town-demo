import pytest

from aitown.ledger import LedgerError, audit, buy_meal, pay, purchase
from aitown.models import Action
from aitown.world import create_world

from .conftest import place, scripted_step


def test_purchase_moves_money_and_stock_atomically():
    state = create_world(seed=1)
    market = state.locations["market"]
    buyer, seller = state.residents["yu"], state.residents["chen"]
    stock, money, seller_money = market.stock["bread"], buyer.money, seller.money
    tx = purchase(state, "a1", "yu", "market", "bread", 2)
    assert tx.total == 16
    assert market.stock["bread"] == stock - 2
    assert buyer.money == money - 16 and seller.money == seller_money + 16
    assert buyer.inventory["bread"] == 1 + 2


def test_cannot_buy_more_than_stock_or_from_empty_shelf():
    state = create_world(seed=1)
    market = state.locations["market"]
    market.stock["parts"] = 1
    state.residents["lin"].money = 500
    tx = purchase(state, "a1", "lin", "market", "parts", 5)
    assert tx.quantity == 1 and market.stock["parts"] == 0
    before = state.residents["lin"].money
    with pytest.raises(LedgerError, match="缺貨"):
        purchase(state, "a2", "lin", "market", "parts", 1)
    assert market.stock["parts"] == 0 and state.residents["lin"].money == before
    assert audit(state) == []


def test_duplicate_transaction_is_rejected_without_side_effects():
    state = create_world(seed=1)
    purchase(state, "same", "yu", "market", "bread", 1)
    snapshot = state.model_dump()
    with pytest.raises(LedgerError, match="重複"):
        purchase(state, "same", "yu", "market", "bread", 1)
    assert state.model_dump() == snapshot
    pay(state, "w", None, "yu", 5, "wage")
    with pytest.raises(LedgerError, match="重複"):
        pay(state, "w", None, "yu", 5, "wage")


def test_insufficient_money_changes_nothing():
    state = create_world(seed=1)
    state.residents["yu"].money = 3
    snapshot = state.model_dump()
    with pytest.raises(LedgerError, match="錢不夠"):
        purchase(state, "a1", "yu", "market", "wood", 1)
    with pytest.raises(LedgerError, match="錢不夠"):
        buy_meal(state, "a2", "yu", "cafe")
    assert state.model_dump() == snapshot


def test_two_buyers_compete_for_the_last_item(sim):
    sim.state.locations["market"].stock["bread"] = 1
    sim.state.tick = 1
    place(sim, yu="market", kai="market")
    scripted_step(sim, {
        "yu": Action(type="shop", location="market", item="bread"),
        "kai": Action(type="shop", location="market", item="bread"),
    })
    shops = [e for e in sim.state.log if e.action == "shop"]
    assert sorted(e.success for e in shops) == [False, True]
    assert sim.state.locations["market"].stock["bread"] == 0
    assert audit(sim.state) == []


def test_no_negative_values_over_many_seeds():
    from aitown.engine import Simulation

    for seed in range(8):
        sim = Simulation(seed=seed)
        sim.trigger_event("market_shortage")
        sim.run()
        assert audit(sim.state) == [], seed
