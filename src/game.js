import { actorFromColumns, applyPrototype, byte, ACTOR_FIELDS } from "./actors.js";
import { NativeActorSystem } from "./actor-system.js";
import { WorldMap } from "./world.js";
import { TerrainCache, createActorTerrain } from "./terrain-cache.js";
import { createPlayerEquipment } from "./player-equipment.js";
import { createPlayerWeapons } from "./player-weapons.js";
import { createPlayerController } from "./player-controller.js";
import { createCampaign } from "./campaign.js";
import { createLayoutState } from "./layout-state.js";
import { createGameRandom } from "./game-random.js";
import { GamePresentation } from "./presentation.js";
import { findActorCollision } from "./actor-collisions.js";

const emptyActor = () => actorFromColumns(Array.from({ length: 3 }, () => Array(8).fill(0)));

/** Native common game loop: no console, instruction stream or cartridge.
 * One step is one game tick. Presentation consumes events and snapshots.
 */
export class NativeGame {
  constructor(config, options = {}) {
    if (config.combatGeometry?.schema !== 1) throw Error("Missing combat geometry profiles");
    this.config = config;
    this.events = [];
    this.world = new WorldMap(config.world);
    this.cache = new TerrainCache(this.world);
    const initial = {
      frameCounter: 0, mode: 0, worldPage: 511, environmentPage: 511,
      cameraLow: 0, cameraHigh: 0, cameraFineY: 0,
      scrollX: 0, scrollY: 0, playerScreenX: 116, playerScreenEdge: 117,
      patience: 20, resources: [0, 0, 0, 0, 0], equipment: 128,
      modifiers: 0, reserveEnergy: 0, lives: 2, seed: 17,
      musicCommand: 0, soundCommand: 0, currentMusic: 0, audioBusy: 0,
      statusTimer: 51, radioPhase: 0, radioTicks: 0,
      messageId: 0, messageState: 0, inventoryIndex: 0,
      spriteAnchor: { x: 63736, y: 248, marker: 248 },
      reservedActors: [emptyActor(), emptyActor()],
      ...options.state,
    };
    const emit = (type, value) => {
      this.events.push({ type, value });
      options.onEvent?.({ type, value });
    };
    const terrain = createActorTerrain(this.cache, () => ({
      page: this.state.worldPage & 511, fineY: this.state.cameraFineY,
      environmentPage: this.state.environmentPage,
    }));
    const operations = {
      ...terrain,
      refreshEnvironment: () => this.campaign.refreshEnvironment(),
      random: (...args) => this.random(...args),
      pickup: (...args) => this.equipment.pickup(...args),
      equipment: (...args) => this.equipment.equipment(...args),
      transition: (...args) => this.campaign.transition(...args),
      onScore: () => { this.combatGeometry = config.combatGeometry.afterScore; },
      onDestructionTerrain: () => { this.combatGeometry = config.data.hitboxes; },
      onMapChange: value => emit("map", value),
      onStatusChange: (actor, slot) => emit("status", slot),
      onInitialize: (slot, prototype) => this.actorSignal(prototype),
      onCue: value => {
        const signal = { "scene-approach": 29, "large-burst": 27,
          "player-breakdown": 0, "breakdown-spark": 47,
          flyby: 50, "nearby-alert": 61, "stage-clear": 21 }[value];
        if (signal !== undefined) this.sound(signal);
        emit("cue", value);
      },
      ...options.operations,
    };
    this.system = new NativeActorSystem({ ...config, world: this.world,
      terrainCache: this.cache, state: initial, operations });
    this.state = this.system.state;
    this.actors = this.system.actors;
    this.equipment = createPlayerEquipment(config.equipment, this.actors, this.state, {
      onSound: id => this.sound(id), onMessage: (id, restore) => {
        emit("message", id); this.openRadio("field", restore); return { suspend: true };
      },
    });
    this.weapons = createPlayerWeapons(this.actors, this.system.effects, this.state, this.equipment, {
      onPlayerShot: (kind, slot) => emit("shot", { kind, slot }),
    });
    this.player = createPlayerController(config.data, this.actors, this.state, this.system.effects, this.weapons, operations);
    this.campaign = createCampaign(config.campaign, this.world, this.actors, this.state, {
      onSound: id => this.sound(id), onRadio: id => emit("radio", id),
      onRoute: value => emit("route", value), onEnvironment: page => emit("environment", page),
      reloadScene: () => this.reloadScene(),
      spawnLayout: id => this.system.scene.spawnLayout(id),
      changeMap: id => this.system.changeMap(id), onArena: id => emit("arena", id),
      onSceneFade: () => this.layout.update(this.state.frameCounter),
    });
    this.layout = createLayoutState(config.layout, this.actors, this.state);
    this.random = createGameRandom(config.randomContexts, this.actors, this.state);
    this.emit = emit;
    this.presentation = config.presentation ? new GamePresentation(this, config.presentation) : null;
    if (options.actors) this.actors.splice(0, 30, ...options.actors.slice(0, 30));
    else this.resetActors();
    if (options.cells) this.cache.cells.set(options.cells);
    else this.cache.loadPage(this.state.worldPage);
    if (!options.restore) {
      this.campaign.refreshEnvironment();
      this.campaign.sync();
      this.layout.update(this.state.frameCounter);
    }
    if (options.startAtTitle) {
      this.state.mode = 4;
      this.presentation.enter(4);
    }
  }
  sound(id) {
    this.state.soundCommand = id;
    if (id < 32) this.state.currentMusic = id;
    this.emit?.("sound", id);
  }
  actorSignal(prototype) {
    const id = this.config.campaign.actorSignals[prototype];
    if (id === 255) return;
    if (this.state.currentMusic === 26 && id < 27) this.state.musicCommand = id | 128;
    else this.sound(id);
  }
  updateHealth() {
    const player = this.actors[0], value = player.counter2, previous = player.counter;
    player.counter = value;
    if (value < previous && previous - value >= 2) this.emit("damage", previous - value);
    this.state.healthSegments = Math.max(0, (value >> 1) - 1);
    this.state.deadFlag = (byte((value >> 1) - 1) & 128) ? 255 : 0;
  }
  resetActors() {
    for (let slot = 0; slot < 30; slot++) {
      Object.assign(this.actors[slot], emptyActor());
      applyPrototype(this.config.data, this.actors[slot], slot < 2 ? (slot ? 0 : 1) : 127);
    }
    applyPrototype(this.config.data, this.state.reservedActors[0], 126);
    applyPrototype(this.config.data, this.state.reservedActors[1], 191);
    this.state.blastState = 0;
    this.state.statusTimer = 51;
    this.updateHealth();
  }
  reloadScene() {
    this.campaign.refreshEnvironment();
    this.state.worldPage = (this.state.worldPage + 1) & 65535;
    for (let tick = 0; tick < 240; tick++) this.system.camera.advance(0, -1);
    this.state.scrollX = this.state.scrollY = 0;
    this.emit("scene", this.state.worldPage & 511);
  }
  resumeCheckpoint() {
    const s = this.state;
    const id = this.config.campaign.pages[s.worldPage & 511].checkpoint;
    const checkpoint = this.config.campaign.checkpoints[id & 127];
    if (!checkpoint) throw Error(`Unknown campaign checkpoint ${id}`);
    for (const actor of [...this.actors, ...s.reservedActors]) {
      for (const field of ACTOR_FIELDS[0]) actor[field] = 255;
      actor.xHigh = 0;
      for (const field of ACTOR_FIELDS[1]) actor[field] = 0;
    }
    s.modifiers = s.patience = 0; s.equipment &= 224;
    if (s.reserveEnergy) s.reserveEnergy = 32;
    s.worldPage = checkpoint.counter;
    s.cameraLow = checkpoint.cameraX & 255; s.cameraHigh = checkpoint.cameraX >> 8;
    s.cameraFineY = 0;
    for (let slot = 0; slot < 2; slot++) Object.assign(this.actors[slot], {
      xLow: s.cameraLow, xHigh: s.cameraHigh, y: 0,
    });
    for (let slot = 0; slot < 30; slot++) {
      const prototype = slot < 2 ? (slot ? 0 : 1) : 127;
      applyPrototype(this.config.data, this.actors[slot], prototype);
      this.actorSignal(prototype);
    }
    applyPrototype(this.config.data, s.reservedActors[0], 126);
    applyPrototype(this.config.data, s.reservedActors[1], 191);
    this.updateHealth();
    s.statusTimer = 51;
    this.campaign.refreshEnvironment();
    this.reloadScene();
    s.musicCommand |= 128;
    this.sound(26);
    this.layout.update(s.frameCounter);
    s.mode = 0; s.playerScreenX = 116; s.playerScreenEdge = 117;
    this.emit("checkpoint", s.worldPage & 511);
  }
  *combatPass() {
    this.combatGeometry = this.config.data.hitboxes;
    const collision = (slot, count) => findActorCollision({ hitboxes: this.combatGeometry }, this.actors, slot, 2, count, this.state);
    let target = collision(0, 24);
    if (target >= 0) {
      const pending = this.system.combat.damagePair(0, target);
      if (pending?.resume) { yield; pending.resume(); }
      this.updateHealth();
    }
    this.combatGeometry = this.config.data.hitboxes;
    for (let slot = 26; slot < 30; slot++) {
      target = collision(slot, 15);
      if (target >= 0) {
        const pending = this.system.combat.damagePair(slot, target);
        if (pending?.resume) { yield; pending.resume(); }
      }
    }
  }
  openRadio(source, restore) {
    const fields = ACTOR_FIELDS[2].slice(0, 6), record = this.state.reservedActors[1];
    const messages = [];
    for (const field of fields) {
      if (messages.length && record[field] === 255) break;
      const id = record[field];
      if (!this.config.presentation?.messages[id]) throw Error(`Unknown radio message ${id}`);
      messages.push(id);
    }
    if (!messages.length) throw Error("Empty radio queue");
    this.radio = { source, restore, messages, index: 0, mode: this.state.mode };
    if (source === "field") { this.state.mode = 1; this.sound(128); }
  }
  radioStep(mask) {
    const input = this.player.controls.sample(mask), radio = this.radio;
    if (input.triggered & 192) radio.index = (radio.index + 1) % radio.messages.length;
    else if (input.triggered & 48) {
      for (const field of ACTOR_FIELDS[2].slice(0, 6)) this.state.reservedActors[1][field] = 255;
      this.state.mode = radio.mode;
      this.state.cameraHigh &= 127;
      if (radio.source === "field") this.sound(128);
      else this.state.statusTimer = 51;
      radio.restore?.(); this.radio = null;
    }
  }
  blastPass() {
    const value = this.state.blastState;
    if (!value) return;
    const x = ((this.state.cameraHigh << 8) | this.state.cameraLow) + (value & 2 ? 4 : -4);
    this.state.cameraLow = x & 255; this.state.cameraHigh = (x >> 8) & 255;
    if (!(value & 15)) this.sound(47);
    this.state.blastState = byte(value - 1);
  }
  menuStep(mask, phase) {
    if (this.menuPhase !== phase) {
      this.menuPhase = phase; this.sound(128);
      if (phase === 2) { this.state.inventoryIndex = 0; this.state.modifiers &= 251; }
      else this.sound(60);
    }
    const input = this.player.controls.sample(mask);
    this.layout.update(this.state.frameCounter);
    if (phase === 1) {
      if (input.triggered & 16) { this.sound(60); this.sound(128); this.state.mode &= 128; this.campaign.sync(); }
      return;
    }
    if (phase === 2) {
      if (input.triggered & 128) this.equipment.toggle(this.state.inventoryIndex);
      if (this.state.modifiers & 16) { this.state.modifiers &= 31; this.state.equipment &= 254; }
      if (!(this.state.frameCounter & 63) && (this.state.modifiers & 4)) {
        this.state.modifiers &= 251;
        if (this.state.statusTimer !== 51) {
          this.emit("message", this.state.messageId);
          this.openRadio("inventory");
          input.triggered = 0; input.target = 255;
        }
      }
      if ((input.triggered & 15) && input.target !== 255) {
        const delta = [-1, 0, 1, 0, 1, 0, -1, 0][input.target >> 1];
        this.state.inventoryIndex = (this.state.inventoryIndex + delta + 7) % 7;
        this.sound(59);
      }
      if (input.triggered & 32) {
        this.state.cameraHigh &= 127;
        this.sound(128); this.sound(60); this.state.mode = 0; this.campaign.sync();
      }
    }
  }
  step(mask = 0) {
    this.events.length = 0;
    const s = this.state;
    s.frameCounter = byte(s.frameCounter - 1);
    if (this.radio) {
      this.radioStep(mask);
      if (!this.radio && this.pendingFrame) this.continueFrame();
      return this.events;
    }
    const phase = s.mode & 63;
    if (this.presentation?.pendingMode !== undefined) {
      this.presentation.step(mask, this.presentation.mode);
      return this.events;
    }
    if (phase) {
      if (phase === 6) { this.resumeCheckpoint(); if (this.presentation) this.presentation.mode = null; }
      else if (phase <= 3) this.menuStep(mask, phase === 3 ? 1 : phase);
      else if (this.presentation) this.presentation.step(mask, phase);
      else throw Error(`Missing presentation data for game phase ${phase}`);
      return this.events;
    }
    if (this.presentation) this.presentation.mode = null;
    this.menuPhase = null;
    this.pendingFrame = this.playFrame(mask);
    this.continueFrame();
    return this.events;
  }
  continueFrame() {
    if (this.pendingFrame.next().done) this.pendingFrame = null;
  }
  *playFrame(mask) {
    const s = this.state;
    if (this.actors[0].kind === 31) this.player.step(mask);
    const scroll = this.system.camera.advance(s.scrollX, s.scrollY);
    s.scrollY = byte(scroll.dy);
    s.inactiveRoute = this.layout.parts[32].y;
    this.system.update(s.frameCounter);
    this.layout.update(s.frameCounter);
    if (s.frameCounter & 1) { yield* this.combatPass(); this.campaign.sync(); }
    this.system.spawns.spawnRow(s.worldPage, s.cameraFineY, s.scrollY);
    s.scrollX = s.scrollY = 0;
    this.campaign.updateRadio(s.frameCounter);
    this.blastPass();
    if (!(s.mode & 63) && !(s.frameCounter & 15)) {
      if (this.actors[0].counter2) {
        const value = this.actors[0].counter2 >= 8
          ? this.actors[0].style & 252 : this.actors[0].style ^ 3;
        this.actors[0].style = this.actors[1].style = value;
      }
      if (this.actors[0].y === 255 && s.frameCounter === 0) s.mode = 7;
    }
  }
}
