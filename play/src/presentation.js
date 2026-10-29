import { byte, ACTOR_FIELDS, applyPrototype } from "./actors.js";
import { encodePassword, decodePassword } from "./password.js";
import { NativeCutscene } from "./cutscene.js";

export const GAME_MODE = Object.freeze({ PLAY: 0, PAUSE: 1, INVENTORY: 2,
  TITLE: 4, CHECKPOINT: 6, DEFEAT: 7, ATTRACT: 8, ENDING: 12, NEW_GAME: 16, PASSWORD: 20 });

/** Frontend states, captions and original menu choices, without console UI. */
export class GamePresentation {
  constructor(game, data) {
    this.game = game; this.data = data; this.kind = null;
    this.cursor = 0; this.input = ""; this.error = "";
    this.lastPage = 511; this.idle = 1;
    this.panel = null; this.caption = [];
  }
  enter(mode) {
    const g = this.game, s = g.state;
    this.mode = mode; this.cursor = 0; this.error = "";
    if (mode === 4) {
      this.kind = "title"; this.idle = 1; this.lastPage = 511;
      g.sound(0);
    } else if (mode === 20) {
      this.kind = "password"; this.input = "";
    } else if (mode === 7) {
      this.lastPage = s.worldPage;
      s.lives = byte(s.lives - 1);
      if (s.lives & 128) {
        s.lives = 2; this.kind = "gameover";
        this.password = encodePassword(this.lastPage);
      } else { this.kind = "retry"; this.wait = 120; }
    } else if (mode === 8 || mode === 12) {
      this.kind = mode === 8 ? "attract" : "ending";
      this.timeline = [...(mode === 8 ? [{ action: "preface", frames: 120 }, { action: "sound", id: 20 }] : []),
        ...this.data.slides[mode === 8 ? "attract" : "conclusion"],
        ...(mode === 12 ? [{ action: "sound", id: 10 }, ...this.data.slides.credits] : [])];
      this.slide = 0; this.wait = 0; this.panel = null; this.caption = [];
    } else if (mode === 16) this.beginGame();
  }
  clearSceneActors() {
    const g = this.game;
    for (const actor of [...g.actors, ...g.state.reservedActors]) {
      for (const field of ACTOR_FIELDS[0]) actor[field] = 255;
      actor.xHigh = 0;
      for (const field of ACTOR_FIELDS[1]) actor[field] = 0;
    }
  }
  beginGame() {
    const g = this.game, s = g.state;
    s.lives = 2; s.score = 0; s.resources.fill(0);
    s.reserveEnergy = s.modifiers = s.patience = 0; s.equipment = 128;
    s.worldPage = this.lastPage; s.cameraLow = s.cameraHigh = s.cameraFineY = 0;
    this.clearSceneActors();
    this.kind = "intro"; this.introPart = 0;
    this.makeCutscene();
  }
  makeCutscene() {
    const g = this.game;
    this.scene = new NativeCutscene(this.data.cutscenes[this.introPart], g.actors,
      g.config.data, g.state, { sound: id => g.sound(id), layout: frame => g.layout.update(frame) });
  }
  finishIntro() {
    const g = this.game, s = g.state;
    for (let slot = 0; slot < 2; slot++) Object.assign(g.actors[slot], { xLow: 0, xHigh: 0, y: 0 });
    for (const [slot, prototype] of [[0, 1], [1, 0]]) {
      applyPrototype(g.config.data, g.actors[slot], prototype); g.actorSignal(prototype);
    }
    applyPrototype(g.config.data, s.reservedActors[0], 126);
    applyPrototype(g.config.data, s.reservedActors[1], 191);
    for (let slot = 2; slot < 30; slot++) applyPrototype(g.config.data, g.actors[slot], 127);
    g.updateHealth(); s.playerScreenX = 116; s.playerScreenEdge = 117;
    s.mode = 0; s.paletteSet = 0; this.kind = null;
  }
  choose(input) {
    if (input.triggered & 15) {
      if (input.target !== 255) this.cursor = (((input.target >> 1) + 1) & 4) >> 2;
    } else if (input.triggered & 32) this.cursor ^= 1;
    return Boolean(input.triggered & 16);
  }
  submitPassword(text) {
    const value = decodePassword(text);
    if (!value.valid) {
      this.error = value.error; this.input = text;
      if (/^\d{7}$/.test(text)) { this.kind = "passwordError"; this.wait = 120; }
      return false;
    }
    const s = this.game.state;
    s.worldPage = value.counter; s.lives = 2; s.score = 0;
    s.resources.fill(0); s.reserveEnergy = s.modifiers = s.patience = 0; s.equipment = 128;
    s.mode = 6; this.kind = null; this.error = "";
    return true;
  }
  step(mask, mode) {
    if (this.mode !== mode) this.enter(mode);
    const g = this.game, s = g.state;
    if (this.kind === "intro") {
      if (this.scene.step()) {
        if (!this.introPart) { g.reloadScene(); s.musicCommand |= 128; this.introPart = 1; this.makeCutscene(); }
        else this.finishIntro();
      }
      return;
    }
    if (["attract", "ending", "finished"].includes(this.kind)) { this.storyStep(mask); return; }
    const input = g.player.controls.sample(mask);
    if (this.kind === "title") {
      if (this.choose(input)) { s.mode = this.cursor ? 20 : 16; this.kind = null; }
      else if (!(s.frameCounter & 3)) { this.idle = byte(this.idle + 1); if (!this.idle) { s.mode = 8; this.kind = null; } }
    } else if (this.kind === "retry") {
      if (input.triggered || !--this.wait) { s.mode = 6; this.kind = null; }
    } else if (this.kind === "gameover") {
      if (this.choose(input)) {
        s.mode = this.cursor ? 4 : 6; this.pendingMode = s.mode;
        if (!this.cursor) { s.lives = 2; s.score = 0; s.worldPage = this.lastPage & 511; }
        this.kind = "decision"; this.wait = 120;
      }
    } else if (this.kind === "decision") {
      if (input.triggered || !--this.wait) { delete this.pendingMode; this.kind = null; }
    } else if (this.kind === "passwordError") {
      if (input.triggered || !--this.wait) { s.mode = 4; this.kind = null; }
    } else if (this.kind === "password") {
      if (input.triggered & 192) {
        g.sound(60);
        if (this.cursor === 10) this.input = this.input.slice(0, -1);
        else this.input += String(this.cursor);
        if (this.input.length === 7) this.submitPassword(this.input);
      } else if (input.triggered & 15 && input.target !== 255) {
        g.sound(59);
        const delta = [0, 1, 1, 1, 0, -1, -1, -1][input.target >> 1];
        this.cursor = (this.cursor + delta + 11) % 11;
      }
    }
  }
  storyStep(mask) {
      const g = this.game, s = g.state;
      if (this.kind === "finished") return;
      for (let guard = 0; guard < 1024; guard++) {
        if (this.wait) {
          if (this.kind === "attract" && this.waitAction !== "fade") {
            const input = g.player.controls.sample(mask);
            if (input.triggered) {
              this.wait = 0;
              if (this.waitAction === "preface") continue;
              s.mode = 4; this.kind = null; return;
            }
          }
          this.wait--; return;
        }
        const action = this.timeline[this.slide++];
        if (!action) {
          if (this.kind === "attract") { s.mode = 4; this.kind = null; }
          else this.kind = "finished";
          return;
        }
        if (action.action === "illustration") this.panel = action.id;
        else if (action.action === "caption") this.caption = this.data.captions[action.id];
        else if (action.action === "sound") g.sound(action.id);
        else { this.wait = action.frames; this.waitAction = action.action; }
      }
      throw Error("Nonterminating story timeline");
  }
}
