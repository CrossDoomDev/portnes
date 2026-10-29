import { byte, applyPrototype, moveActor, reserveSlot } from "./actors.js";

export function createActorEffects(data, actors, operations = {}) {
  const initialize = (slot, prototypeId) => {
    applyPrototype(data, actors[slot], prototypeId);
    operations.onInitialize?.(slot, prototypeId);
  };
  function spawnFromActor(sourceSlot, poolStart, poolCount, prototypeId) {
    const slot = reserveSlot(actors, poolStart, poolCount);
    if (slot < 0) return -1;
    const source = actors[sourceSlot],
      target = actors[slot];
    for (const field of ["xLow", "xHigh", "y"]) target[field] = source[field];
    initialize(slot, prototypeId);
    target.heading = (target.heading & 240) | (source.heading & 15);
    target.contactFlags = source.contactFlags;
    return slot;
  }
  function destroy(slot, visited = new Set()) {
    if (visited.has(slot)) throw Error("Cyclic actor destruction link");
    visited.add(slot);
    const actor = actors[slot];
    if (
      (actor.kind === 26 || (actor.kind & 252) === 28) &&
      byte(actor.link << 1)
    )
      destroy(actor.link & 31, visited);
    if (!(actor.spawnMarker & 128) && actor.y < 192) {
      if (typeof operations.changeMap !== "function")
        throw Error("Unported destruction dependency: changeMap");
      operations.changeMap(actor.spawnMarker, actor, slot);
      operations.onDestructionTerrain?.();
    }
    spawnFromActor(slot, 16, 12, actor.deathEffect);
    initialize(slot, actor.dropId);
  }
  return { initialize, spawnFromActor, destroy };
}

/** Original EB90 movement/lifetime for ordinary projectiles. Collision callback
 * may alter the proposed delta exactly as F18C does; no collision is guessed. */
export function createProjectileUpdate(motionData, effects, operations) {
  return function updateProjectile(actor, slot, frameCounter) {
    actor.timer = byte(actor.timer - 1);
    if (actor.timer === 0) return effects.destroy(slot);
    if (actor.xHigh & 128) {
      if (actor.appearance === 33) actor.y = 255;
      else effects.destroy(slot);
      return;
    }
    const packed = motionData.motion[actor.flags & 15];
    if (!packed) throw Error("Reserved projectile motion mode is not ported");
    const value =
      packed[(((actor.heading & 15) << 3) | (actor.timer & 7)) & 255];
    const signed = (n) => (n < 8 ? n : n - 16);
    const delta = { dy: signed(value >> 4), dx: signed(value & 15) };
    if (typeof operations.resolveContact !== "function")
      throw Error("Unported projectile dependency: resolveContact");
    operations.resolveContact(actor, slot, delta);
    if (byte(actor.contactFlags << 1)) return effects.destroy(slot);
    moveActor(actor, delta.dx, delta.dy);
    if (operations.getBlastState() && actor.appearance === 211 && slot < 26)
      effects.destroy(slot);
  };
}
