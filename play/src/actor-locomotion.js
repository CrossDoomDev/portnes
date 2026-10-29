import { byte, motionDelta, moveActor, turnStep } from "./actors.js";

const signedByte = (value) => (value & 128 ? (value & 255) - 256 : value & 255);

/** Native shared movement, passage probes and steering. Contact and RNG call
 * contexts are supplied by the coordinator; they are never approximated. */
export function createActorLocomotion(data, effects, operations = {}) {
  const requireOperation = (name) => {
    if (typeof operations[name] !== "function")
      throw Error(`Unported locomotion dependency: ${name}`);
    return operations[name];
  };
  const vector = (actor) =>
    motionDelta(data, actor.flags & 15, actor.heading, actor.timer);
  function resolve(actor, slot, delta) {
    requireOperation("resolveContact")(actor, slot, delta);
    return delta;
  }
  function move(actor, slot) {
    const delta = resolve(actor, slot, vector(actor));
    moveActor(actor, delta.dx, delta.dy);
    return delta;
  }
  function probe(actor, slot, longRange = false) {
    const phase = actor.timer;
    actor.timer = 0;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt === 1) actor.heading = (actor.heading - 1) & 7;
        if (attempt === 2) actor.heading = (actor.heading + 2) & 7;
        const delta = vector(actor);
        if (longRange) {
          delta.dx = signedByte(byte(delta.dx << 4));
          delta.dy = signedByte(byte(delta.dy << 4));
        }
        resolve(actor, slot, delta);
        if (!(actor.contactFlags & 127)) return false;
      }
      actor.heading = (actor.heading - 1) & 7;
      resolve(actor, slot, { dx: 0, dy: 0, forced: true });
      if (actor.contactFlags & 127) {
        actor.dropId = 127;
        actor.deathEffect = 127;
        effects.destroy(slot);
      }
      return true;
    } finally {
      // CF5C restores the phase even when the probe replaces this actor.
      actor.timer = phase;
    }
  }
  function target(actor, fineDirection) {
    actor.turnTarget = fineDirection;
    if (turnStep(actor.heading, fineDirection) === 0) actor.turnTarget = 255;
  }
  function turn(actor) {
    actor.timer = byte(actor.timer - 1);
    if (actor.timer & 7) return;
    const delta = turnStep(actor.heading, actor.turnTarget);
    actor.heading = (actor.heading + delta) & 7;
    if (delta === 0) actor.turnTarget = 255;
  }
  function chooseTurn(actor, slot, frame, context) {
    const random = byte(
      requireOperation("random")("choose-turn", actor, slot, frame, context),
    );
    if (actor.counter & 7) {
      actor.counter = -actor.counter & 7;
      if (random & 40) return;
    }
    actor.counter = ((random & 2) - 1) & 7;
  }
  function weaponPause(actor) {
    if (!(actor.heading & 248)) return false;
    actor.timer = byte(actor.timer - 1);
    if (!actor.timer) {
      actor.heading &= 7;
      return false;
    }
    return true;
  }
  return { vector, move, probe, target, turn, chooseTurn, weaponPause };
}
