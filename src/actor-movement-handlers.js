import { byte } from "./actors.js";
import { sampleRelativeToActor } from "./actor-aiming.js";
import { createActorLocomotion } from "./actor-locomotion.js";

/** Original steering state machines, shared by mobile enemy actor kinds. */
export function createMovementHandlers(
  data,
  aiming,
  actors,
  state,
  effects,
  weapons,
  operations = {},
) {
  const motion = createActorLocomotion(data, effects, operations);
  const fire = (actor, slot, frame) =>
    (operations.fire ?? weapons.fire)(actor, slot, frame);
  const sample = (actor, frame, target = 0) =>
    sampleRelativeToActor(aiming, actor, actors[target], target, frame, {
      ...state,
      inactiveSteering: actors[16].scriptLow,
      inactiveRoute: state.inactiveRoute,
    });
  function startAvoidance(actor, slot, frame, context) {
    actor.turnTarget = 255;
    actor.rangeThreshold = 1;
    motion.chooseTurn(actor, slot, frame, context);
    actor.heading = (actor.heading - actor.counter) & 7;
  }
  function advanceAvoidance(actor) {
    actor.rangeThreshold = byte(actor.rangeThreshold + 1);
    if (!(actor.rangeThreshold & 7)) {
      actor.rangeThreshold = 0;
      actor.turnTarget = 255;
    }
  }
  function detour(actor, slot) {
    const heading = actor.heading;
    actor.heading = (heading + actor.counter) & 7;
    const blocked = motion.probe(actor, slot, true);
    const candidate = actor.heading;
    actor.heading = heading;
    if (!blocked) {
      motion.target(actor, byte(candidate << 1));
      if (actor.turnTarget === 255) return;
      actor.heading = candidate;
      actor.turnTarget = 255;
      advanceAvoidance(actor);
      return;
    }
    if (!motion.probe(actor, slot)) return;
    actor.turnTarget = ((actor.heading - actor.counter) & 7) << 1;
    advanceAvoidance(actor);
  }
  function seek(actor, slot, frame, longRange = false) {
    actor.timer = 15;
    if (actor.rangeThreshold) {
      detour(actor, slot);
      return;
    }
    const heading = actor.heading;
    actor.heading = sample(actor, frame).directionFine >> 1;
    const blocked = motion.probe(actor, slot, longRange);
    const desired = byte(actor.heading << 1);
    actor.heading = heading;
    motion.target(actor, desired);
    if (blocked) startAvoidance(actor, slot, frame, longRange ? "seek-long" : "seek");
  }
  function retreat(actor, slot, frame) {
    actor.timer = 15;
    if (actor.rangeThreshold) {
      detour(actor, slot);
      return;
    }
    const heading = actor.heading;
    actor.heading = ((sample(actor, frame, 1).directionFine >> 1) + 4) & 7;
    const blocked = motion.probe(actor, slot);
    const desired = byte(actor.heading << 1);
    actor.heading = heading;
    motion.target(actor, desired);
    if (blocked) startAvoidance(actor, slot, frame, "retreat");
  }
  function advance(actor, slot, frame, fallback) {
    if (actor.turnTarget !== 255) {
      motion.turn(actor);
      return;
    }
    if (!motion.probe(actor, slot)) {
      motion.move(actor, slot);
      actor.timer = byte(actor.timer - 1);
      if (!(actor.timer & 128)) return;
    }
    fallback(actor, slot, frame);
  }
  const handlers = {
    dc6e(actor, slot, frame) {
      fire(actor, slot, frame);
      if (motion.weaponPause(actor)) return;
      advance(actor, slot, frame, seek);
    },
    dd4e(actor, slot, frame) {
      advance(actor, slot, frame, retreat);
    },
    ddac(actor, slot, frame) {
      if (actor.pendingKind) {
        actor.pendingKind = byte(actor.pendingKind - 1);
        if (actor.pendingKind & 64) handlers.dd4e(actor, slot, frame);
        return;
      }
      if (sample(actor, frame).range >= 4) handlers.dc6e(actor, slot, frame);
      else actor.pendingKind = 112;
    },
    ddd3(actor, slot, frame) {
      if (sample(actor, frame).range >= 4) handlers.dc6e(actor, slot, frame);
      else {
        actor.kind = 40;
        actor.timer = 96;
      }
    },
    ddec(actor, slot, frame) {
      if (actor.pendingKind) {
        actor.pendingKind = byte(actor.pendingKind - 1);
        handlers.dd4e(actor, slot, frame);
        return;
      }
      if (sample(actor, frame).range >= 4) handlers.dc6e(actor, slot, frame);
      else actor.pendingKind = 96;
    },
    de0b(actor, slot, frame) {
      holdRange(actor, slot, frame, 6);
    },
    de43(actor, slot, frame) {
      holdRange(actor, slot, frame, 3);
    },
    de64(actor, slot, frame) {
      if (motion.weaponPause(actor)) return;
      fire(actor, slot, frame);
      if (!(byte(slot * 8 + frame) & 15) || actor.heading & 248) return;
      actor.heading = (sample(actor, frame).steering & 15) >> 1;
    },
    de88(actor, slot, frame) {
      if (motion.weaponPause(actor)) return;
      if (actor.turnTarget !== 255) {
        motion.turn(actor);
        return;
      }
      if (sample(actor, frame).range >= 7) fire(actor, slot, frame);
      if (!motion.probe(actor, slot)) {
        motion.move(actor, slot);
        actor.timer = byte(actor.timer - 1);
        if (!(actor.timer & 128)) return;
      }
      actor.timer = 15;
      if (actor.rangeThreshold) {
        detour(actor, slot);
        return;
      }
      if (motion.probe(actor, slot, true)) {
        startAvoidance(actor, slot, frame, "route-probe");
        return;
      }
      const routing = sample(actor, frame).routing;
      if (!Number.isInteger(routing))
        throw Error("Unported inactive-target routing context");
      if (routing & 128) {
        seek(actor, slot, frame, true);
        if (typeof operations.random !== "function")
          throw Error("Unported locomotion dependency: random");
        actor.timer = byte(
          ((operations.random("route-pause", actor, slot, frame) & 7) << 2) +
            15,
        );
        return;
      }
      const heading = actor.heading;
      actor.heading = slot & 1 ? routing & 15 : routing >> 4;
      const blocked = motion.probe(actor, slot, true);
      const desired = byte(actor.heading << 1);
      actor.heading = heading;
      if (blocked) startAvoidance(actor, slot, frame, "route-turn");
      else motion.target(actor, desired);
    },
    db9c(actor, slot, frame) {
      if (actor.xHigh & 128 || actor.y >= 224) {
        actor.dropId = 127;
        actor.deathEffect = 127;
        effects.destroy(slot);
        return;
      }
      advance(actor, slot, frame, (actor, slot, frame) => {
        actor.timer = 15;
        if (actor.rangeThreshold) {
          seek(actor, slot, frame);
          return;
        }
        actor.heading = 4;
        if (motion.probe(actor, slot, true)) startAvoidance(actor, slot, frame, "vertical-probe");
      });
    },
  };
  function holdRange(actor, slot, frame, range) {
    if (motion.weaponPause(actor)) return;
    if (actor.turnTarget !== 255) actor.heading = actor.turnTarget >> 1;
    const relative = sample(actor, frame);
    if (relative.range < range) handlers.dd4e(actor, slot, frame);
    else if (relative.range > range) handlers.dc6e(actor, slot, frame);
    else {
      actor.timer = 0;
      actor.heading = (relative.steering & 15) >> 1;
      actor.rangeThreshold = 0;
      fire(actor, slot, frame);
    }
  }
  return { handlers, motion };
}
