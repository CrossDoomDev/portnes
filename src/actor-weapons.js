import { byte, reserveSlot } from "./actors.js";
import { sampleRelativeToActor } from "./actor-aiming.js";

const jitter = [-1, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0];

/** Native E2C9 enemy weapon selection and E3E7 projectile allocation. Return
 * value follows the original success flag, even if a partial volley spawned. */
export function createActorWeapons(actors, effects, aiming, state) {
  const emit = (slot, prototype, count = 8) =>
    effects.spawnFromActor(slot, 136, count, prototype);
  function spread(actor, slot, step) {
    emit(slot, actor.projectileKind);
    const second = emit(slot, actor.projectileKind);
    if (second < 0) return -1;
    actors[second].heading = byte(actors[second].heading + step);
    const third = emit(slot, actor.projectileKind);
    if (third < 0) return second;
    actors[third].heading = byte(actors[third].heading - step);
    return third;
  }
  function fire(actor, slot, frame) {
    switch (actor.projectileKind) {
      case 95: {
        let spawned = -1;
        for (let heading = 5; heading < 12; heading++) {
          spawned = emit(slot, 55, 9);
          if (spawned < 0) return -1;
          actor.timer = 15;
          actors[spawned].flags = 238;
          actors[spawned].heading = heading;
        }
        return spawned;
      }
      case 26: {
        const saved = actor.heading;
        actor.heading = 8;
        const spawned = spread(actor, slot, 2);
        actor.heading = saved;
        actor.timer = 15;
        return spawned;
      }
      case 172:
        return spread(actor, slot, 1);
      case 58: {
        actor.projectileKind = frame & 1 ? 56 : 53;
        const spawned = fire(actor, slot, frame);
        actor.projectileKind = 58;
        return spawned;
      }
      case 59:
        if (actor.appearance !== 112) return emit(slot, actor.projectileKind);
        return aimed(actor, slot, frame, false);
      case 53:
        return aimed(actor, slot, frame, false);
      case 56:
        return aimed(actor, slot, frame, true);
      default:
        return emit(slot, actor.projectileKind);
    }
  }
  function aimed(actor, slot, frame, fine) {
    // Coarse weapon checks the nine-slot pool after its counter; fine weapon
    // checks the three-slot pool first. This order affects failed shots.
    if (fine && reserveSlot(actors, 136, 3) < 0) return -1;
    actor.pendingKind = byte(actor.pendingKind + 1);
    if (actor.pendingKind < actor.parameter2) return -1;
    actor.pendingKind = 0;
    if (!fine && reserveSlot(actors, 136, 9) < 0) return -1;
    const sample = sampleRelativeToActor(aiming, actor, actors[0], 0, frame, {
      ...state,
      inactiveSteering: actors[16].scriptLow,
    });
    if (sample.range >= 7) return -1;
    const heading = byte(
      (sample.steering & 15) + jitter[byte(slot * 16 + frame) >> 4],
    );
    actor.heading = fine ? heading & 15 : (heading >> 1) & 7;
    const saved = actor.heading;
    const spawned = emit(slot, actor.projectileKind, fine ? 3 : 8);
    actor.heading = fine ? byte((saved >> 1) + 32) : saved + 16;
    actor.timer = 24;
    return spawned;
  }
  return { fire, emit };
}
