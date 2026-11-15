"""行動驗證與結算。

每個時段的流程（同步、離散時間）：
1. 移動：所有人同時前往各自選擇的地點（驗證營業時間與權限）
2. 生產：修理 → 其他工作（產出食物、補貨、收入）
3. 消費：吃飯、購物、休息、閒逛（依 seed 決定的公平順序搶有限庫存）
4. 合作：協助正在工作的人（對方必須真的有成功工作）
5. 社交：聊天（交換知識）、邀約（對方當場答應或拒絕）
6. 約定檢查：赴約成功或被放鴿子

任何驗證失敗都只會產生「失敗紀錄」，不會修改世界。
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable, Optional

from .config import ITEMS, JOBS, NIGHT, SHELF_CAPACITY, SLOTS
from .events import fixed_fact
from .ledger import LedgerError, add_item, buy_meal, pay, purchase, take_item
from .models import Action, Decision, Invitation, LogEntry, Notice, Resident, WorldState
from .social import adjust_relation, clamp, learn, mutual, remember, shareable_fact
from .world import day_of, slot_of, tick_of

MEAL_CAP = 12
BOARD_LIMIT = 8


class ActionFailed(Exception):
    pass


@dataclass
class Outcome:
    text: str
    activity: str
    changes: list[str] = field(default_factory=list)
    targets: list[str] = field(default_factory=list)
    say: Optional[str] = None
    kind: str = "action"


def need(person: Resident, key: str, delta: int, changes: Optional[list[str]] = None) -> None:
    before = getattr(person.needs, key)
    after = clamp(before + delta)
    setattr(person.needs, key, after)
    if changes is not None and before != after:
        label = {"hunger": "飢餓", "energy": "精力", "social": "孤單"}[key]
        changes.append(f"{person.name} {label} {before}→{after}")


RespondFn = Callable[[WorldState, str, Invitation], tuple[bool, str]]


class Resolver:
    def __init__(self, state: WorldState, decisions: dict[str, Decision], respond: RespondFn):
        self.state = state
        self.decisions = decisions
        self.respond = respond
        self.tick = state.tick
        self.slot = slot_of(state.tick)
        self.move_errors: dict[str, str] = {}
        self.worked: set[str] = set()
        self.resting: set[str] = set()
        self.handled_chats: set[str] = set()
        self.rng = random.Random(f"{state.seed}:order:{state.tick}")

    # ------------------------------------------------------------------ 共用
    def loc_name(self, loc_id: str) -> str:
        loc = self.state.locations.get(loc_id)
        return loc.name if loc else loc_id

    def check_destination(self, person: Resident, dest: str) -> Optional[str]:
        loc = self.state.locations.get(dest)
        if loc is None:
            return f"小鎮沒有「{dest}」這個地點"
        if loc.kind == "home" and loc.owner != person.id:
            return f"不能擅自進入{loc.name}"
        if self.slot not in loc.open_slots:
            return f"{loc.name}在{SLOTS[self.slot]}沒有開放"
        return None

    def present(self, person: Resident, target_id: Optional[str], exclude: Optional[set[str]] = None) -> Resident:
        if not target_id:
            return self.pick_partner(person, exclude or set())
        if target_id not in self.state.residents:
            raise ActionFailed("沒有指定有效的對象")
        if target_id == person.id:
            raise ActionFailed("不能對自己做這件事")
        target = self.state.residents[target_id]
        if target.location != person.location:
            raise ActionFailed(f"{target.name}不在{self.loc_name(person.location)}（撲空了）")
        return target

    def pick_partner(self, person: Resident, exclude: set[str]) -> Resident:
        """沒指定對象時，找現場最熟的人（用的是自己對別人的認識，不是全知資訊）。"""
        here = [p for p in self.state.residents.values()
                if p.location == person.location and p.id != person.id and p.id not in exclude]
        if not here:
            raise ActionFailed(f"{self.loc_name(person.location)}沒有其他人")
        rng = random.Random(f"{self.state.seed}:partner:{self.tick}:{person.id}")
        return max(here, key=lambda p: (person.relations[p.id].familiarity + rng.random() * 10, p.id))

    def record(self, person: Resident, decision: Decision, outcome: Optional[Outcome], error: Optional[str]) -> None:
        act = decision.action
        entry = LogEntry(
            id=self.state.new_id("log"), tick=self.tick, day=day_of(self.tick), slot=self.slot,
            kind=outcome.kind if outcome else ("chat" if act.type == "chat" else "action"),
            actor=person.id, location=person.location, action=act.type,
            success=error is None, source=decision.source,
            targets=outcome.targets if outcome else ([act.target] if act.target else []),
            text=outcome.text if outcome else f"{person.name}想要{ACTION_LABELS[act.type]}，但失敗了",
            reason=error or "", changes=outcome.changes if outcome else [],
            say=outcome.say if outcome else None,
        )
        self.state.log.append(entry)
        person.last_action = act
        person.last_success = error is None
        person.last_result = entry.text if error is None else f"失敗：{error}"
        person.activity = outcome.activity if outcome else f"{ACTION_LABELS[act.type]}失敗"
        if error:
            remember(person, self.tick, "failure", f"想{ACTION_LABELS[act.type]}卻失敗：{error}", importance=2)
        counters = self.state.counters
        counters["actions"] = counters.get("actions", 0) + 1
        if error:
            counters["failed"] = counters.get("failed", 0) + 1

    # ------------------------------------------------------------------ 流程
    def run(self) -> None:
        state = self.state
        for rid in sorted(self.decisions):
            person = state.residents[rid]
            dest = self.decisions[rid].action.location
            person.prev_location = person.location
            err = self.check_destination(person, dest)
            if err:
                self.move_errors[rid] = err
                if self.slot not in state.locations[person.location].open_slots:
                    person.location = person.home
            else:
                person.location = dest

        order = sorted(self.decisions)
        self.rng.shuffle(order)
        kind = {rid: self.decisions[rid].action.type for rid in order}
        repairs = [r for r in order if kind[r] == "work" and state.residents[r].job == "repairer"]
        works = [r for r in order if kind[r] == "work" and r not in repairs]
        consume = [r for r in order if kind[r] in ("eat", "shop", "rest", "move")]
        coop = [r for r in order if kind[r] == "cooperate"]
        social = [r for r in order if kind[r] in ("chat", "invite")]
        for rid in repairs + works + consume + coop + social:
            self.execute(rid)

    def execute(self, rid: str) -> None:
        person = self.state.residents[rid]
        decision = self.decisions[rid]
        act = decision.action
        if act.type == "chat" and rid in self.handled_chats:
            return
        try:
            if rid in self.move_errors:
                raise ActionFailed(f"沒能抵達：{self.move_errors[rid]}")
            handler = getattr(self, f"do_{act.type}")
            outcome = handler(person, act)
            self.record(person, decision, outcome, None)
        except (ActionFailed, LedgerError) as exc:
            self.record(person, decision, None, str(exc))

    # ------------------------------------------------------------------ 基本行動
    def do_move(self, person: Resident, act: Action) -> Outcome:
        loc = self.state.locations[person.location]
        changes: list[str] = []
        if loc.kind == "plaza":
            need(person, "social", -6, changes)
            return Outcome(f"{person.name}在公共廣場散步", "在廣場散步", changes)
        if person.prev_location == person.location:
            return Outcome(f"{person.name}待在{loc.name}", f"待在{loc.name}", changes)
        return Outcome(f"{person.name}前往{loc.name}", f"在{loc.name}", changes)

    def do_rest(self, person: Resident, act: Action) -> Outcome:
        changes: list[str] = []
        at_home = person.location == person.home
        if self.slot == NIGHT and at_home:
            need(person, "energy", 55, changes)
            self.resting.add(person.id)
            return Outcome(f"{person.name}回家睡覺", "睡覺", changes)
        gain = 28 if at_home else 12
        need(person, "energy", gain, changes)
        where = "在家" if at_home else f"在{self.loc_name(person.location)}"
        return Outcome(f"{person.name}{where}休息", f"{where}休息", changes)

    def do_eat(self, person: Resident, act: Action) -> Outcome:
        changes: list[str] = []
        loc = self.state.locations[person.location]
        item = act.item
        if item in (None, "meal") and loc.kind == "cafe":
            tx = buy_meal(self.state, f"{self.tick}:{person.id}", person.id, loc.id)
            need(person, "hunger", -ITEMS["meal"]["food"], changes)
            changes.append(f"咖啡廳套餐 {loc.stock['meal'] + 1}→{loc.stock['meal']}")
            if tx.total:
                seller = self.state.residents[tx.seller].name if tx.seller else "店家"
                changes.append(f"{person.name} 付 {tx.total} 元給{seller}")
            self.bump(person, "meals")
            return Outcome(f"{person.name}在咖啡廳吃了一份套餐", "在咖啡廳吃飯", changes)
        if item == "meal":
            raise ActionFailed("套餐只有在咖啡廳才吃得到")
        if item is None:
            foods = [k for k in ("bread", "vegetables") if person.inventory.get(k, 0) > 0]
            if not foods:
                raise ActionFailed("身上沒有食物，也不在咖啡廳")
            item = foods[0]
        if item not in ITEMS or ITEMS[item]["food"] <= 0:
            raise ActionFailed(f"{ITEMS.get(item, {}).get('name', item)}不能吃")
        take_item(self.state, person.id, item)
        need(person, "hunger", -ITEMS[item]["food"], changes)
        changes.append(f"{person.name} 背包 {ITEMS[item]['name']} -1")
        self.bump(person, "meals")
        verb = "煮了蔬菜湯" if item == "vegetables" else "吃了麵包"
        return Outcome(f"{person.name}在{loc.name}{verb}", f"吃{ITEMS[item]['name']}", changes)

    def do_shop(self, person: Resident, act: Action) -> Outcome:
        loc = self.state.locations[person.location]
        if loc.kind != "market":
            raise ActionFailed("只有市場可以購物")
        if not act.item or act.item not in ITEMS:
            raise ActionFailed("沒有指定要買什麼")
        qty = max(1, min(5, act.quantity))
        before = loc.stock.get(act.item, 0)
        tx = purchase(self.state, f"{self.tick}:{person.id}", person.id, loc.id, act.item, qty)
        name = ITEMS[act.item]["name"]
        changes = [f"市場貨架 {name} {before}→{loc.stock[act.item]}", f"{person.name} 背包 {name} +{tx.quantity}"]
        if tx.total:
            changes.append(f"{person.name} 付 {tx.total} 元（剩 {person.money} 元）")
        short = f"（只剩 {tx.quantity} 份）" if tx.quantity < qty else ""
        self.bump(person, "purchases")
        return Outcome(f"{person.name}在市場買了 {tx.quantity} 份{name}{short}", f"買{name}", changes)

    # ------------------------------------------------------------------ 工作
    def do_work(self, person: Resident, act: Action) -> Outcome:
        job = JOBS[person.job]
        loc = self.state.locations[person.location]
        sites = [person.home if s == "home" else s for s in job["sites"]]
        if loc.id not in sites:
            raise ActionFailed(f"{person.occupation}不能在{loc.name}工作")
        if person.needs.energy < 15:
            raise ActionFailed("太累了，沒力氣工作")
        if person.needs.hunger >= 90:
            raise ActionFailed("太餓了，沒辦法工作")
        outcome = getattr(self, f"work_{person.job}")(person, loc)
        need(person, "energy", -10, outcome.changes)
        need(person, "hunger", 3)
        self.worked.add(person.id)
        self.bump(person, "work")
        return outcome

    def broken_here(self, loc) -> list:
        return [e for e in loc.equipment.values() if not e.working]

    def require_equipment(self, loc, eq_id: str) -> None:
        eq = loc.equipment.get(eq_id)
        if eq and not eq.working:
            raise ActionFailed(f"{loc.name}的{eq.name}故障中，無法工作")

    def wage(self, person: Resident, amount: int, changes: list[str], kind: str = "wage") -> None:
        pay(self.state, f"{self.tick}:{person.id}", None, person.id, amount, kind)
        changes.append(f"{person.name} 收入 +{amount} 元")

    def work_barista(self, person: Resident, loc) -> Outcome:
        self.require_equipment(loc, "coffee_machine")
        changes: list[str] = []
        before = loc.stock.get("meal", 0)
        if before >= MEAL_CAP:
            self.wage(person, 5, changes)
            return Outcome(f"{person.name}在咖啡廳招呼客人（套餐還有 {before} 份，不用再做）", "在咖啡廳工作", changes)
        veg = min(2, person.inventory.get("vegetables", 0))
        if veg:
            take_item(self.state, person.id, "vegetables", veg)
            changes.append(f"{person.name} 用掉蔬菜 {veg} 份")
        loc.stock["meal"] = min(MEAL_CAP, before + 2 + 2 * veg)
        changes.append(f"咖啡廳套餐 {before}→{loc.stock['meal']}")
        self.wage(person, 5, changes)
        self.bump(person, "meals_made", loc.stock["meal"] - before)
        return Outcome(f"{person.name}在咖啡廳煮咖啡、做了 {loc.stock['meal'] - before} 份套餐", "在咖啡廳工作", changes)

    def work_grocer(self, person: Resident, loc) -> Outcome:
        changes: list[str] = []
        fridge_ok = loc.equipment.get("fridge") is None or loc.equipment["fridge"].working
        moved = 0
        for item, cap in SHELF_CAPACITY.items():
            if item == "vegetables" and not fridge_ok:
                changes.append("冷藏櫃故障，蔬菜無法上架")
                continue
            room = cap - loc.stock.get(item, 0)
            qty = min(room, loc.warehouse.get(item, 0))
            if qty > 0:
                before = loc.stock.get(item, 0)
                loc.stock[item] = before + qty
                loc.warehouse[item] -= qty
                moved += qty
                changes.append(f"市場貨架 {ITEMS[item]['name']} {before}→{loc.stock[item]}")
        self.wage(person, 4, changes)
        text = f"{person.name}把倉庫的 {moved} 件貨上架" if moved else f"{person.name}整理攤位（倉庫沒有貨可以補）"
        return Outcome(text, "在市場顧攤", changes)

    def work_carpenter(self, person: Resident, loc) -> Outcome:
        self.require_equipment(loc, "saw")
        if person.inventory.get("wood", 0) < 2:
            raise ActionFailed(f"木材不夠（需要 2，只有 {person.inventory.get('wood', 0)}）")
        changes: list[str] = []
        take_item(self.state, person.id, "wood", 2)
        changes.append(f"{person.name} 用掉木材 2")
        self.wage(person, 30, changes)
        self.bump(person, "furniture")
        return Outcome(f"{person.name}在工作坊完成一件家具（第 {person.counters['furniture']} 件）", "在工作坊做家具", changes)

    def work_illustrator(self, person: Resident, loc) -> Outcome:
        changes: list[str] = []
        self.wage(person, 16, changes)
        self.bump(person, "illustrations")
        return Outcome(f"{person.name}在{loc.name}畫完一張委託插畫", f"在{loc.name}畫插畫", changes)

    def work_organizer(self, person: Resident, loc) -> Outcome:
        changes: list[str] = []
        posted = 0
        on_board = {n.fact_id for n in loc.notices}
        for fact in sorted(person.facts.values(), key=lambda f: -f.importance):
            if fact.importance >= 3 and fact.id not in on_board and not fact.id.startswith("fixed"):
                loc.notices.append(Notice(fact_id=fact.id, text=fact.text, posted_tick=self.tick, by=person.id))
                posted += 1
                changes.append(f"公告欄 +「{fact.text}」")
        loc.notices = loc.notices[-BOARD_LIMIT:]
        self.wage(person, 10, changes)
        text = f"{person.name}更新公告欄（貼了 {posted} 則）" if posted else f"{person.name}整理公告欄、聯絡居民"
        return Outcome(text, "整理公告欄", changes)

    def work_repairer(self, person: Resident, loc) -> Outcome:
        changes: list[str] = []
        broken = self.broken_here(loc)
        if broken:
            if person.inventory.get("parts", 0) < 1:
                raise ActionFailed("身上沒有零件，修不了")
            eq = broken[0]
            take_item(self.state, person.id, "parts", 1)
            eq.working = True
            eq.broken_tick = None
            changes.append(f"{loc.name} {eq.name}：故障→正常")
            changes.append(f"{person.name} 用掉零件 1")
            fee = 20
            owner = loc.owner if loc.owner and loc.owner != person.id else None
            payer = owner if owner and self.state.residents[owner].money >= fee else None
            pay(self.state, f"{self.tick}:{person.id}", payer, person.id, fee, "repair_fee")
            changes.append(f"{person.name} 收到修理費 {fee} 元（{self.state.residents[payer].name if payer else '鎮公所'}支付）")
            fact = fixed_fact(self.state, loc.id, eq.id)
            witnesses = [p for p in self.state.residents.values() if p.location == loc.id]
            if owner:
                witnesses.append(self.state.residents[owner])
            for w in witnesses:
                learn(w, fact, self.tick, "seen")
            for ev in self.state.events:
                if ev.type == "equipment_failure" and not ev.resolved and ev.params.get("equipment") == eq.id \
                        and ev.params.get("location") == loc.id:
                    ev.resolved = True
                    ev.end_tick = self.tick
            self.bump(person, "repairs")
            remember(person, self.tick, "work", f"修好了{loc.name}的{eq.name}", importance=3)
            if owner:
                changes += mutual(self.state, person.id, owner, 4, 8)
                remember(self.state.residents[owner], self.tick, "help",
                         f"{person.name}修好了我們{loc.name}的{eq.name}", [person.id], importance=3)
            return Outcome(f"{person.name}修好了{loc.name}的{eq.name}！", f"修理{eq.name}", changes,
                           targets=[owner] if owner else [])
        if loc.kind != "workshop":
            raise ActionFailed(f"{loc.name}沒有需要修理的設備")
        self.wage(person, 12, changes)
        return Outcome(f"{person.name}在工作坊接零工、保養工具", "在工作坊做零工", changes)

    # ------------------------------------------------------------------ 社交
    def do_cooperate(self, person: Resident, act: Action) -> Outcome:
        target = self.present(person, act.target)
        if target.id not in self.worked:
            raise ActionFailed(f"{target.name}這個時段沒有在工作，沒有可以幫忙的事")
        if person.needs.energy < 15:
            raise ActionFailed("太累了，幫不上忙")
        changes: list[str] = []
        loc = self.state.locations[person.location]
        bonus = 8
        if target.job == "barista" and loc.kind == "cafe":
            before = loc.stock.get("meal", 0)
            loc.stock["meal"] = min(MEAL_CAP, before + 2)
            changes.append(f"咖啡廳套餐 {before}→{loc.stock['meal']}（合作加成）")
        pay(self.state, f"{self.tick}:{person.id}:bonus", None, target.id, bonus, "wage")
        changes.append(f"{target.name} 工作效率提升 +{bonus} 元")
        share = 6 if target.money >= 6 else 0
        if share:
            pay(self.state, f"{self.tick}:{person.id}", target.id, person.id, share, "coop_share")
            changes.append(f"{target.name} 分給{person.name} {share} 元")
        need(person, "energy", -10, changes)
        need(person, "social", -12, changes)
        need(target, "social", -12, changes)
        changes += mutual(self.state, person.id, target.id, 6, 8)
        remember(person, self.tick, "cooperate", f"在{loc.name}幫{target.name}一起{JOBS[target.job]['verb']}", [target.id], 3)
        remember(target, self.tick, "cooperate", f"{person.name}來{loc.name}幫我{JOBS[target.job]['verb']}", [person.id], 3)
        self.bump(person, "cooperations")
        self.state.counters["cooperations"] = self.state.counters.get("cooperations", 0) + 1
        self.state.counters["social"] = self.state.counters.get("social", 0) + 1
        say = act.say or f"{person.name}：「我來幫忙吧！」"
        return Outcome(f"{person.name}在{loc.name}協助{target.name}{JOBS[target.job]['verb']}", f"幫{target.name}工作",
                       changes, targets=[target.id], say=say, kind="cooperate")

    def do_chat(self, person: Resident, act: Action) -> Outcome:
        target = self.present(person, act.target, exclude=self.handled_chats)
        loc = self.state.locations[person.location]
        changes: list[str] = []
        lines = []
        reply_decision = self.decisions.get(target.id)
        mutual_chat = (reply_decision is not None and reply_decision.action.type == "chat"
                       and reply_decision.action.target == person.id and target.id not in self.move_errors)
        shared = []
        for speaker, listener in ((person, target), (target, person)):
            fact = shareable_fact(speaker, listener)
            if fact and learn(listener, fact, self.tick, speaker.id):
                shared.append((speaker, listener, fact))
                changes.append(f"{listener.name}從{speaker.name}那裡得知：{fact.text}")
                remember(listener, self.tick, "news", f"{speaker.name}告訴我：{fact.text}", [speaker.id], fact.importance)
                told = speaker.beliefs.setdefault("told", {})
                told.setdefault(fact.id, [])
                if listener.id not in told[fact.id]:
                    told[fact.id].append(listener.id)
        opener = act.say or self.small_talk(person, target, shared)
        lines.append(f"{person.name}：「{opener}」")
        if mutual_chat and reply_decision.action.say:
            lines.append(f"{target.name}：「{reply_decision.action.say}」")
        else:
            lines.append(f"{target.name}：「{self.reply(target, person, shared)}」")
        trust_gain = 4 if person.relations[target.id].trust < 70 else 1
        changes += mutual(self.state, person.id, target.id, 6, trust_gain)
        need(person, "social", -22, changes)
        need(target, "social", -22, changes)
        need(person, "energy", -2)
        summary = "、".join(f.text for _, _, f in shared)
        remember(person, self.tick, "chat", f"在{loc.name}和{target.name}聊天" + (f"，聊到{summary}" if summary else ""),
                 [target.id], 2)
        remember(target, self.tick, "chat", f"{person.name}在{loc.name}找我聊天" + (f"，聊到{summary}" if summary else ""),
                 [person.id], 2)
        self.bump(person, "chats")
        self.bump(target, "chats")
        if mutual_chat:
            self.handled_chats.add(target.id)
            target.last_action = reply_decision.action
            target.activity = f"和{person.name}聊天"
            target.last_result = f"和{person.name}聊天"
        self.state.counters["chats"] = self.state.counters.get("chats", 0) + 1
        self.state.counters["social"] = self.state.counters.get("social", 0) + 1
        return Outcome(f"{person.name}和{target.name}在{loc.name}聊天", f"和{target.name}聊天", changes,
                       targets=[target.id], say="\n".join(lines), kind="chat")

    def small_talk(self, person: Resident, target: Resident, shared) -> str:
        mine = [f for s, _, f in shared if s.id == person.id]
        if mine:
            return f"跟你說，{mine[0].text}。"
        rng = random.Random(f"{self.state.seed}:talk:{self.tick}:{person.id}")
        topics = {
            "barista": ["今天的豆子是新烘的，要不要嚐嚐？", "最近客人好多，忙得團團轉。"],
            "grocer": ["最近菜價又漲了，唉。", "年輕人要多吃青菜啊。"],
            "carpenter": ["我在想下一件家具的榫接要怎麼做。", "嗯……最近訂單有點多。"],
            "illustrator": ["我最近在畫小鎮的風景，可以畫你嗎？", "這裡的光線很好，好適合畫畫。"],
            "organizer": ["最近大家都還好嗎？有什麼需要幫忙的儘管說！", "我們應該多辦點活動讓大家認識。"],
            "repairer": ["家裡東西壞了都可以找我喔。", "今天天氣不錯，適合慢慢來。"],
        }
        return rng.choice(topics.get(person.job, ["今天過得怎麼樣？"]))

    def reply(self, target: Resident, person: Resident, shared) -> str:
        theirs = [f for s, _, f in shared if s.id == target.id]
        heard = [f for s, _, f in shared if s.id == person.id]
        if theirs:
            return f"真的嗎？對了，{theirs[0].text}。"
        if heard:
            return "真的假的？謝謝你告訴我，我會注意的。"
        rel = target.relations.get(person.id)
        if rel and rel.familiarity >= 40:
            return "哈哈，跟你聊天總是很開心。"
        return "原來如此，很高興跟你聊天。"

    def do_invite(self, person: Resident, act: Action) -> Outcome:
        state = self.state
        purpose = act.purpose or "meal"
        day = act.invite_day or day_of(self.tick)
        slot = act.invite_slot if act.invite_slot is not None else 4
        at = tick_of(day, slot)
        busy = {i.to if i.by == person.id else i.by for i in state.invitations.values()
                if person.id in (i.by, i.to) and tick_of(i.day, i.slot) == at and i.status == "accepted"}
        target = self.present(person, act.target, exclude=busy)
        if at <= self.tick:
            raise ActionFailed("邀約時間必須在未來")
        if at >= state.days * 6:
            raise ActionFailed("邀約時間超出模擬期間")
        place = act.invite_location or self.default_place(purpose)
        loc = state.locations.get(place)
        if loc is None or loc.kind == "home":
            raise ActionFailed("邀約地點必須是公共場所")
        if slot not in loc.open_slots:
            raise ActionFailed(f"{loc.name}在{SLOTS[slot]}沒有開放")
        for inv in state.invitations.values():
            if {inv.by, inv.to} == {person.id, target.id} and (inv.day, inv.slot) == (day, slot) \
                    and inv.status in ("pending", "accepted"):
                raise ActionFailed(f"已經和{target.name}約好這個時間了")
        inv = Invitation(id=state.new_id("inv"), by=person.id, to=target.id, location=place, day=day, slot=slot,
                         purpose=purpose, created_tick=self.tick)
        accepted, why = self.respond(state, target.id, inv)
        inv.status = "accepted" if accepted else "declined"
        inv.note = why
        state.invitations[inv.id] = inv
        changes: list[str] = []
        what = {"meal": "一起吃飯", "event": "一起參加社區活動", "help": "幫忙"}.get(purpose, purpose)
        when = f"第 {day} 天{SLOTS[slot]}"
        if accepted:
            changes += mutual(state, person.id, target.id, 3, 2)
            remember(person, self.tick, "invite", f"約{target.name}{when}在{loc.name}{what}，對方答應了", [target.id], 3)
            remember(target, self.tick, "invite", f"答應{person.name}{when}在{loc.name}{what}", [person.id], 3)
            if purpose == "event":
                fact = person.facts.get(f"community:{at}")
                if fact:
                    learn(target, fact, self.tick, person.id)
        else:
            changes += mutual(state, person.id, target.id, 1, 0)
            remember(person, self.tick, "invite", f"約{target.name}{what}被婉拒了（{why}）", [target.id], 2)
            remember(target, self.tick, "invite", f"婉拒了{person.name}的邀約（{why}）", [person.id], 1)
        changes.append(f"邀約狀態：{'接受' if accepted else '婉拒'}（{why}）")
        need(person, "social", -8, changes)
        need(target, "social", -8, changes)
        self.state.counters["social"] = self.state.counters.get("social", 0) + 1
        say = act.say or f"{when}要不要一起到{loc.name}{what}？"
        reply = "好啊，到時候見！" if accepted else f"抱歉，{why}。"
        return Outcome(f"{person.name}邀請{target.name}{when}到{loc.name}{what}——{'答應了' if accepted else '被婉拒'}",
                       f"邀請{target.name}", changes, targets=[target.id],
                       say=f"{person.name}：「{say}」\n{target.name}：「{reply}」", kind="invite")

    @staticmethod
    def default_place(purpose: str) -> str:
        return {"event": "plaza", "meal": "cafe"}.get(purpose, "plaza")

    # ------------------------------------------------------------------ 約定
    def check_meetings(self) -> None:
        state = self.state
        for inv in state.invitations.values():
            if inv.status != "accepted" or tick_of(inv.day, inv.slot) != self.tick:
                continue
            a, b = state.residents[inv.by], state.residents[inv.to]
            here = [p for p in (a, b) if p.location == inv.location]
            loc = state.locations[inv.location]
            changes: list[str] = []
            if len(here) == 2:
                inv.status = "fulfilled"
                changes += mutual(state, a.id, b.id, 10, 8)
                need(a, "social", -15, changes)
                need(b, "social", -15, changes)
                for p, q in ((a, b), (b, a)):
                    remember(p, self.tick, "meeting", f"和{q.name}依約在{loc.name}見面，很開心", [q.id], 4)
                text = f"{a.name}和{b.name}依約在{loc.name}見面"
                state.counters["social"] = state.counters.get("social", 0) + 1
                success = True
            elif len(here) == 1:
                inv.status = "broken"
                waiting, absent = here[0], (b if here[0] is a else a)
                changes += adjust_relation(state, waiting.id, absent.id, -4, -12, interaction=False)
                remember(waiting, self.tick, "meeting", f"在{loc.name}等{absent.name}，結果被放鴿子了", [absent.id], 4)
                remember(absent, self.tick, "meeting", f"錯過了和{waiting.name}在{loc.name}的約", [waiting.id], 3)
                text = f"{waiting.name}在{loc.name}等了半天，{absent.name}沒有出現"
                success = False
            else:
                inv.status = "expired"
                text = f"{a.name}和{b.name}都忘了在{loc.name}的約"
                success = False
            state.log.append(LogEntry(
                id=state.new_id("log"), tick=self.tick, day=day_of(self.tick), slot=self.slot, kind="meeting",
                actor=a.id, targets=[b.id], location=inv.location, success=success, text=text, changes=changes))

    def bump(self, person: Resident, counter: str, amount: int = 1) -> None:
        person.counters[counter] = person.counters.get(counter, 0) + amount


ACTION_LABELS = {
    "move": "移動", "work": "工作", "rest": "休息", "eat": "吃飯", "shop": "購物",
    "chat": "聊天", "invite": "邀約", "cooperate": "合作",
}
