"""規則型 Agent（預設，不需要 API Key）。

這是一組「需求 → 意圖 → 行動」的優先序規則，加上依人格特質調整的
固定亂數（同一個 seed 結果一定相同）。它只讀取 perceive() 給的資訊，
不會偷看其他居民的內在狀態。所有理由都以「規則：」開頭，UI 不會把它
當成 LLM 推理。
"""

from __future__ import annotations

import random
from typing import Optional

from ..models import Action, Decision

FOODS = ("bread", "vegetables")


class Ctx:
    """把一份觀察整理成規則好用的查詢。"""

    def __init__(self, p: dict, rng: random.Random):
        self.p = p
        self.rng = rng
        self.me = p["self"]
        self.id = self.me["id"]
        self.tick = p["time"]["tick"]
        self.slot = p["time"]["slot"]
        self.day = p["time"]["day"]
        self.needs = self.me["needs"]
        self.money = self.me["money"]
        self.inv = self.me["inventory"]
        self.here = p["here"]
        self.loc = self.me["location"]
        self.home = self.me["home"]
        self.traits = self.me["traits"]
        self.facts = {f["id"]: f for f in p["facts"]}
        self.map = {m["id"]: m for m in p["map"]}
        self.people = {d["id"]: d for d in p["directory"]}
        self.relations = p["relations"]

    # ---------------------------------------------------------------- 查詢
    def open_now(self, loc: str) -> bool:
        m = self.map.get(loc)
        return bool(m) and self.slot in m["open_slots"]

    def owner_of(self, loc: str) -> Optional[str]:
        m = self.map.get(loc)
        return m["owner"] if m else None

    def food(self, allow_veg: bool = True) -> Optional[str]:
        for item in FOODS:
            if item == "vegetables" and not allow_veg:
                continue
            if self.inv.get(item, 0) > 0:
                return item
        return None

    def shortage(self) -> bool:
        return "shortage:market" in self.facts

    def market_has(self, item: str) -> bool:
        if item in ("bread", "vegetables") and self.shortage():
            return False
        seen = self.p["beliefs"].get("market_stock")
        if seen and self.tick - seen["tick"] <= 2:
            return seen.get(item, 0) > 0
        return True

    def broken_known(self) -> list[tuple[str, str]]:
        out = []
        for fid in self.facts:
            if fid.startswith("broken:"):
                _, loc, eq = fid.split(":")
                out.append((loc, eq))
        return sorted(out)

    def site_broken(self, loc: str) -> bool:
        return any(l == loc for l, _ in self.broken_known())

    def present(self) -> list[dict]:
        return self.here["people"]

    def expected_at(self, rid: str) -> Optional[str]:
        """依公開的工作時間表猜某人現在在哪（不一定對）。"""
        person = self.people.get(rid)
        if not person:
            return None
        slot_names = self.p["time"]["slots"]
        if slot_names[self.slot] in person["work_slots"]:
            for site in person["workplaces"]:
                if site in self.map and self.open_now(site):
                    return site
        return None

    def rel(self, rid: str) -> dict:
        return self.relations.get(rid, {"familiarity": 0, "trust": 30})

    def invites(self) -> list[dict]:
        return self.p["invitations"]

    def invited_with(self, rid: str) -> bool:
        return any(i["with"] == rid and i["day"] == self.day for i in self.invites())

    def find(self, job: str) -> Optional[str]:
        for rid, person in self.people.items():
            if rid != self.id and person["occupation"] == job:
                return rid
        return None


def decision(action: Action, intention: str, reason: str) -> Decision:
    return Decision(action=action, intention=intention, reasoning=f"規則：{reason}", source="rule")


