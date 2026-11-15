"""帳本：所有金錢與庫存的變動都必須經過這裡。

規則：
- 先檢查全部條件，全部通過才一次修改（不會出現扣了錢卻沒拿到貨）。
- 同一個行動 id 同一種交易只能入帳一次（避免重複交易）。
- 任何情況下金錢、庫存、背包都不會變成負數。
"""

from __future__ import annotations

from typing import Optional

from .config import ITEMS
from .models import Transaction, WorldState


class LedgerError(Exception):
    """交易被拒絕；訊息是給人看的中文原因。"""


def _already_booked(state: WorldState, action_id: str, kind: str) -> bool:
    return any(t.action_id == action_id and t.kind == kind for t in state.ledger)


def _book(state: WorldState, action_id: str, buyer: str, seller: Optional[str], item: Optional[str],
          quantity: int, total: int, kind: str) -> Transaction:
    tx = Transaction(id=state.new_id("tx"), tick=state.tick, action_id=action_id, buyer=buyer,
                     seller=seller, item=item, quantity=quantity, total=total, kind=kind)
    state.ledger.append(tx)
    return tx


def add_item(state: WorldState, rid: str, item: str, quantity: int) -> None:
    inv = state.residents[rid].inventory
    inv[item] = inv.get(item, 0) + quantity
    if inv[item] < 0:
        raise LedgerError("背包數量不可為負")
    if inv[item] == 0:
        inv.pop(item)


def take_item(state: WorldState, rid: str, item: str, quantity: int = 1) -> None:
    inv = state.residents[rid].inventory
    if quantity <= 0 or inv.get(item, 0) < quantity:
        raise LedgerError(f"身上的{ITEMS[item]['name']}不夠")
    add_item(state, rid, item, -quantity)


def purchase(state: WorldState, action_id: str, buyer_id: str, location_id: str, item: str,
             quantity: int) -> Transaction:
    """在市場購買。庫存不足時只買得到剩下的量；完全沒貨則拒絕。"""
    if _already_booked(state, action_id, "purchase"):
        raise LedgerError("這筆購買已經入帳過了（重複交易被拒絕）")
    location = state.locations[location_id]
    if item not in location.stock:
        raise LedgerError(f"{location.name}沒有販售這項商品")
    if quantity < 1:
        raise LedgerError("購買數量至少為 1")
    available = location.stock.get(item, 0)
    if available <= 0:
        raise LedgerError(f"{ITEMS[item]['name']}缺貨")
    qty = min(quantity, available)
    buyer = state.residents[buyer_id]
    seller = location.owner
    total = 0 if seller == buyer_id else ITEMS[item]["price"] * qty
    if buyer.money < total:
        raise LedgerError(f"錢不夠（需要 {total} 元，只有 {buyer.money} 元）")
    # 全部檢查通過，一次寫入
    location.stock[item] = available - qty
    buyer.money -= total
    if seller and seller != buyer_id:
        state.residents[seller].money += total
    add_item(state, buyer_id, item, qty)
    return _book(state, action_id, buyer_id, seller, item, qty, total, "purchase")


def buy_meal(state: WorldState, action_id: str, buyer_id: str, location_id: str) -> Transaction:
    if _already_booked(state, action_id, "meal"):
        raise LedgerError("這份餐點已經入帳過了（重複交易被拒絕）")
    location = state.locations[location_id]
    if location.stock.get("meal", 0) <= 0:
        raise LedgerError("咖啡廳的套餐賣完了")
    buyer = state.residents[buyer_id]
    seller = location.owner
    total = 0 if seller == buyer_id else ITEMS["meal"]["price"]
    if buyer.money < total:
        raise LedgerError(f"錢不夠（套餐 {total} 元，只有 {buyer.money} 元）")
    location.stock["meal"] -= 1
    buyer.money -= total
    if seller and seller != buyer_id:
        state.residents[seller].money += total
    return _book(state, action_id, buyer_id, seller, "meal", 1, total, "meal")


def pay(state: WorldState, action_id: str, payer: Optional[str], payee: str, amount: int, kind: str) -> Transaction:
    """付款。payer 為 None 代表鎮外的錢（工資、外地訂單）。"""
    if amount < 0:
        raise LedgerError("金額不可為負")
    if _already_booked(state, action_id, kind):
        raise LedgerError("這筆款項已經入帳過了（重複交易被拒絕）")
    if payer is not None:
        if state.residents[payer].money < amount:
            raise LedgerError(f"{state.residents[payer].name}的錢不夠支付 {amount} 元")
        state.residents[payer].money -= amount
    state.residents[payee].money += amount
    return _book(state, action_id, payee, payer, None, 0, amount, kind)


def audit(state: WorldState) -> list[str]:
    """回傳所有違反守恆規則的地方；正常應為空清單。"""
    problems = []
    for person in state.residents.values():
        if person.money < 0:
            problems.append(f"{person.name} 金錢為負")
        for item, qty in person.inventory.items():
            if qty < 0:
                problems.append(f"{person.name} 的 {item} 為負")
    for loc in state.locations.values():
        for item, qty in {**loc.stock, **loc.warehouse}.items():
            if qty < 0:
                problems.append(f"{loc.name} 的 {item} 為負")
    seen = set()
    for tx in state.ledger:
        key = (tx.action_id, tx.kind)
        if key in seen:
            problems.append(f"交易 {tx.action_id}/{tx.kind} 重複入帳")
        seen.add(key)
    return problems
