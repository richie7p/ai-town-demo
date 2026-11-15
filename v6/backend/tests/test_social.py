from aitown.models import Action, Fact

from .conftest import place, scripted_step


def test_chat_leaves_records_on_both_sides(sim):
    sim.state.tick = 1
    place(sim, yu="plaza", wang="plaza")
    before = sim.state.residents["yu"].relations["wang"].model_copy()
    scripted_step(sim, {"yu": Action(type="chat", location="plaza", target="wang", say="你好，我剛搬來！")})
    chats = [e for e in sim.state.log if e.kind == "chat"]
    assert len(chats) == 1 and chats[0].success
    assert "你好，我剛搬來！" in chats[0].say
    yu, wang = sim.state.residents["yu"], sim.state.residents["wang"]
    assert yu.relations["wang"].interactions == before.interactions + 1
    assert wang.relations["yu"].interactions == 1
    assert yu.relations["wang"].familiarity > before.familiarity
    assert any(m.kind == "chat" and "wang" in m.with_ids for m in yu.memories)
    assert any(m.kind == "chat" and "yu" in m.with_ids for m in wang.memories)
    assert sim.state.counters["social"] == 1


def test_chat_spreads_knowledge(sim):
    sim.state.tick = 1
    place(sim, chen="plaza", yu="plaza")
    fact = Fact(id="shortage:market", text="市場缺貨", learned_tick=0, source="seen", importance=4)
    sim.state.residents["chen"].facts[fact.id] = fact
    scripted_step(sim, {"chen": Action(type="chat", location="plaza", target="yu")})
    assert "shortage:market" in sim.state.residents["yu"].facts
    assert sim.state.residents["yu"].facts["shortage:market"].source == "chen"


def test_chat_fails_when_target_is_elsewhere(sim):
    sim.state.tick = 1
    place(sim, yu="plaza", wang="market")
    scripted_step(sim, {"yu": Action(type="chat", location="plaza", target="wang")})
    entry = [e for e in sim.state.log if e.actor == "yu"][-1]
    assert not entry.success and "撲空" in entry.reason
    assert sim.state.residents["yu"].relations["wang"].interactions == 0


def test_kept_invitation_builds_trust_and_broken_one_hurts(sim):
    sim.state.tick = 1
    place(sim, lin="cafe", yu="cafe", kai="cafe")
    scripted_step(sim, {
        "yu": Action(type="invite", location="cafe", target="lin", purpose="meal", invite_location="cafe",
                     invite_day=1, invite_slot=2),
        "kai": Action(type="invite", location="cafe", target="lin", purpose="meal", invite_location="cafe",
                      invite_day=1, invite_slot=3),
    })
    invites = list(sim.state.invitations.values())
    assert [i.status for i in invites] == ["accepted", "accepted"]
    trust_yu = sim.state.residents["yu"].relations["lin"].trust
    # 第 1 天中午：兩人都到咖啡廳
    scripted_step(sim, {"yu": Action(type="move", location="cafe"), "lin": Action(type="move", location="cafe")})
    by_yu = next(i for i in invites if i.by == "yu")
    assert by_yu.status == "fulfilled"
    assert sim.state.residents["yu"].relations["lin"].trust > trust_yu
    # 第 1 天下午：阿凱到了，林曉沒來
    trust_kai = sim.state.residents["kai"].relations["lin"].trust
    scripted_step(sim, {"kai": Action(type="move", location="cafe"), "lin": Action(type="move", location="plaza")})
    by_kai = next(i for i in invites if i.by == "kai")
    assert by_kai.status == "broken"
    assert sim.state.residents["kai"].relations["lin"].trust < trust_kai
    assert any("放鴿子" in m.text for m in sim.state.residents["kai"].memories)


def test_cooperation_requires_the_partner_to_actually_work(sim):
    sim.state.tick = 1
    place(sim, zhe="workshop", kai="workshop")
    scripted_step(sim, {"kai": Action(type="cooperate", location="workshop", target="zhe")})
    assert not [e for e in sim.state.log if e.actor == "kai"][-1].success
    money = sim.state.residents["zhe"].money
    scripted_step(sim, {"kai": Action(type="cooperate", location="workshop", target="zhe"),
                        "zhe": Action(type="work", location="workshop")})
    coop = [e for e in sim.state.log if e.actor == "kai"][-1]
    assert coop.success and coop.kind == "cooperate"
    assert sim.state.counters["cooperations"] == 1
    assert sim.state.residents["zhe"].money > money  # 家具收入 + 合作加成 - 分給阿凱的錢
