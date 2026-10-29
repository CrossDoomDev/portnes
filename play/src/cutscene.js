import { byte, motionDelta, moveActor } from "./actors.js";

/** Intro actor choreography, translated from F90B–FAA4 into domain actions. */
export class NativeCutscene {
  constructor(nodes, actors, motion, state, operations = {}) {
    Object.assign(this, { nodes, actors, motion, state, operations });
    this.index = 0; this.wait = 0; this.done = false;
  }
  step() {
    if (this.done) return true;
    const tracker = this.actors[16];
    for (let guard = 0; !this.wait; guard++) {
      if (guard > 1024) throw Error("Nonterminating scene choreography");
      const node = this.nodes[this.index];
      if (!node) throw Error("Missing scene action");
      const actor = this.actors[node.slot];
      if (node.action === "end") { this.done = true; return true; }
      if (node.action === "waitActor" && actor.rangeThreshold) break;
      switch (node.action) {
        case "place": Object.assign(actor, { appearance: node.appearance,
          xLow: node.x, y: node.y, heading: 0, style: 0, timer: 0 }); break;
        case "move": Object.assign(actor, { pendingKind: node.heading,
          flags: node.speed, timer: node.phase, rangeThreshold: 1 }); break;
        case "waitActor": break;
        case "hide": actor.y = 255; actor.rangeThreshold = 0; break;
        case "appearance": actor.appearance = node.appearance; break;
        case "wait": this.wait = node.frames; break;
        case "sound": this.operations.sound?.(node.id); break;
        default: throw Error(`Unknown scene action ${node.action}`);
      }
      this.index++;
    }
    if (this.wait) this.wait = byte(this.wait - 1);
    tracker.turnTarget = this.wait;
    for (let slot = 0; slot < 10; slot++) {
      const actor = this.actors[slot];
      if (!actor.rangeThreshold) continue;
      if (actor.flags !== 255) {
        const delta = motionDelta(this.motion, actor.flags & 15, actor.pendingKind, actor.timer);
        moveActor(actor, delta.dx, delta.dy);
      }
      if (actor.xLow >= 252 || actor.y >= 240) {
        actor.y = 255; actor.rangeThreshold = 0;
      } else {
        const before = actor.timer;
        actor.timer = byte(before - 1);
        if (!before) actor.rangeThreshold = 0;
      }
    }
    this.operations.layout?.(0);
    return false;
  }
}