class RuleBasedProvider:
    mode = "rule"

    def __init__(self, seed: int = 0):
        self.seed = seed

    def _rng(self, p: dict, salt: str = "") -> random.Random:
        return random.Random(f"{self.seed}:{p['time']['tick']}:{p['self']['id']}:{salt}")

    # ------------------------------------------------------------------ 決策
    def decide(self, p: dict) -> Decision:
        c = Ctx(p, self._rng(p))
        for rule in (self.night, self.exhausted, self.commitment, self.community_event, self.hungry,
                     self.urgent_job, self.supplies, self.organize, self.social, self.work, self.help_friend):
            result = rule(c)
            if result:
                return result
        return self.free_time(c)

    def night(self, c: Ctx) -> Optional[Decision]:
        if c.slot == 5:
            return decision(Action(type="rest", location=c.home), "回家睡覺", "夜晚時段一律回家睡覺")
        return None

    def exhausted(self, c: Ctx) -> Optional[Decision]:
        if c.needs["energy"] <= 20:
            return decision(Action(type="rest", location=c.home), "太累了，回家補眠",
                            f"精力 {c.needs['energy']} ≤ 20，優先休息")
        return None

    def commitment(self, c: Ctx) -> Optional[Decision]:
        for inv in c.invites():
            if inv["status"] == "accepted" and inv["tick"] == c.tick:
                loc = inv["location"]
                name = inv["with_name"]
                if loc == "cafe" and c.needs["hunger"] >= 30 and (c.money >= 12 or c.owner_of("cafe") == c.id):
                    return decision(Action(type="eat", location=loc), f"赴約：和{name}在咖啡廳吃飯",
                                    f"已答應的約在這個時段（{inv['id']}），去咖啡廳邊吃邊等")
                return decision(Action(type="chat", location=loc, target=inv["with"]), f"赴約：和{name}見面",
                                f"已答應的約在這個時段（{inv['id']}），守信用比其他事重要")
        return None

    def community_event(self, c: Ctx) -> Optional[Decision]:
        fact = c.facts.get(f"community:{c.tick}")
        if not fact:
            return None
        hosts = [rid for rid, d in c.people.items() if d["occupation"] == "社區志工"]
        if c.id in hosts or not hosts:
            return decision(Action(type="move", location="plaza"), "主持社區活動", "自己辦的活動，準時到場")
        return decision(Action(type="chat", location="plaza", target=hosts[0]), "參加廣場的社區活動",
                        f"知道「{fact['text']}」，現在就是活動時間")

    def hungry(self, c: Ctx) -> Optional[Decision]:
        h = c.needs["hunger"]
        veg_ok = c.me["job"] != "barista" or h >= 80
        food = c.food(veg_ok)
        breakfast = c.slot == 0 and h >= 30 and food
        lunch = c.slot == 2 and h >= 45
        if not (h >= 60 or breakfast or lunch):
            return None
        if food and (c.loc == c.home or c.slot == 0):
            return decision(Action(type="eat", location=c.home, item=food), "在家吃點東西",
                            f"飢餓 {h}，身上有{'麵包' if food == 'bread' else '蔬菜'}")
        cafe_ok = c.open_now("cafe") and (c.money >= 12 or c.owner_of("cafe") == c.id)
        seen = c.p["beliefs"].get("cafe_meals")
        if seen and c.tick - seen["tick"] <= 1 and seen["meals"] == 0:
            cafe_ok = False
        if cafe_ok and (not food or c.traits["sociable"] >= 0.5 or c.money >= 40):
            return decision(Action(type="eat", location="cafe"), "去咖啡廳吃飯", f"飢餓 {h}，咖啡廳有開而且付得起")
        if food:
            where = c.loc if c.open_now(c.loc) else c.home
            return decision(Action(type="eat", location=where, item=food), "隨便吃點帶在身上的東西", f"飢餓 {h}，身上有食物")
        if c.open_now("market") and c.money >= 8 and c.market_has("bread"):
            return decision(Action(type="shop", location="market", item="bread", quantity=2), "去市場買麵包",
                            f"飢餓 {h}，身上沒食物，市場應該有麵包")
        if h >= 60:
            reason = "市場缺貨" if c.shortage() else ("錢不夠" if c.money < 8 else "店都沒開")
            return decision(Action(type="rest", location=c.home), "沒東西吃，先回家忍耐", f"飢餓 {h} 但{reason}")
        return None

    def urgent_job(self, c: Ctx) -> Optional[Decision]:
        job = c.me["job"]
        broken = c.broken_known()
        if job == "repairer":
            for loc, eq in broken:
                if not c.open_now(loc):
                    continue
                if c.inv.get("parts", 0) >= 1:
                    return decision(Action(type="work", location=loc), f"去{c.map[loc]['name']}修理設備",
                                    f"知道 {loc} 的設備壞了，身上有零件")
                if c.open_now("market") and c.money >= 15 and c.market_has("parts"):
                    return decision(Action(type="shop", location="market", item="parts"), "先去市場買零件",
                                    "有設備要修但沒有零件")
            return None
        repairer = c.find("修理工")
        for loc, eq in broken:
            if c.owner_of(loc) != c.id or not repairer:
                continue
            told = c.p["beliefs"].get("told", {}).get(f"broken:{loc}:{eq}", [])
            if repairer in told:
                continue
            where = c.expected_at(repairer)
            if where:
                name = c.people[repairer]["name"]
                return decision(Action(type="chat", location=where, target=repairer,
                                       say=f"{name}，我們{c.map[loc]['name']}的設備壞了，可以來幫忙修嗎？"),
                                f"去找{name}來修設備", f"自己店裡的設備壞了，{name}這時段通常在{where}")
        return None

    def supplies(self, c: Ctx) -> Optional[Decision]:
        if not c.open_now("market"):
            return None
        job = c.me["job"]
        if job == "carpenter" and c.inv.get("wood", 0) < 2 and c.money >= 20 and c.market_has("wood"):
            return decision(Action(type="shop", location="market", item="wood", quantity=2), "去市場買木材",
                            "木材不到 2 份，做不了家具")
        if job == "barista" and c.inv.get("vegetables", 0) < 1 and c.money >= 12 and c.slot in (0, 4) \
                and c.market_has("vegetables"):
            return decision(Action(type="shop", location="market", item="vegetables", quantity=2), "買蔬菜準備做套餐",
                            "沒有蔬菜，套餐產量會減少")
        if job == "repairer" and c.inv.get("parts", 0) < 1 and c.money >= 15 and c.slot in (0, 4) \
                and c.market_has("parts"):
            return decision(Action(type="shop", location="market", item="parts"), "補一個備用零件", "身上沒有零件")
        food_count = sum(c.inv.get(k, 0) for k in FOODS)
        if food_count == 0 and c.money >= 16 and c.slot in (0, 3, 4) and c.market_has("bread") \
                and job != "grocer":
            return decision(Action(type="shop", location="market", item="bread", quantity=2), "去市場囤點麵包",
                            "家裡沒有存糧")
        return None

    def organize(self, c: Ctx) -> Optional[Decision]:
        if c.me["job"] != "organizer":
            return None
        upcoming = [f for fid, f in c.facts.items() if fid.startswith("community:") and int(fid.split(":")[1]) > c.tick]
        if not upcoming or c.slot == 5:
            return None
        event_tick = int(upcoming[0]["id"].split(":")[1])
        event_day, event_slot = event_tick // 6 + 1, event_tick % 6
        invited = {i["with"] for i in c.invites() if i["purpose"] == "event" and i["from_me"]}
        candidates = [d for d in c.present() if d["id"] not in invited]
        say = f"第 {event_day} 天傍晚廣場有聚會，一起來吧！"
        if candidates and c.open_now(c.loc) and c.here["kind"] != "home":
            return decision(Action(type="invite", location=c.loc, purpose="event", invite_location="plaza",
                                   invite_day=event_day, invite_slot=event_slot, say=say),
                            "邀請身邊的人參加社區活動", "有活動要辦，現場還有沒邀請過的人，就當面邀請")
        elsewhere = [(rid, c.expected_at(rid)) for rid in c.people if rid != c.id and rid not in invited]
        elsewhere = sorted((rid, loc) for rid, loc in elsewhere if loc)
        if elsewhere and c.rng.random() < 0.8:
            rid, loc = c.rng.choice(elsewhere)
            return decision(Action(type="invite", location=loc, target=rid, purpose="event", invite_location="plaza",
                                   invite_day=event_day, invite_slot=event_slot, say=say),
                            f"去{c.map[loc]['name']}邀請{c.people[rid]['name']}",
                            f"要邀請大家參加活動，{c.people[rid]['name']}這時段通常在{loc}")
        return None

    def social(self, c: Ctx) -> Optional[Decision]:
        s = c.needs["social"]
        sociable = c.traits["sociable"]
        if not (s >= 65 or (s >= 45 and c.rng.random() < sociable * 0.6)):
            return None
        present = c.present()
        if present and c.open_now(c.loc) and c.here["kind"] != "home":
            target = max(present, key=lambda d: (c.rel(d["id"])["familiarity"] + c.rng.random() * 15, d["id"]))
            rel = c.rel(target["id"])
            if rel["familiarity"] >= 25 and c.slot <= 2 and not c.invited_with(target["id"]) and c.rng.random() < 0.4 \
                    and c.money >= 12:
                return decision(Action(type="invite", location=c.loc, target=target["id"], purpose="meal",
                                       invite_location="cafe", invite_day=c.day, invite_slot=4),
                                f"約{target['name']}傍晚吃飯", f"孤單 {s}，和{target['name']}已經有點熟了")
            # 不指定對象：留在原地，跟移動後仍在現場的人聊天
            return decision(Action(type="chat", location=c.loc), "留下來跟身邊的人聊聊",
                            f"孤單 {s}，{c.here['name']}現在有 {len(present)} 個人")
        options = []
        for rid in c.people:
            if rid == c.id:
                continue
            where = c.expected_at(rid)
            if where and where != c.home:
                options.append((c.rel(rid)["familiarity"] + c.rng.random() * 20, rid, where))
        if options:
            _, rid, where = max(options)
            name = c.people[rid]["name"]
            return decision(Action(type="chat", location=where, target=rid), f"去{c.map[where]['name']}找{name}聊天",
                            f"孤單 {s}，{name}這時段通常在{where}")
        if c.open_now("plaza"):
            return decision(Action(type="move", location="plaza"), "去廣場透透氣", f"孤單 {s}，廣場可能遇到人")
        return None

    def work(self, c: Ctx) -> Optional[Decision]:
        me = c.me
        if c.slot not in me["work_slots"]:
            return None
        if c.needs["energy"] < 30 and c.rng.random() > c.traits["diligent"]:
            return None
        sites = [s for s in me["job_sites"] if c.open_now(s) or s == c.home]
        if me["job"] == "illustrator":
            prefer = "cafe" if c.rng.random() < c.traits["sociable"] and c.open_now("cafe") else c.home
            sites = [prefer]
        if me["job"] == "repairer":
            sites = ["workshop"] if c.open_now("workshop") else []
            carpenter = c.find("木工")
            if sites and carpenter and c.expected_at(carpenter) == "workshop" and not c.site_broken("workshop") \
                    and c.rel(carpenter)["familiarity"] >= 40 and c.rng.random() < 0.5:
                name = c.people[carpenter]["name"]
                return decision(Action(type="cooperate", location="workshop", target=carpenter),
                                f"幫{name}趕家具", f"沒有待修設備，和{name}很熟，順手幫忙")
        sites = [s for s in sites if not c.site_broken(s)]
        if me["job"] == "carpenter" and c.inv.get("wood", 0) < 2:
            return None
        if not sites:
            return None
        site = sites[0]
        name = c.map[site]["name"] if site in c.map else site
        return decision(Action(type="work", location=site), f"在{name}工作", f"{c.p['time']['slot_name']}是固定工作時段")

    def help_friend(self, c: Ctx) -> Optional[Decision]:
        if c.traits["generous"] < 0.6 or c.needs["energy"] < 40 or c.rng.random() > 0.35:
            return None
        friends = []
        for rid in c.people:
            if rid == c.id or c.rel(rid)["familiarity"] < 25:
                continue
            where = c.expected_at(rid)
            if where and where in c.map and c.map[where]["kind"] != "home" and not c.site_broken(where):
                friends.append((c.rel(rid)["familiarity"], rid, where))
        if not friends:
            return None
        _, rid, where = max(friends)
        name = c.people[rid]["name"]
        return decision(Action(type="cooperate", location=where, target=rid), f"去幫{name}的忙",
                        f"現在有空、個性熱心，{name}這時段在{where}工作")

    def free_time(self, c: Ctx) -> Decision:
        if c.needs["energy"] < 55:
            return decision(Action(type="rest", location=c.home), "回家休息一下", f"精力 {c.needs['energy']}，有空就休息")
        roll = c.rng.random()
        if roll < 0.5 and c.open_now("plaza"):
            return decision(Action(type="move", location="plaza"), "去廣場散步", "空閒時段，到廣場走走")
        if roll < 0.75 and c.open_now("cafe") and c.money >= 30 and c.needs["hunger"] >= 35:
            return decision(Action(type="eat", location="cafe"), "去咖啡廳坐坐", "空閒又有點餓")
        return decision(Action(type="rest", location=c.home), "在家放空", "空閒時段，留在家裡")

    # ------------------------------------------------------------------ 回應邀約
    def respond_invitation(self, p: dict, invitation: dict) -> tuple[bool, str]:
        c = Ctx(p, self._rng(p, f"invite:{invitation['id']}"))
        at = (invitation["day"] - 1) * 6 + invitation["slot"]
        for inv in c.invites():
            if inv["status"] == "accepted" and inv["tick"] == at:
                return False, "那個時間已經有約了"
        rel = c.rel(invitation["by"])
        score = rel["familiarity"] * 0.5 + rel["trust"] * 0.5 + c.traits["sociable"] * 30
        if invitation["purpose"] == "event":
            score += 20
        if score >= 35:
            return True, "很樂意"
        return False, "我們還不太熟，下次吧"
