// The Phaser town: residents replaying completed V5 frames, a free camera and
// an optional visitor to walk around with.
//
// Residents only ever show recorded frames. The visitor is a separate
// presentation actor; neither its movement nor inspecting furniture changes a
// research record. Game objects are created in a fixed order because Phaser
// draws objects of equal depth in creation order.
import { ACTION_NAMES, TICKS_PER_DAY } from './config.js';
import * as townAssets from './town-assets.js';
import { RESIDENT_CLIPS } from './resident-motion.js';
import { RESIDENT_SCALE, SEATED_OFFSET, motionRate, walkDuration, seatedPose } from './character-motion.js';
import {
  WORLD_SIZE,
  ZONE_CENTERS,
  clampZoom,
  isContinuousFrame,
  characterPosition,
  presentationPath,
  samplePath,
  directionBetween,
  characterPresentation,
  visibleUtterances,
} from './town-view-model.js';
import {
  TILE_SIZE,
  MAP_OBJECTS,
  isWalkable,
  findWalkPath,
  nearestWalkable,
  locationAt,
  createMinimapDataUrl,
} from './town-map.js';
import { activityAnchor } from './activity-anchors.js';
import { drawVisitorSheet, VISITOR_FRAME, VISITOR_DIRECTIONS } from './visitor-art.js';
import { wrapText, placeBubbles } from './speech-bubbles.js';

const { width: W, height: H } = WORLD_SIZE;
/** The canvas is always 1200 CSS pixels wide; its height follows the host's aspect ratio. */
const VIEW_WIDTH = 1200;
const FONT = '"Microsoft JhengHei", "Noto Sans TC", sans-serif';
const INITIAL_ZOOM = 1.65;
const ZOOM_STEP = 0.25;
const FOLLOW_ZOOM = 3;
const CLOSE_ZOOM = 2.2;
/** Names are shown for everyone from this zoom; below it only for the selected resident. */
const NAME_ZOOM = 1.4;
const DRAG_THRESHOLD = 6;
const FOLLOW_LERP = 0.14;
const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);
/** Keyboard walking: first matching direction wins. */
const KEY_DIRECTIONS = [
  [
    ['w', 'arrowup'],
    [0, -1, 'up'],
  ],
  [
    ['s', 'arrowdown'],
    [0, 1, 'down'],
  ],
  [
    ['a', 'arrowleft'],
    [-1, 0, 'left'],
  ],
  [
    ['d', 'arrowright'],
    [1, 0, 'right'],
  ],
];
/** Visitor speed in pixels per millisecond; long frames are capped so it never jumps. */
const VISITOR_SPEED = 0.19;
const MAX_FRAME_MS = 50;
const VISITOR_STEP_MS = 120;
const INSPECT_RADIUS = TILE_SIZE * 2.25;
/** Walking residents take one eight-frame stride per 72 pixels. */
const STRIDE_LENGTH = 72;
const SIT_MS = 480;
const MAX_BUBBLES = 3;
const BUBBLE_TEXT_LIMIT = 64;
const GARDEN_WALKWAY = '花園步道';

const DEPTH = {
  background: 0,
  route: 2,
  evening: 3000,
  lampGlow: 3005,
  lampCore: 3006,
  marker: 3200,
  equipmentLabel: 3300,
  badges: 3400,
  visitorBadge: 3490,
  highlight: 3500,
  bubbles: 6000,
};

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const pathLength = path =>
  path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0);
/** Changes when a resident's identity or position in the list changes, so their sprite must be rebuilt. */
const appearanceIdentity = (agent, index) => JSON.stringify([agent.id, agent.name, agent.color, index]);

/**
 * Create the town in `host`. Returns an API that never throws: rendering
 * problems are reported through `onError`.
 */
