import Phaser from 'phaser';
import { ACTION_ICONS, ITEM_NAMES, type Location, type LogEntry, type Resident, type WorldState } from '../types';

export const WORLD_W = 960;
export const WORLD_H = 600;
const ROAD_Y = 318;
const HAIR: Record<string, string> = {
  lin: '#7a3b2e',
  chen: '#c9c9c9',
  zhe: '#2b2b2b',
  yu: '#4b3b6b',
  wang: '#6a4424',
  kai: '#1f2a33',
};
const TEXT = { fontFamily: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif', resolution: 3 };

interface Actor {
  id: string;
  box: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  icon: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Ellipse;
  location: string;
}

type SelectHandler = (id: string) => void;

function shade(hex: string, amount: number): number {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const f = (v: number) => Phaser.Math.Clamp(Math.round(v * (1 + amount)), 0, 255);
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

export class TownScene extends Phaser.Scene {
  private actors = new Map<string, Actor>();
  private built = false;
  private ready = false;
  private pending: { state: WorldState; entries: LogEntry[]; animMs: number } | null = null;
  private onSelect: SelectHandler = () => {};
  private selected: string | null = null;
  private markers!: Phaser.GameObjects.Container;
  private labels!: Phaser.GameObjects.Container;
  private night!: Phaser.GameObjects.Rectangle;
  private windows = new Map<string, Phaser.GameObjects.Rectangle>();
  private fx!: Phaser.GameObjects.Container;
  private bubbles: { id: string; box: Phaser.GameObjects.Container }[] = [];

  constructor() {
    super('town');
  }

  create() {
    this.drawGround();
    this.markers = this.add.container(0, 0).setDepth(500);
    this.labels = this.add.container(0, 0).setDepth(400);
    this.night = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0b1033, 0).setOrigin(0).setDepth(800);
    this.fx = this.add.container(0, 0).setDepth(900);
    this.ready = true;
    if (this.pending) {
      const { state, entries, animMs } = this.pending;
      this.pending = null;
      this.sync(state, entries, animMs);
    }
  }

  update() {
    // 對話泡泡跟著說話的人移動
    for (const b of this.bubbles) {
      const actor = this.actors.get(b.id);
      if (actor) b.box.setPosition(actor.box.x, actor.box.y - 62);
    }
  }

  setSelectHandler(fn: SelectHandler) {
    this.onSelect = fn;
  }

  setSelected(id: string | null) {
    this.selected = id;
    this.actors.forEach((a) => a.ring.setVisible(a.id === id));
  }

  // ------------------------------------------------------------------ 同步
  sync(state: WorldState, entries: LogEntry[], animMs: number) {
    if (!this.ready) {
      this.pending = { state, entries, animMs };
      return;
    }
    if (!this.built) {
      this.buildLocations(state);
      this.built = true;
    }
    const residents = Object.values(state.residents);
    const fresh = entries.length === 0;
    for (const person of residents) {
      let actor = this.actors.get(person.id);
      if (!actor) actor = this.createActor(person);
      const target = this.spot(state, person);
      if (fresh || actor.location === person.location) {
        this.tweens.killTweensOf(actor.box);
        if (fresh) actor.box.setPosition(target.x, target.y);
        else this.walk(actor, [target], animMs * 0.5);
      } else {
        const from = { x: actor.box.x, y: actor.box.y };
        const path = [
          { x: from.x, y: ROAD_Y },
          { x: target.x, y: ROAD_Y },
          target,
        ];
        this.walk(actor, path, animMs * 0.8);
      }
      actor.location = person.location;
      this.updateIcon(actor, person, state);
    }
    this.updateLabels(state);
    this.updateMarkers(state);
    this.updateLighting(state);
    for (const b of this.bubbles) {
      this.tweens.killTweensOf(b.box);
      b.box.destroy();
    }
    this.bubbles = [];
    if (!fresh) this.playEntries(state, entries, animMs);
  }

  // ------------------------------------------------------------------ 地圖
  private drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0x8cc06b).fillRect(0, 0, WORLD_W, WORLD_H);
    // 草地紋理
    const rng = new Phaser.Math.RandomDataGenerator(['ai-town']);
    for (let i = 0; i < 900; i++) {
      g.fillStyle(rng.pick([0x7fb35f, 0x9bcb78, 0x86ba65]));
      g.fillRect(rng.between(0, WORLD_W), rng.between(0, WORLD_H), 3, 3);
    }
    // 主要道路
    g.fillStyle(0xcdb38b).fillRect(0, ROAD_Y - 18, WORLD_W, 36);
    g.fillStyle(0xbfa57c);
    for (let x = 0; x < WORLD_W; x += 24) g.fillRect(x, ROAD_Y - 1, 12, 2);
    g.fillStyle(0xa98f68).fillRect(0, ROAD_Y - 18, WORLD_W, 2).fillRect(0, ROAD_Y + 16, WORLD_W, 2);
    // 小河與小橋
    g.fillStyle(0x6fb3d9).fillRect(0, 556, WORLD_W, 44);
    g.fillStyle(0x8fcbe8);
    for (let x = 10; x < WORLD_W; x += 46) g.fillRect(x, 570 + (x % 3) * 6, 18, 2);
    // 樹
    const trees = [
      [30, 40], [360, 40], [400, 250], [620, 40], [900, 40], [930, 260], [40, 380], [120, 420], [250, 400],
      [300, 520], [640, 540], [610, 380], [930, 520], [660, 260],
    ];
    for (const [x, y] of trees) this.drawTree(g, x, y);
    g.setDepth(0);
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x000000, 0.15).fillEllipse(x, y + 22, 34, 10);
    g.fillStyle(0x7a5236).fillRect(x - 3, y + 6, 6, 16);
    g.fillStyle(0x4f8a3c).fillRect(x - 15, y - 12, 30, 20);
    g.fillStyle(0x5e9e47).fillRect(x - 11, y - 20, 22, 12);
    g.fillStyle(0x6db354).fillRect(x - 6, y - 16, 8, 6);
  }

  private buildLocations(state: WorldState) {
    const g = this.add.graphics().setDepth(10);
    for (const loc of Object.values(state.locations)) {
      const left = loc.x - loc.w / 2;
      const top = loc.y - loc.h / 2;
      const yard = top + loc.h * 0.62;
      // 通往主幹道的小路
      if (loc.kind !== 'plaza') {
        const pathTop = loc.y < ROAD_Y ? loc.y + loc.h / 2 : ROAD_Y;
        const pathBottom = loc.y < ROAD_Y ? ROAD_Y : loc.y - loc.h / 2;
        g.fillStyle(0xd8c29b).fillRect(loc.x - 10, pathTop, 20, pathBottom - pathTop);
      } else {
        g.fillStyle(0xd8c29b).fillRect(loc.x - 14, ROAD_Y, 28, top - ROAD_Y);
      }
      if (loc.kind === 'home') {
        const owner = loc.owner ? state.residents[loc.owner] : undefined;
        this.drawHome(g, loc, owner?.color ?? '#999999');
      } else if (loc.kind === 'plaza') {
        this.drawPlaza(g, loc);
      } else {
        this.drawShop(g, loc);
      }
      if (loc.kind !== 'plaza') {
        g.fillStyle(0xe9dcc0).fillRect(left + 4, yard, loc.w - 8, loc.y + loc.h / 2 - yard);
        g.fillStyle(0xd9c9a6);
        for (let x = left + 8; x < left + loc.w - 8; x += 16) g.fillRect(x, yard + 2, 1, loc.y + loc.h / 2 - yard - 4);
      }
      const name = this.add
        .text(loc.x, top - 4, loc.name, {
          ...TEXT,
          fontSize: loc.kind === 'home' ? '11px' : '13px',
          color: '#2f2a24',
          backgroundColor: '#fffaf0cc',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(450);
      name.setData('loc', loc.id);
    }
  }

  private drawHome(g: Phaser.GameObjects.Graphics, loc: Location, color: string) {
    const left = loc.x - loc.w / 2;
    const top = loc.y - loc.h / 2;
    const bodyH = loc.h * 0.62;
    g.fillStyle(0x000000, 0.18).fillRect(left + 6, top + 8, loc.w - 6, bodyH);
    g.fillStyle(0xf4e7cf).fillRect(left + 6, top + 18, loc.w - 12, bodyH - 18);
    g.fillStyle(shade(color, -0.15)).fillRect(left, top + 4, loc.w, 16);
    g.fillStyle(shade(color, 0.05)).fillRect(left + 6, top - 2, loc.w - 12, 8);
    g.fillStyle(0x7a5236).fillRect(loc.x - 7, top + bodyH - 20, 14, 20);
    g.fillStyle(0x5b3b26).fillRect(loc.x + 3, top + bodyH - 11, 2, 2);
    const win = this.add.rectangle(left + 18, top + 32, 12, 10, 0x9fd3e6).setDepth(11).setStrokeStyle(2, 0x6b4a35);
    const win2 = this.add.rectangle(left + loc.w - 18, top + 32, 12, 10, 0x9fd3e6).setDepth(11).setStrokeStyle(2, 0x6b4a35);
    this.windows.set(loc.id, win);
    this.windows.set(`${loc.id}:2`, win2);
  }

  private drawShop(g: Phaser.GameObjects.Graphics, loc: Location) {
    const left = loc.x - loc.w / 2;
    const top = loc.y - loc.h / 2;
    const bodyH = loc.h * 0.62;
    const palette = {
      market: { wall: 0xf1e3c6, roof: 0x81b29a, awning: [0xe07a5f, 0xf4f1de] },
      cafe: { wall: 0xf6e1d3, roof: 0x9c6644, awning: [0xb5838d, 0xf4f1de] },
      workshop: { wall: 0xd9cbb3, roof: 0x6b705c, awning: [0x8d7b68, 0xc9b79c] },
    }[loc.kind as 'market' | 'cafe' | 'workshop'];
    g.fillStyle(0x000000, 0.18).fillRect(left + 6, top + 8, loc.w - 4, bodyH);
    g.fillStyle(palette.wall).fillRect(left + 4, top + 14, loc.w - 8, bodyH - 14);
    g.fillStyle(palette.roof).fillRect(left, top, loc.w, 16);
    g.fillStyle(shade('#000000', 0)).fillRect(left, top + 15, loc.w, 2);
    // 遮雨棚條紋
    for (let i = 0, x = left + 4; x < left + loc.w - 4; x += 14, i++) {
      g.fillStyle(palette.awning[i % 2]).fillRect(x, top + 18, 14, 12);
    }
    // 窗戶與門
    g.fillStyle(0x9fd3e6).fillRect(left + 16, top + 38, 24, 18).fillRect(left + loc.w - 40, top + 38, 24, 18);
    g.lineStyle(2, 0x6b4a35).strokeRect(left + 16, top + 38, 24, 18).strokeRect(left + loc.w - 40, top + 38, 24, 18);
    g.fillStyle(0x6b4a35).fillRect(loc.x - 10, top + bodyH - 26, 20, 26);
    if (loc.kind === 'market') {
      g.fillStyle(0xb08968).fillRect(left + 50, top + 46, 30, 12).fillRect(left + loc.w - 82, top + 46, 30, 12);
      g.fillStyle(0xe63946).fillRect(left + 54, top + 42, 6, 5);
      g.fillStyle(0x90be6d).fillRect(left + 64, top + 42, 8, 5);
      g.fillStyle(0xf9c74f).fillRect(left + loc.w - 78, top + 42, 8, 5);
    }
    if (loc.kind === 'cafe') {
      g.fillStyle(0xffffff).fillRect(left + 54, top + 70, 14, 10).fillRect(left + loc.w - 68, top + 70, 14, 10);
    }
    if (loc.kind === 'workshop') {
      g.fillStyle(0x8d6e4c).fillRect(left + 50, top + 48, 34, 6);
      g.fillStyle(0x9a9a9a).fillRect(left + loc.w - 70, top + 40, 18, 18);
    }
  }

  private drawPlaza(g: Phaser.GameObjects.Graphics, loc: Location) {
    const left = loc.x - loc.w / 2;
    const top = loc.y - loc.h / 2;
    g.fillStyle(0xd6ccc2).fillRect(left, top, loc.w, loc.h);
    g.fillStyle(0xc7bdb2);
    for (let y = top; y < top + loc.h; y += 14)
      for (let x = left + ((y - top) % 28 === 0 ? 0 : 7); x < left + loc.w; x += 14) g.fillRect(x, y, 13, 1);
    // 噴水池
    g.fillStyle(0x9e9e9e).fillCircle(loc.x + 30, loc.y + 6, 26);
    g.fillStyle(0x6fb3d9).fillCircle(loc.x + 30, loc.y + 6, 20);
    g.fillStyle(0xbfe3f2).fillCircle(loc.x + 30, loc.y + 6, 6);
    // 公告欄
    const bx = left + 22;
    const by = top + 18;
    g.fillStyle(0x7a5236).fillRect(bx + 4, by + 30, 4, 18).fillRect(bx + 44, by + 30, 4, 18);
    g.fillStyle(0x9c6644).fillRect(bx, by, 52, 34);
    g.fillStyle(0xe9d8a6).fillRect(bx + 3, by + 3, 46, 28);
    this.add
      .text(bx + 26, by + 50, '公告欄', { ...TEXT, fontSize: '10px', color: '#3d2c29' })
      .setOrigin(0.5, 0)
      .setDepth(12);
    // 長椅
    g.fillStyle(0x8d6e4c).fillRect(left + loc.w - 60, top + loc.h - 30, 44, 8);
    g.fillStyle(0x5b3b26).fillRect(left + loc.w - 58, top + loc.h - 22, 4, 6).fillRect(left + loc.w - 22, top + loc.h - 22, 4, 6);
  }

  // ------------------------------------------------------------------ 居民
  private makeTexture(person: Resident) {
    const key = `char-${person.id}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, 36, 18)!;
    const ctx = tex.context;
    const hair = HAIR[person.id] ?? '#3d2c29';
    for (let f = 0; f < 3; f++) {
      const ox = f * 12;
      const px = (color: string, x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(ox + x, y, w, h);
      };
      px(hair, 3, 0, 6, 3);
      px(hair, 2, 1, 1, 4);
      px(hair, 9, 1, 1, 4);
      px('#f2c9a0', 3, 3, 6, 4);
      px('#222222', 4, 4, 1, 1);
      px('#222222', 7, 4, 1, 1);
      px(person.color, 2, 7, 8, 6);
      px('#f2c9a0', 1, 8, 1, 4);
      px('#f2c9a0', 10, 8, 1, 4);
      px('#3b4a6b', 3, 13, 6, 2);
      const legs = [
        [3, 15, 2, 3, 7, 15, 2, 3],
        [2, 15, 2, 3, 7, 15, 2, 2],
        [3, 15, 2, 2, 8, 15, 2, 3],
      ][f];
      px('#2d3142', legs[0], legs[1], legs[2], legs[3]);
      px('#2d3142', legs[4], legs[5], legs[6], legs[7]);
    }
    tex.refresh();
    for (let f = 0; f < 3; f++) tex.add(f, 0, f * 12, 0, 12, 18);
    this.anims.create({
      key: `${key}-walk`,
      frames: [
        { key, frame: 1 },
        { key, frame: 2 },
      ],
      frameRate: 7,
      repeat: -1,
    });
    return key;
  }

  private createActor(person: Resident): Actor {
    const key = this.makeTexture(person);
    const ring = this.add.ellipse(0, 4, 34, 12).setStrokeStyle(2, 0xffd166).setVisible(false);
    const shadow = this.add.ellipse(0, 4, 24, 8, 0x000000, 0.25);
    const sprite = this.add.sprite(0, -18, key, 0).setScale(2.2);
    const label = this.add
      .text(0, 8, person.name, {
        ...TEXT,
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 3, y: 0 },
      })
      .setOrigin(0.5, 0);
    const icon = this.add.text(0, -46, '', { ...TEXT, fontSize: '15px' }).setOrigin(0.5, 1);
    const box = this.add.container(0, 0, [ring, shadow, sprite, label, icon]).setDepth(300);
    box.setSize(30, 50);
    box.setInteractive(new Phaser.Geom.Rectangle(-15, -40, 30, 56), Phaser.Geom.Rectangle.Contains);
    box.on('pointerdown', () => this.onSelect(person.id));
    box.on('pointerover', () => this.input.setDefaultCursor('pointer'));
    box.on('pointerout', () => this.input.setDefaultCursor('default'));
    const actor: Actor = { id: person.id, box, sprite, icon, ring, location: person.location };
    this.actors.set(person.id, actor);
    ring.setVisible(this.selected === person.id);
    return actor;
  }

  private spot(state: WorldState, person: Resident) {
    const loc = state.locations[person.location];
    const here = Object.values(state.residents)
      .filter((p) => p.location === person.location)
      .map((p) => p.id)
      .sort();
    const i = here.indexOf(person.id);
    if (loc.kind === 'plaza') {
      const cols = 4;
      return { x: loc.x - 60 + (i % cols) * 34, y: loc.y + 34 + Math.floor(i / cols) * 26 };
    }
    const yard = loc.y - loc.h / 2 + loc.h * 0.62;
    const cols = Math.max(1, Math.floor((loc.w - 16) / 30));
    return {
      x: loc.x - loc.w / 2 + 22 + (i % cols) * 30,
      y: yard + 22 + Math.floor(i / cols) * 18,
    };
  }

  private walk(actor: Actor, points: { x: number; y: number }[], total: number) {
    this.tweens.killTweensOf(actor.box);
    let prev = { x: actor.box.x, y: actor.box.y };
    const legs = points
      .map((p) => {
        const d = Phaser.Math.Distance.Between(prev.x, prev.y, p.x, p.y);
        const leg = { ...p, d, dx: p.x - prev.x };
        prev = p;
        return leg;
      })
      .filter((l) => l.d > 0.5);
    if (legs.length === 0) return;
    const dist = legs.reduce((s, l) => s + l.d, 0);
    actor.sprite.play(`char-${actor.id}-walk`);
    this.tweens.chain({
      targets: actor.box,
      tweens: legs.map((l) => ({
        x: l.x,
        y: l.y,
        duration: Math.max(60, (total * l.d) / dist),
        ease: 'Linear',
        onStart: () => {
          if (Math.abs(l.dx) > 1) actor.sprite.setFlipX(l.dx < 0);
        },
      })),
      onComplete: () => {
        actor.sprite.stop();
        actor.sprite.setFrame(0);
      },
    });
  }

  private updateIcon(actor: Actor, person: Resident, state: WorldState) {
    const act = person.last_action;
    let icon = act ? ACTION_ICONS[act.type] : '';
    if (act && !person.last_success) icon = '❌';
    else if (act?.type === 'rest' && person.location === person.home && state.tick % 6 === 0) icon = '💤';
    actor.icon.setText(icon);
    actor.sprite.setAlpha(person.activity === '睡覺' ? 0.75 : 1);
  }

  // ------------------------------------------------------------------ 標示與事件
  private updateLabels(state: WorldState) {
    this.labels.removeAll(true);
    const tag = (x: number, y: number, text: string, color = '#3d2c29', bg = '#fffaf0dd') =>
      this.labels.add(
        this.add
          .text(x, y, text, { ...TEXT, fontSize: '10px', color, backgroundColor: bg, padding: { x: 3, y: 1 } })
          .setOrigin(0.5, 0),
      );
    const slot = state.tick % 6;
    for (const loc of Object.values(state.locations)) {
      const top = loc.y - loc.h / 2;
      if (loc.kind !== 'home' && !loc.open_slots.includes(slot)) tag(loc.x, top + 2, '休息中', '#ffffff', '#555555cc');
      if (loc.kind === 'market') {
        const shelf = Object.entries(loc.stock)
          .map(([k, v]) => `${ITEM_NAMES[k] ?? k}${v}`)
          .join(' ');
        tag(loc.x, loc.y + loc.h / 2 + 2, shelf);
      }
      if (loc.kind === 'cafe') tag(loc.x, loc.y + loc.h / 2 + 2, `套餐 ×${loc.stock.meal ?? 0}`);
      if (loc.kind === 'plaza' && loc.notices.length)
        tag(loc.x - loc.w / 2 + 48, top + 22, `${loc.notices.length} 則`, '#7a1f1f', '#fff3c4');
    }
  }

  private updateMarkers(state: WorldState) {
    this.markers.removeAll(true);
    const banner = (loc: Location, text: string, color: number) => {
      const t = this.add
        .text(loc.x, loc.y - loc.h / 2 + 34, text, {
          ...TEXT,
          fontSize: '12px',
          color: '#ffffff',
          backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);
      this.markers.add(t);
      this.tweens.add({ targets: t, scale: 1.08, yoyo: true, repeat: -1, duration: 600 });
    };
    for (const loc of Object.values(state.locations)) {
      for (const eq of Object.values(loc.equipment)) {
        if (eq.working) continue;
        banner(loc, `⚠ ${eq.name}故障`, 0xc0392b);
        for (let i = 0; i < 3; i++) {
          const puff = this.add.circle(loc.x + 30 + i * 8, loc.y - loc.h / 2 + 6, 6, 0x555555, 0.6);
          this.markers.add(puff);
          this.tweens.add({
            targets: puff,
            y: puff.y - 26,
            alpha: 0,
            scale: 1.8,
            duration: 1400,
            delay: i * 450,
            repeat: -1,
          });
        }
      }
    }
    for (const ev of state.events) {
      const loc = ev.location ? state.locations[ev.location] : undefined;
      if (!loc || ev.resolved) continue;
      if (ev.type === 'market_shortage' && ev.start_tick <= state.tick && state.tick < ev.end_tick)
        banner(loc, '📦 缺貨中', 0xd35400);
      if (ev.type === 'community_event') {
        const at = Number(ev.params.at_tick);
        banner(loc, `🎉 ${ev.title}（第 ${Math.floor(at / 6) + 1} 天傍晚）`, 0x8e44ad);
        const g = this.add.graphics();
        const left = loc.x - loc.w / 2;
        const colors = [0xe63946, 0xf9c74f, 0x43aa8b, 0x577590];
        for (let i = 0; i < 12; i++) {
          g.fillStyle(colors[i % 4]).fillTriangle(
            left + 10 + i * 18, loc.y - loc.h / 2 + 4,
            left + 22 + i * 18, loc.y - loc.h / 2 + 4,
            left + 16 + i * 18, loc.y - loc.h / 2 + 14,
          );
        }
        this.markers.add(g);
      }
    }
  }

  private updateLighting(state: WorldState) {
    const slot = state.tick % 6;
    // 顯示的是「下一個要模擬的時段」的天色
    const looks = [
      { color: 0x6a7fdb, alpha: 0.14 },
      { color: 0x000000, alpha: 0 },
      { color: 0x000000, alpha: 0 },
      { color: 0xffb347, alpha: 0.05 },
      { color: 0xff7f50, alpha: 0.2 },
      { color: 0x0b1033, alpha: 0.45 },
    ][slot];
    this.tweens.add({ targets: this.night, fillAlpha: looks.alpha, duration: 600 });
    this.night.fillColor = looks.color;
    const dark = slot === 5 || slot === 0;
    for (const [key, win] of this.windows) {
      const home = key.split(':')[0];
      const owner = Object.values(state.residents).find((r) => r.home === home);
      const lit = dark && owner?.location === home;
      win.setFillStyle(lit ? 0xffe08a : 0x9fd3e6);
      win.setDepth(lit ? 850 : 11);
    }
  }

  private playEntries(state: WorldState, entries: LogEntry[], animMs: number) {
    const nameToId = new Map(Object.values(state.residents).map((r) => [r.name, r.id]));
    let delay = animMs * 0.75;
    for (const entry of entries) {
      if (entry.say && entry.success) {
        const lines = entry.say.split('\n');
        lines.forEach((line, i) => {
          const m = line.match(/^(.+?)：「(.*)」$/);
          const id = m ? nameToId.get(m[1]) : entry.actor;
          const text = m ? m[2] : line;
          const gap = Math.min(900, animMs * 0.6);
          if (id) this.time.delayedCall(delay + i * gap, () => this.bubble(id, text, Math.min(2600, animMs * 2.6)));
        });
        delay += 250;
      }
      if (entry.kind === 'event' || entry.kind === 'goal') {
        const loc = entry.location ? state.locations[entry.location] : undefined;
        const actor = entry.actor ? this.actors.get(entry.actor) : undefined;
        const x = loc?.x ?? actor?.box.x ?? WORLD_W / 2;
        const y = loc ? loc.y - 10 : (actor?.box.y ?? WORLD_H / 2) - 60;
        const short = entry.text.replace(/^【.+?】/, '').slice(0, 26);
        this.time.delayedCall(entry.kind === 'event' ? 0 : delay, () =>
          this.floatText(x, y, entry.kind === 'goal' ? short : `❗ ${short}`, entry.kind === 'goal' ? '#1d6f42' : '#8e1b1b'),
        );
        if (entry.text.includes('人參加') && loc) this.time.delayedCall(delay, () => this.confetti(loc));
      }
    }
  }

  private bubble(id: string, text: string, life: number) {
    const actor = this.actors.get(id);
    if (!actor) return;
    const content = text.length > 34 ? `${text.slice(0, 33)}…` : text;
    const label = this.add.text(0, 0, content, {
      ...TEXT,
      fontSize: '11px',
      color: '#222222',
      wordWrap: { width: 150, useAdvancedWrap: true },
    });
    const w = label.width + 12;
    const h = label.height + 8;
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.96).fillRoundedRect(-w / 2, -h, w, h, 6);
    bg.lineStyle(1.5, 0x333333).strokeRoundedRect(-w / 2, -h, w, h, 6);
    bg.fillStyle(0xffffff).fillTriangle(-5, -1, 5, -1, 0, 7);
    label.setPosition(-w / 2 + 6, -h + 4);
    // 同一個人的新泡泡取代舊的
    this.bubbles = this.bubbles.filter((b) => {
      if (b.id !== id) return true;
      this.tweens.killTweensOf(b.box);
      b.box.destroy();
      return false;
    });
    const box = this.add.container(actor.box.x, actor.box.y - 62, [bg, label]);
    this.fx.add(box);
    box.setAlpha(0);
    this.bubbles.push({ id, box });
    this.tweens.add({ targets: box, alpha: 1, duration: 180 });
    this.time.delayedCall(life, () => {
      if (!box.active) return;
      this.tweens.add({
        targets: box,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          this.bubbles = this.bubbles.filter((b) => b.box !== box);
          box.destroy();
        },
      });
    });
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, {
        ...TEXT,
        fontSize: '14px',
        color,
        backgroundColor: '#ffffffee',
        padding: { x: 6, y: 3 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.fx.add(t);
    this.tweens.add({ targets: t, y: y - 40, duration: 2600, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600, onComplete: () => t.destroy() });
  }

  private confetti(loc: Location) {
    const colors = [0xe63946, 0xf9c74f, 0x43aa8b, 0x577590, 0xf3722c];
    for (let i = 0; i < 40; i++) {
      const p = this.add.rectangle(
        loc.x + Phaser.Math.Between(-loc.w / 2, loc.w / 2),
        loc.y - loc.h / 2 - 10,
        4,
        6,
        Phaser.Utils.Array.GetRandom(colors),
      );
      this.fx.add(p);
      this.tweens.add({
        targets: p,
        y: loc.y + Phaser.Math.Between(-20, loc.h / 2),
        angle: Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: Phaser.Math.Between(1200, 2200),
        onComplete: () => p.destroy(),
      });
    }
  }
}
