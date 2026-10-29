import { byte, intersects } from "./actors.js";

/** EC16: first overlapping actor in pool order, with original layer filters. */
export function findActorCollision(
  data,
  actors,
  sourceSlot,
  startSlot,
  count,
  state,
) {
  const source = actors[sourceSlot];
  if (source.y === 255) return -1;
  for (let slot = startSlot; slot < startSlot + count; slot++) {
    const target = actors[slot];
    if (target.y === 255 || target.xHigh & 128 || slot === sourceSlot) continue;
    if (!(source.flags & target.flags & 48)) continue;
    if (
      intersects(data, source, target, state.mode & 128 ? 0 : state.cameraLow)
    )
      return slot;
  }
  return -1;
}

/** E7FE arithmetic and EA5A survival. Pickups and transitions are explicit
 * dependencies: their side effects must happen before ordinary damage. */
export function createActorCombat(
  actors,
  effects,
  state,
  scores,
  operations = {},
) {
  function survival(slot, difference) {
    const actor = actors[slot];
    if (difference > 0 && !(actor.flags & 64)) return;
    if (slot === 0 && state.modifiers & 8) {
      actor.counter2 = state.reserveEnergy;
      state.reserveEnergy = 1;
      state.modifiers &= 247;
      return;
    }
    effects.destroy(slot);
  }
  function damagePair(sourceSlot, targetSlot) {
    const source = actors[sourceSlot],
      target = actors[targetSlot];
    const special =
      (target.kind & 254) === 4
        ? "pickup"
        : target.kind === 27
          ? "equipment"
          : ((target.kind + 1) & 254) === 12
            ? "transition"
            : null;
    if (special) {
      if (typeof operations[special] !== "function")
        throw Error(`Unported combat dependency: ${special}`);
      const result = operations[special](sourceSlot, targetSlot);
      if (result === false) return;
      if (result?.suspend) return { resume: () => damage(sourceSlot, targetSlot) };
    }
    damage(sourceSlot, targetSlot);
  }
  function damage(sourceSlot, targetSlot) {
    const source = actors[sourceSlot], target = actors[targetSlot];
    const targetDifference = target.counter2 - source.counter2;
    const sourceDifference = source.counter2 - target.counter2;
    source.counter2 = byte(sourceDifference);
    target.counter2 = byte(targetDifference);
    survival(sourceSlot, sourceDifference);
    if (targetDifference <= 0) {
      operations.onScore?.();
      state.score =
        (state.score + scores.byHitboxClass[target.hitbox >> 4]) & 0xffffff;
      if (state.score >= state.highScore) state.highScore = state.score;
    }
    survival(targetSlot, targetDifference);
  }
  return { damagePair, survival };
}