export function createTownScene(
  host,
  {
    onSelect = () => {},
    onCameraChange = () => {},
    onExploreChange = () => {},
    onInspectObject = () => {},
    onReady = () => {},
    onError = () => {},
  } = {},
) {
  const Phaser = globalThis.Phaser;
  let game;
  let scene;
  let pending = null;
  let destroyed = false;
  let resizeObserver;

  // Camera and mode state, shared by the API and the scene.
  const deviceRatio = () => clamp(globalThis.devicePixelRatio || 1, 1, 2);
  const measureViewHeight = () =>
    host?.clientWidth > 0 && host?.clientHeight > 0
      ? Math.round(clamp((VIEW_WIDTH * host.clientHeight) / host.clientWidth, 400, 2400))
      : 800;
  let viewHeight = measureViewHeight();
  /** Zoom at which the whole town fits; `zoom` is relative to it. */
  let fitZoom = Math.min(VIEW_WIDTH / W, viewHeight / H);
  let zoom = INITIAL_ZOOM;
  let dpr = deviceRatio();
  let following = false;
  let exploring = false;
  let followingVisitor = false;
  let lastCameraSignature = '';
  let lastExploreSignature = '';

  const stopFollowing = () => {
    following = false;
    followingVisitor = false;
  };

  function notifyCamera(force = false) {
    const view = scene?.cameras.main.worldView;
    const worldView =
      view?.width > 0
        ? {
            x: Math.max(0, view.x),
            y: Math.max(0, view.y),
            width: Math.min(W, view.width),
            height: Math.min(H, view.height),
          }
        : { x: 0, y: 0, width: W, height: H };
    const signature = [zoom, following, ...Object.values(worldView).map(n => Math.round(n * 10))].join('|');
    if (!force && signature === lastCameraSignature) return;
    lastCameraSignature = signature;
    onCameraChange({ zoom, following, worldView });
  }

  function notifyExplore(message = '', force = false) {
    const visitor = scene?.visitor;
    const location = visitor
      ? locationAt(visitor.container.x, visitor.container.y)
      : { zone: null, name: GARDEN_WALKWAY };
    const moving = !!visitor?.moving;
    if (game?.canvas) {
      // Diagnostics for tests and assistive tooling; nothing reads them back.
      Object.assign(game.canvas.dataset, {
        exploring: String(exploring),
        visitorX: visitor ? visitor.container.x.toFixed(1) : '',
        visitorY: visitor ? visitor.container.y.toFixed(1) : '',
        visitorLocation: location?.name || GARDEN_WALKWAY,
        visitorMoving: String(moving),
      });
    }
    const signature = [exploring, moving, location?.name, location?.room, message].join('|');
    if (!force && signature === lastExploreSignature) return;
    lastExploreSignature = signature;
    onExploreChange({
      active: exploring,
      moving,
      location,
      locationName: location?.name || GARDEN_WALKWAY,
      message,
    });
  }

  const reportError = error => {
    if (!destroyed) onError(error instanceof Error ? error : new Error(String(error)));
  };

  const api = {
    /** Show a view frame. Options: selected, playing, duration, reducedMotion, animate. */
    render(frame, options = {}) {
      if (destroyed) return;
      pending = {
        frame,
        options: {
          selected: null,
          playing: false,
          duration: 800,
          reducedMotion: false,
          animate: true,
          ...options,
        },
      };
      if (!scene?.ready) return;
      try {
        scene.applyFrame(pending);
      } catch (error) {
        reportError(error);
      }
    },
    /** True while any resident is walking or sitting down / standing up. */
    isTransitioning() {
      return !!scene && [...scene.characters.values()].some(actor => actor.moving || actor.transitioning);
    },
    zoomIn() {
      zoom = clampZoom(zoom + ZOOM_STEP);
      scene?.applyCamera();
      notifyCamera();
    },
    zoomOut() {
      zoom = clampZoom(zoom - ZOOM_STEP);
      scene?.applyCamera();
      notifyCamera();
    },
    resetCamera() {
      zoom = 1;
      stopFollowing();
      scene?.applyCamera(true);
      notifyCamera();
    },
    setFollow(value) {
      following = !!value;
      followingVisitor = false;
      if (following) zoom = Math.max(FOLLOW_ZOOM, zoom);
      scene?.applyCamera();
      notifyCamera();
    },
    setExplore(value) {
      exploring = !!value;
      following = false;
      followingVisitor = exploring;
      if (exploring) zoom = Math.max(CLOSE_ZOOM, zoom);
      scene?.toggleExplore();
      scene?.applyCamera();
      notifyExplore('', true);
      notifyCamera();
    },
    focusZone(zone) {
      const point = ZONE_CENTERS[zone];
      if (!point) return;
      stopFollowing();
      zoom = Math.max(CLOSE_ZOOM, zoom);
      scene?.applyCamera();
      scene?.cameras.main.stopFollow().centerOn(point[0], point[1]);
      notifyCamera(true);
    },
    panTo(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      stopFollowing();
      scene?.applyCamera();
      scene?.cameras.main.stopFollow().centerOn(clamp(x, 0, W), clamp(y, 0, H));
      notifyCamera(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      globalThis.removeEventListener('resize', resize);
      game?.destroy(true);
      scene = null;
      pending = null;
    },
  };

  function resize() {
    if (destroyed || !game?.scale) return;
    const nextDpr = deviceRatio();
    const nextHeight = measureViewHeight();
    if (nextDpr !== dpr || nextHeight !== viewHeight) {
      const camera = scene?.cameras.main;
      const center = camera?.getWorldPoint(camera.width / 2, camera.height / 2);
      dpr = nextDpr;
      viewHeight = nextHeight;
      fitZoom = Math.min(VIEW_WIDTH / W, viewHeight / H);
      // FIT mode needs setGameSize to update its retained aspect ratio;
      // resize() is meant for NONE and would keep the old ratio.
      game.scale.setGameSize(VIEW_WIDTH * dpr, viewHeight * dpr);
      scene?.applyCamera();
      if (center) camera.centerOn(center.x, center.y);
    }
    game.scale.refresh();
    notifyCamera(true);
  }

  if (!Phaser?.Game || !host) {
    reportError(new Error('Phaser 場景無法啟動，請重新整理頁面。'));
    return api;
  }

  class TownScene extends Phaser.Scene {
    constructor() {
      super('v5-town');
      this.ready = false;
      this.built = false;
      /** Resident actors by id: sprite, badges, current presentation and motion state. */
      this.characters = new Map();
      this.bubbles = [];
      this.ambientTweens = [];
      this.ambientLights = [];
      this.frame = null;
      this.options = {};
      this.drag = null;
      this.keys = new Set();
      this.visitor = null;
      this.objectHighlight = null;
    }

    // -----------------------------------------------------------------------
    // Lifecycle and input

    preload() {
      this.load.once('loaderror', file => {
        this.assetError = new Error(`小鎮美術載入失敗：${file?.key || '場景素材'}`);
        reportError(this.assetError);
      });
      townAssets.preloadTownAssets?.(this);
    }

    create() {
      try {
        if (this.assetError) return;
        scene = this;
        this.ready = true;
        this.cameras.main.setBounds(0, 0, W, H).setRoundPixels(true);
        this.applyCamera(true);
        this.setUpCanvas();
        this.setUpPointer();
        this.setUpKeyboard();
        if (pending) this.applyFrame(pending);
        onReady({
          renderer: this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
          version: Phaser.VERSION,
          minimapUrl: createMinimapDataUrl(),
        });
        notifyCamera();
        notifyExplore('', true);
      } catch (error) {
        reportError(error);
      }
    }

    setUpCanvas() {
      const canvas = this.game.canvas;
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'application');
      canvas.setAttribute(
        'aria-label',
        'AI 小鎮。點居民可觀察，拖曳可看地圖。進入散步模式後，點地面或按方向鍵移動，按 E 查看附近家具。',
      );
      canvas.style.cursor = 'grab';
      canvas.style.touchAction = 'none';
    }

    idleCursor() {
      return exploring ? 'crosshair' : 'grab';
    }

    /** Drag to pan; a press without a drag is a click (resident, furniture or ground). */
    setUpPointer() {
      const canvas = this.game.canvas;
      const camera = this.cameras.main;
      this.input.on('pointerdown', pointer => {
        canvas.focus({ preventScroll: true });
        this.drag = {
          x: pointer.x,
          y: pointer.y,
          scrollX: camera.scrollX,
          scrollY: camera.scrollY,
          moved: false,
        };
      });
      this.input.on('pointermove', pointer => {
        if (!this.drag || !pointer.isDown) {
          this.hoverObject(pointer);
          return;
        }
        const dx = pointer.x - this.drag.x;
        const dy = pointer.y - this.drag.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD * dpr) this.drag.moved = true;
        if (!this.drag.moved) return;
        if (following || followingVisitor) {
          stopFollowing();
          camera.stopFollow();
          notifyCamera();
        }
        const scale = zoom * dpr * fitZoom;
        camera.setScroll(this.drag.scrollX - dx / scale, this.drag.scrollY - dy / scale);
        notifyCamera();
        canvas.style.cursor = 'grabbing';
      });
      this.input.on('pointerup', pointer => this.finishPointer(pointer));
      this.input.on('pointerupoutside', () => {
        this.drag = null;
        canvas.style.cursor = this.idleCursor();
      });
    }

    /** WASD / arrows walk the visitor and E inspects nearby furniture, only while the canvas has focus. */
    setUpKeyboard() {
      const canvas = this.game.canvas;
      this.handleKeyDown = event => {
        const ignored =
          !exploring ||
          document.activeElement !== canvas ||
          document.querySelector('dialog[open]') ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey;
        if (ignored) return;
        const key = event.key.toLowerCase();
        if (WALK_KEYS.has(key)) {
          event.preventDefault();
          this.keys.add(key);
        }
        if (key === 'e' && !event.repeat) {
          event.preventDefault();
          this.inspectNearestObject();
        }
      };
      this.handleKeyUp = event => this.keys.delete(event.key.toLowerCase());
      this.clearKeys = () => this.keys.clear();
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
      globalThis.addEventListener('blur', this.clearKeys);
      canvas.addEventListener('blur', this.clearKeys);
      this.events.once('shutdown', () => {
        this.ready = false;
        this.input.removeAllListeners();
        this.bubbles = [];
        this.characters.clear();
        this.keys.clear();
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        globalThis.removeEventListener('blur', this.clearKeys);
        canvas.removeEventListener('blur', this.clearKeys);
      });
    }

    /** The front-most furniture under a world point (with a little room above its top edge). */
    hitObject(point) {
      const hits = MAP_OBJECTS.filter(
        o => point.x >= o.x && point.x <= o.x + o.width && point.y >= o.y - 12 && point.y <= o.y + o.height,
      );
      return hits.sort((a, b) => b.y + b.height - a.y - a.height)[0] || null;
    }

    hoverObject(pointer) {
      if (!this.built) return;
      const object = this.hitObject(this.cameras.main.getWorldPoint(pointer.x, pointer.y));
      if (this.objectHighlight) {
        this.objectHighlight.clear();
        if (object)
          this.objectHighlight
            .lineStyle(2, 0xf5d483, 0.85)
            .strokeRoundedRect(object.x - 3, object.y - 4, object.width + 6, object.height + 7, 4);
      }
      this.game.canvas.style.cursor = object ? 'pointer' : this.idleCursor();
    }

    finishPointer(pointer) {
      const drag = this.drag;
      this.drag = null;
      this.game.canvas.style.cursor = this.idleCursor();
      if (!drag || drag.moved) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      // Residents are tall: accept clicks on the whole body, the lowest (front-most) first.
      const resident = [...this.characters.values()]
        .filter(
          c =>
            Math.abs(c.container.x - point.x) < 29 &&
            point.y < c.container.y + SEATED_OFFSET + 9 &&
            point.y > c.container.y - 84,
        )
        .sort((a, b) => b.container.y - a.container.y)[0];
      if (resident) {
        onSelect(resident.id);
        return;
      }
      const object = this.hitObject(point);
      if (object) {
        if (exploring && object.approach) this.walkVisitor(object.approach, { object });
        else onInspectObject(object);
        return;
      }
      if (!exploring) return;
      if (!isWalkable(point.x, point.y)) {
        notifyExplore('這裡有牆壁或家具，請點選地板、門口或步道。', true);
        return;
      }
      this.walkVisitor(nearestWalkable([point.x, point.y]));
    }

    // -----------------------------------------------------------------------
    // Camera

    applyCamera(reset = false) {
      if (!this.ready) return;
      const camera = this.cameras.main;
      const center = camera.getWorldPoint(camera.width / 2, camera.height / 2);
      camera.setZoom(fitZoom * zoom * dpr);
      // At whole-town zoom the viewport may be wider or taller than the map.
      // Symmetric padding keeps it centred; zoomed views keep the world bounds.
      const padX = Math.max(0, (camera.width / camera.zoom - W) / 2);
      const padY = Math.max(0, (camera.height / camera.zoom - H) / 2);
      camera.setBounds(-padX, -padY, W + padX * 2, H + padY * 2);
      if (reset) camera.stopFollow().centerOn(W / 2, H / 2);
      else
        camera.centerOn(
          Number.isFinite(center.x) ? center.x : W / 2,
          Number.isFinite(center.y) ? center.y : H / 2,
        );
      const target =
        exploring && followingVisitor
          ? this.visitor?.container
          : following
            ? this.characters.get(this.options.selected)?.container
            : null;
      const lerp = this.options.reducedMotion ? 1 : FOLLOW_LERP;
      if (target) camera.startFollow(target, true, lerp, lerp);
      else camera.stopFollow();
      this.updateBadges();
    }

    // -----------------------------------------------------------------------
    // Building the town

    text(x, y, content, size = 13, color = '#3e5144', extra = {}) {
      return this.add.text(x, y, content, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        resolution: 2,
        ...extra,
      });
    }

    build(frame) {
      const assets = townAssets.registerTownAssets(this, frame.agents);
      this.assets = assets;
      if (!this.textures.exists(assets.backgroundKey)) throw new Error('小鎮背景尚未載入完成。');
      this.add
        .image(0, 0, assets.backgroundKey)
        .setOrigin(0, 0)
        .setDisplaySize(W, H)
        .setDepth(DEPTH.background);
      for (const layer of assets.foreground)
        this.add.image(layer.x, layer.y, layer.key).setOrigin(0, 0).setDepth(layer.depth);
      this.buildAmbience(assets.ambient);
      this.equipmentLabels = {};
      for (const [zone, { x, y }] of Object.entries(assets.equipmentLabels || {}))
        this.equipmentLabels[zone] = this.text(x, y, '', 13, '#43575d', {
          backgroundColor: '#f9f6ea',
          padding: { x: 7, y: 5 },
        }).setDepth(DEPTH.equipmentLabel);
      this.objectHighlight = this.add.graphics().setDepth(DEPTH.highlight);
      for (const [index, agent] of frame.agents.entries())
        this.addCharacter(agent, assets.characterKeys[agent.id], index);
      this.buildVisitor();
      this.built = true;
      this.toggleExplore();
    }

    /** Fountain ripples (animated while playing), street lamps and the evening tint. */
    buildAmbience(ambient) {
      const fountain = ambient?.fountain;
      if (fountain)
        for (let i = 0; i < 3; i++) {
          const ripple = this.add
            .ellipse(fountain.x, fountain.y, (fountain.radius || 34) + i * 14, 10 + i * 5)
            .setStrokeStyle(1, 0xf3fff9, 0.55)
            .setDepth(fountain.y - 2);
          this.ambientTweens.push(
            this.tweens.add({
              targets: ripple,
              scaleX: 1.16,
              scaleY: 1.14,
              alpha: 0.18,
              duration: 1300 + i * 270,
              yoyo: true,
              repeat: -1,
              paused: true,
              delay: i * 200,
            }),
          );
        }
      for (const lamp of ambient?.lamps || []) {
        this.ambientLights.push(
          this.add.ellipse(lamp.x, lamp.y, 64, 64, 0xffdf8e, 1).setAlpha(0).setDepth(DEPTH.lampGlow),
        );
        this.ambientLights.push(
          this.add.ellipse(lamp.x, lamp.y, 22, 22, 0xffeab3, 1).setAlpha(0).setDepth(DEPTH.lampCore),
        );
      }
      this.phaseOverlay = this.add
        .rectangle(0, 0, W, H, 0x485677, 1)
        .setAlpha(0)
        .setOrigin(0, 0)
        .setDepth(DEPTH.evening);
    }

    registerCharacterAnimations(id, texture) {
      for (const [name, { start, end, ...timing }] of Object.entries(RESIDENT_CLIPS)) {
        const key = `${id}-${name}`;
        if (this.anims.exists(key)) this.anims.remove(key);
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(texture, { start, end }),
          ...timing,
        });
      }
    }

    addCharacter(agent, texture, index) {
      this.registerCharacterAnimations(agent.id, texture);
      const shadow = this.add.ellipse(0, -1, 34, 11, 0x243b34, 0.22);
      const ring = this.add.ellipse(0, -1, 45, 16).setStrokeStyle(2, 0xffe0a0).setVisible(false);
      const sprite = this.add.sprite(0, 0, texture, 0).setOrigin(0.5, 1).setScale(RESIDENT_SCALE);
      const name = this.text(0, 4, agent.name, 12, '#f3f4e9', {
        fontStyle: 'bold',
        backgroundColor: '#354a43',
        padding: { x: 5, y: 2 },
      }).setOrigin(0.5, 0);
      const action = this.text(0, 25, '', 10, '#526350', {
        backgroundColor: '#f4eedb',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 0);
      const equipment = this.text(24, -73, '', 10, '#fffaf0', {
        backgroundColor: '#285649',
        padding: { x: 4, y: 2 },
      })
        .setOrigin(0, 1)
        .setVisible(false);
      const container = this.add.container(0, 0, [shadow, ring, sprite]);
      // Furniture hides the body by foot position, but names and activity
      // labels stay readable when someone sits beside a southern wall.
      const badges = this.add.container(0, 0, [name, action, equipment]).setDepth(DEPTH.badges + index);
      this.characters.set(agent.id, {
        id: agent.id,
        container,
        badges,
        sprite,
        shadow,
        ring,
        name,
        action,
        equipment,
        appearance: appearanceIdentity(agent, index),
        direction: 'down',
        zone: agent.zone,
        path: null,
        motion: null,
        poseTween: null,
        transitioning: false,
        seated: false,
        moving: false,
        presentation: null,
        animationKey: null,
        anchor: null,
      });
    }

    /**
     * Keep sprites in step with the frame's residents (a new or imported town
     * may bring different people). Returns true when any sprite was rebuilt.
     */
    syncCharacters(frame) {
      const changed = frame.agents.some(
        (agent, index) => this.characters.get(agent.id)?.appearance !== appearanceIdentity(agent, index),
      );
      for (const agent of frame.agents) {
        const actor = this.characters.get(agent.id);
        if (actor && actor.name.text !== agent.name) actor.name.setText(agent.name);
      }
      if (!changed) return false;
      const assets = townAssets.registerTownAssets(this, frame.agents);
      this.assets = assets;
      for (const [index, agent] of frame.agents.entries()) {
        const actor = this.characters.get(agent.id);
        const identity = appearanceIdentity(agent, index);
        if (!actor) {
          this.addCharacter(agent, assets.characterKeys[agent.id], index);
          continue;
        }
        if (actor.appearance === identity) continue;
        this.stopMotion(actor);
        actor.seated = false;
        actor.moving = false;
        this.bodyOffset(actor, 0);
        actor.sprite.anims.stop();
        actor.animationKey = null;
        this.registerCharacterAnimations(agent.id, assets.characterKeys[agent.id]);
        actor.sprite.setTexture(assets.characterKeys[agent.id], 0);
        actor.appearance = identity;
        actor.direction = 'down';
      }
      return true;
    }

    // -----------------------------------------------------------------------
    // Residents: showing a frame

    /**
     * Show a frame. The same tick again only updates playback state (pause,
     * speed, selection); the next tick of the same run walks residents to their
     * new places; anything else (a jump, a new town) places them directly.
     */
    applyFrame({ frame, options }) {
      if (!frame) return;
      if (!this.built) this.build(frame);
      const identitiesChanged = this.syncCharacters(frame);
      const previous = this.frame;
      const oldOptions = this.options;
      const sameTick =
        !identitiesChanged &&
        previous &&
        previous.tick === frame.tick &&
        previous.config.seed === frame.config.seed &&
        previous.config.capacity === frame.config.capacity;
      const continuous = !identitiesChanged && isContinuousFrame(previous, frame);
      this.frame = frame;
      this.options = options;

      for (const agent of frame.agents) {
        const actor = this.characters.get(agent.id);
        if (!actor) continue;
        actor.ring.setVisible(agent.id === options.selected);
        if (sameTick) this.updatePlayback(actor, options, oldOptions);
        else this.showResident(actor, agent, frame, previous, options, continuous);
      }

      if (!sameTick) {
        for (const actor of this.characters.values()) if (!actor.moving) this.settle(actor);
        this.makeBubbles(frame, options.selected);
        this.updateWorldLabels(frame);
      } else if (oldOptions.selected !== options.selected) this.makeBubbles(frame, options.selected);
      for (const tween of this.ambientTweens) {
        if (options.playing && !options.reducedMotion) tween.resume();
        else tween.pause();
      }
      this.updateBadges();
      if (following && oldOptions.selected !== options.selected) this.applyCamera();
      this.layoutBubbles();
    }

    /** Same tick: adjust speed, pause or resume, or finish instantly under reduced motion. */
    updatePlayback(actor, options, oldOptions) {
      const rate = motionRate(options.duration);
      if (actor.motion) actor.motion.timeScale = rate / (actor.motionSpeed || 1);
      if (actor.poseTween) actor.poseTween.timeScale = rate / (actor.poseSpeed || 1);
      const inTransition = actor.moving || actor.transitioning;
      if (options.reducedMotion && inTransition) {
        this.stopMotion(actor);
        this.place(actor, actor.destination);
        this.settle(actor);
      } else if (inTransition) {
        if (options.playing) {
          actor.motion?.resume();
          actor.poseTween?.resume();
        } else if (oldOptions.playing || options.animate === false) {
          // Pausing freezes the walk or the sit exactly where it is.
          actor.motion?.pause();
          actor.poseTween?.pause();
          actor.sprite.anims.pause();
        }
      } else this.settle(actor);
    }

    /** A new tick: update labels, then walk (continuous playback) or jump to the new place. */
    showResident(actor, agent, frame, previous, options, continuous) {
      // Complete an interrupted walk before deriving the next route.
      if (continuous && actor.moving && actor.destination) this.place(actor, actor.destination);
      this.stopMotion(actor);
      actor.presentation = characterPresentation(frame, agent.id);
      actor.anchor = activityAnchor(agent, frame);
      const p = actor.presentation;
      const label = p.failed
        ? '未能執行'
        : actor.anchor?.label || (p.proposal ? ACTION_NAMES[p.proposal.action] : '觀察中');
      actor.action.setText(label).setColor(p.failed ? '#a46e51' : '#6e7768');
      actor.equipment.setVisible(!!p.held);
      if (p.held)
        actor.equipment.setText(
          `${p.held.type === 'camera' ? '相機' : '工具'}${p.held.usableFrom > frame.tick ? ' · 下步可用' : ''}`,
        );

      const destination = characterPosition(agent, frame);
      const from = previous ? [actor.container.x, actor.container.y] : destination;
      const oldZone = previous?.agents.find(a => a.id === agent.id)?.zone ?? agent.zone;
      actor.path = presentationPath(from, destination, oldZone, agent.zone);
      actor.destination = destination;
      actor.zone = agent.zone;
      const distance = pathLength(actor.path);
      const animate = continuous && options.animate !== false;
      if (animate && !options.reducedMotion && distance > 1) this.walk(actor, destination, distance);
      else {
        this.place(actor, destination);
        this.settle(actor, animate);
      }
    }

    stopMotion(actor) {
      actor.motion?.stop();
      actor.poseTween?.stop();
      actor.motion = actor.poseTween = null;
      actor.transitioning = false;
    }

    place(actor, point) {
      actor.container.setPosition(point[0], point[1]).setDepth(point[1] + 0.1);
      actor.badges.setPosition(point[0], point[1] + Math.max(0, actor.sprite.y));
    }

    /** Lower the body by `y` pixels (sitting) without moving the foot anchor. */
    bodyOffset(actor, y) {
      actor.sprite.setScale(RESIDENT_SCALE).setY(y);
      actor.shadow.setY(y > 0 ? y - 2 : -1).setScale(y > 0 ? 0.8 : 1);
      actor.badges.setPosition(actor.container.x, actor.container.y + Math.max(0, y));
    }

    play(actor, name, active) {
      const key = `${actor.id}-${name}`;
      if (actor.animationKey !== key) {
        actor.sprite.play(key, true);
        actor.animationKey = key;
      }
      actor.sprite.anims.timeScale = motionRate(this.options.duration);
      if (active) actor.sprite.anims.resume();
      else actor.sprite.anims.pause();
    }

    /** Sit down or stand up through the four sit frames, then call `complete`. */
    posture(actor, seated, complete) {
      const from = actor.sprite.y;
      const to = seated ? SEATED_OFFSET : 0;
      const progress = { value: 0 };
      actor.poseTween?.stop();
      actor.sprite.anims.stop();
      actor.animationKey = null;
      actor.transitioning = true;
      const firstSitFrame = RESIDENT_CLIPS[`sit-${actor.direction}`].start;
      actor.poseSpeed = motionRate(this.options.duration);
      actor.poseTween = this.tweens.add({
        targets: progress,
        value: 1,
        duration: SIT_MS / motionRate(this.options.duration),
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const t = progress.value;
          this.bodyOffset(actor, from + (to - from) * t);
          actor.sprite.setFrame(firstSitFrame + Math.min(3, Math.floor((seated ? t : 1 - t) * 4)));
        },
        onComplete: () => {
          actor.poseTween = null;
          actor.transitioning = false;
          actor.seated = seated;
          this.bodyOffset(actor, to);
          complete?.();
          this.layoutBubbles();
        },
      });
    }

    /** At the destination: face the furniture or the conversation partner and play the pose. */
    settle(actor, animate = false) {
      actor.moving = false;
      const p = actor.presentation;
      if (!p || actor.transitioning) return;
      if (actor.anchor?.facing) actor.direction = actor.anchor.facing;
      if (p.target && !actor.anchor?.seated) {
        const target = this.characters.get(p.target);
        if (target)
          actor.direction = directionBetween(
            [actor.container.x, actor.container.y],
            [target.container.x, target.container.y],
            actor.direction,
          );
      }
      const seated = !!actor.anchor?.seated;
      const pose = seatedPose(p, actor.anchor);
      const finished = () => {
        actor.seated = seated;
        this.bodyOffset(actor, seated ? SEATED_OFFSET : 0);
        const directional = `${pose}-${actor.direction}`;
        this.play(
          actor,
          RESIDENT_CLIPS[directional] ? directional : pose,
          this.options.playing && !this.options.reducedMotion,
        );
      };
      if (animate && !this.options.reducedMotion && actor.seated !== seated)
        this.posture(actor, seated, finished);
      else finished();
    }

    /** Walk the prepared route (standing up first if seated), stepping in time with the distance covered. */
    walk(actor, destination, distance) {
      const begin = () => {
        this.bodyOffset(actor, 0);
        actor.seated = false;
        actor.moving = true;
        actor.sprite.anims.stop();
        actor.animationKey = null;
        const progress = { value: 0 };
        actor.motionSpeed = motionRate(this.options.duration);
        actor.motion = this.tweens.add({
          targets: progress,
          value: 1,
          duration: walkDuration(distance, this.options.duration),
          ease: 'Linear',
          onUpdate: () => {
            const next = samplePath(actor.path, progress.value);
            actor.direction = directionBetween([actor.container.x, actor.container.y], next, actor.direction);
            this.place(actor, next);
            const stride = Math.floor(((progress.value * distance) / STRIDE_LENGTH) * 8) % 8;
            actor.sprite.setFrame(RESIDENT_CLIPS[actor.direction].start + stride);
          },
          onComplete: () => {
            actor.motion = null;
            this.place(actor, destination);
            this.settle(actor, true);
            this.layoutBubbles();
          },
        });
      };
      actor.moving = true;
      if (actor.seated) this.posture(actor, false, begin);
      else begin();
    }

    /** Keep rooms readable: everyone shows a name; only the selected resident shows activity and equipment. */
    updateBadges() {
      for (const actor of this.characters.values()) {
        const selected = actor.id === this.options.selected;
        actor.name.setVisible(zoom >= NAME_ZOOM || selected).setColor(selected ? '#ffffff' : '#f3f4e9');
        actor.name.setBackgroundColor(selected ? '#285649' : '#354a43');
        actor.action.setVisible(selected);
        actor.equipment.setVisible(selected && !!actor.presentation?.held);
      }
    }

    /** Equipment availability signs, the evening tint and the lamps. */
    updateWorldLabels(frame) {
      for (const [zone, label] of Object.entries(this.equipmentLabels)) {
        const items = frame.equipment.filter(e => e.zone === zone);
        const held = items.filter(e => e.owner).length;
        const kind = zone === 'workshop' ? '工具' : '相機';
        label.setText(`${kind}  ${items.length - held}/${items.length} 可借${held ? ` · ${held} 持有` : ''}`);
      }
      const slotIndex = (Math.max(1, frame.tick) - 1) % TICKS_PER_DAY;
      const evening = slotIndex >= 9;
      this.phaseOverlay.setAlpha(evening ? 0.12 : slotIndex >= 6 ? 0.035 : 0);
      this.ambientLights.forEach((light, i) => light.setAlpha(evening ? (i % 2 ? 0.52 : 0.16) : 0));
    }

    // -----------------------------------------------------------------------
    // Speech bubbles

    makeBubbles(frame, selected) {
      for (const bubble of this.bubbles) bubble.container.destroy();
      this.bubbles = [];
      for (const event of visibleUtterances(frame, selected, MAX_BUBBLES)) {
        const actor = this.characters.get(event.participants[0]);
        if (!actor) continue;
        const speaker = frame.agents.find(a => a.id === actor.id)?.name ?? '';
        const ellipsis = event.text.length > BUBBLE_TEXT_LIMIT ? '…' : '';
        const text = this.text(
          12,
          29,
          wrapText(String(event.text).slice(0, BUBBLE_TEXT_LIMIT)) + ellipsis,
          13,
          '#405044',
          {
            lineSpacing: 4,
          },
        );
        const width = Math.min(256, Math.max(164, text.width + 24));
        const height = text.height + 42;
        const graphics = this.add.graphics();
        graphics.fillStyle(0x3b513d, 0.1).fillRoundedRect(3, 4, width, height, 8);
        graphics.fillStyle(0xfffcf3, 0.98).fillRoundedRect(0, 0, width, height, 8);
        graphics
          .lineStyle(1, event.participants[0] === selected ? 0x689879 : 0xb9c7a8, 1)
          .strokeRoundedRect(0, 0, width, height, 8);
        graphics
          .fillStyle(0xfffcf3, 1)
          .fillTriangle(width / 2 - 6, height - 1, width / 2 + 6, height - 1, width / 2, height + 9);
        const title = this.text(12, 8, `${speaker} · ${ACTION_NAMES[event.type] || '交談'}`, 11, '#8c805e', {
          fontStyle: 'bold',
        });
        const container = this.add
          .container(0, 0, [graphics, title, text])
          .setDepth(DEPTH.bubbles + this.bubbles.length);
        this.bubbles.push({ actor, container, width, height, event });
      }
      this.layoutBubbles();
    }

    /** Bubbles hide while their speaker walks and are re-placed whenever someone moves. */
    layoutBubbles() {
      const spots = placeBubbles(
        this.bubbles.map(({ actor, width, height }) => ({
          x: actor.container.x,
          y: actor.container.y,
          width,
          height,
        })),
        WORLD_SIZE,
      );
      this.bubbles.forEach(({ actor, container }, i) => {
        container.setVisible(!actor.moving && !actor.transitioning);
        container.setPosition(spots[i].x, spots[i].y);
      });
    }

    // -----------------------------------------------------------------------
    // Visitor

    buildVisitor() {
      const key = 'town-observer-v1';
      if (!this.textures.exists(key))
        this.textures.addSpriteSheet(key, drawVisitorSheet(), {
          frameWidth: VISITOR_FRAME.width,
          frameHeight: VISITOR_FRAME.height,
        });
      const spawn = nearestWalkable([W / 2, H / 2]);
      const shadow = this.add.ellipse(0, -1, 27, 9, 0x243b34, 0.24);
      const halo = this.add.ellipse(0, -1, 39, 14).setStrokeStyle(2, 0x59b8af, 0.9);
      const sprite = this.add.sprite(0, 0, key, 0).setOrigin(0.5, 1);
      const label = this.text(0, 5, '我 · 訪客', 12, '#f9fffb', {
        backgroundColor: '#317a78',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 0);
      const container = this.add
        .container(spawn[0], spawn[1], [shadow, halo, sprite])
        .setDepth(spawn[1] + 0.2)
        .setVisible(false);
      const badges = this.add
        .container(spawn[0], spawn[1], [label])
        .setDepth(DEPTH.visitorBadge)
        .setVisible(false);
      const marker = this.add
        .ellipse(0, 0, 22, 12)
        .setStrokeStyle(2, 0x399d94, 0.8)
        .setVisible(false)
        .setDepth(DEPTH.marker);
      const route = this.add.graphics().setDepth(DEPTH.route);
      this.visitor = {
        container,
        badges,
        sprite,
        marker,
        route,
        moving: false,
        path: [],
        distance: 0,
        progress: 0,
        direction: 'down',
        walkPhase: 0,
        pendingObject: null,
        keyboardStep: false,
      };
    }

    standingFrame(direction) {
      return VISITOR_DIRECTIONS[direction] * 4;
    }

    toggleExplore() {
      if (!this.visitor) return;
      this.keys.clear();
      this.visitor.container.setVisible(exploring);
      this.visitor.badges.setVisible(exploring);
      if (!exploring) {
        this.stopVisitor();
        this.objectHighlight?.clear();
      } else this.game.canvas.focus({ preventScroll: true });
      this.game.canvas.style.cursor = this.idleCursor();
    }

    stopVisitor() {
      const visitor = this.visitor;
      if (!visitor) return;
      visitor.moving = false;
      visitor.pendingObject = null;
      visitor.path = [];
      visitor.marker.setVisible(false);
      visitor.route.clear();
      visitor.sprite.setFrame(this.standingFrame(visitor.direction));
      notifyExplore();
    }

    /**
     * Walk the visitor to the walkable tile nearest `destination`. Clicked routes
     * are drawn with a target marker; keyboard steps are not. Returns false when
     * there is no way there.
     */
    walkVisitor(destination, { object = null, keyboard = false } = {}) {
      const visitor = this.visitor;
      if (!exploring || !visitor || !destination) return false;
      const from = [visitor.container.x, visitor.container.y];
      // Finish the partial step to the current tile centre before rerouting:
      // no teleporting across walls or cutting diagonally through door corners.
      const snapped = nearestWalkable(from);
      const target = nearestWalkable(destination);
      const route = findWalkPath(snapped, target);
      if (!route.length) {
        notifyExplore('目前沒有能走到這裡的通道。', true);
        return false;
      }
      const offTileCentre = Math.hypot(from[0] - snapped[0], from[1] - snapped[1]) > 0.1;
      const path = offTileCentre ? [from, snapped, ...route.slice(1)] : route;
      const distance = pathLength(path);
      Object.assign(visitor, { pendingObject: object, keyboardStep: keyboard, path, distance, progress: 0 });
      following = false;
      followingVisitor = true;
      this.applyCamera();
      if (distance < 1) {
        if (object) onInspectObject(object);
        this.stopVisitor();
        return true;
      }
      visitor.moving = true;
      visitor.marker.setPosition(target[0], target[1]).setVisible(!keyboard);
      visitor.route.clear();
      if (!keyboard) {
        visitor.route.lineStyle(2, 0x5b9c8b, 0.45);
        visitor.route.beginPath();
        path.forEach((point, i) => (i ? visitor.route.lineTo(...point) : visitor.route.moveTo(...point)));
        visitor.route.strokePath();
      }
      notifyExplore(object ? `走近${object.name}` : '', true);
      return true;
    }

    /** E key: inspect the closest furniture within reach on foot. */
    inspectNearestObject() {
      const visitor = this.visitor;
      if (!visitor) return;
      const from = [visitor.container.x, visitor.container.y];
      const nearest = MAP_OBJECTS.filter(
        o => o.approach && Math.hypot(o.approach[0] - from[0], o.approach[1] - from[1]) <= INSPECT_RADIUS,
      )
        .map(object => {
          const path = findWalkPath(from, object.approach);
          return { object, distance: path.length ? pathLength(path) : Infinity };
        })
        .filter(candidate => candidate.distance <= INSPECT_RADIUS)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest) onInspectObject(nearest.object);
      else notifyExplore('走近桌椅、書架或工作檯，再按 E 查看。', true);
    }

    requestedStep() {
      for (const [keys, step] of KEY_DIRECTIONS) if (keys.some(key => this.keys.has(key))) return step;
      return null;
    }

    updateVisitor(delta) {
      const visitor = this.visitor;
      if (!exploring || !visitor) return;
      const canvasFocused =
        document.activeElement === this.game.canvas && !document.querySelector('dialog[open]');
      if (!canvasFocused) this.keys.clear();

      // A held key walks one tile at a time; it does not interrupt a clicked route's current step.
      const step = this.requestedStep();
      if (step && (!visitor.moving || !visitor.keyboardStep)) {
        const [dx, dy, direction] = step;
        const from = nearestWalkable([visitor.container.x, visitor.container.y]);
        const target = [from[0] + dx * TILE_SIZE, from[1] + dy * TILE_SIZE];
        visitor.direction = direction;
        if (isWalkable(...target)) this.walkVisitor(target, { keyboard: true });
        else visitor.sprite.setFrame(this.standingFrame(visitor.direction));
      }
      if (!visitor.moving) return;

      const elapsed = Math.min(delta, MAX_FRAME_MS);
      visitor.progress = Math.min(visitor.distance, visitor.progress + elapsed * VISITOR_SPEED);
      const before = [visitor.container.x, visitor.container.y];
      const point = samplePath(visitor.path, visitor.distance ? visitor.progress / visitor.distance : 1);
      visitor.direction = directionBetween(before, point, visitor.direction);
      visitor.container.setPosition(...point).setDepth(point[1] + 0.2);
      visitor.badges.setPosition(...point);
      visitor.walkPhase += elapsed;
      const phase = this.options.reducedMotion ? 0 : Math.floor(visitor.walkPhase / VISITOR_STEP_MS) % 4;
      visitor.sprite.setFrame(this.standingFrame(visitor.direction) + phase);
      if (visitor.progress >= visitor.distance) {
        const object = visitor.pendingObject;
        this.stopVisitor();
        if (object) onInspectObject(object);
      }
      notifyExplore();
    }

    // -----------------------------------------------------------------------
    // Per-frame update

    update(_time, delta) {
      this.updateVisitor(delta);
      if (this.bubbles.some(b => b.actor.moving || b.actor.transitioning)) this.layoutBubbles();
      notifyCamera();
      if (this.built) this.publishResidentStates();
    }

    /**
     * Rendered positions for playback and accessibility diagnostics; never read by
     * the simulation. Written only on change: an attribute write every animation
     * frame would invalidate the canvas element's style sixty times a second.
     */
    publishResidentStates() {
      const states = JSON.stringify(
        [...this.characters.values()].map(a => ({
          id: a.id,
          x: Math.round(a.container.x),
          y: Math.round(a.container.y),
          offset: Math.round(a.sprite.y),
          scale: a.sprite.scaleX,
          frame: Number(a.sprite.frame.name),
          moving: a.moving,
          transitioning: a.transitioning,
          seated: a.seated,
        })),
      );
      if (states === this.residentStates) return;
      this.residentStates = states;
      this.game.canvas.dataset.residentStates = states;
    }
  }

  try {
    const size = { width: VIEW_WIDTH * dpr, height: viewHeight * dpr };
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      ...size,
      backgroundColor: '#dce5c5',
      banner: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, ...size, expandParent: false },
      render: { pixelArt: true, roundPixels: true },
      audio: { noAudio: true },
      fps: { target: 60 },
      scene: TownScene,
    });
    if (globalThis.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    }
    globalThis.addEventListener('resize', resize);
  } catch (error) {
    reportError(error);
  }
  return api;
}
