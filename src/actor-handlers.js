import { byte, motionDelta, moveActor, turnStep } from "./actors.js";
import { relativeToActor } from "./actor-aiming.js";
import { createActorEffects, createProjectileUpdate } from "./actor-effects.js";
import { createActorWeapons } from "./actor-weapons.js";
import { sampleRelativeToActor } from "./actor-aiming.js";
import { createMovementHandlers } from "./actor-movement-handlers.js";

/** DB29 is an existence scan, not a damage check. */
export function hasActiveActors(actors, sourceSlot, armoredOnly = false) {
  for (let slot = 2; slot < 17; slot++) {
    const actor = actors[slot];
    if (slot === sourceSlot || actor.y === 255 || actor.kind === 64) continue;
    if (armoredOnly && (actor.kind < 32 || actor.kind >= 57)) continue;
    return 1;
  }
  return 0;
}

/** Explicit translations of individual actor handlers. Dependencies must be
 * supplied by the game coordinator; absent combat/map logic fails visibly. */
export function createActorHandlers(
  data,
  aiming,
  actors,
  state,
  operations = {},
  turretData = null,
  emplacementData = null,
) {
  const requireOperation = (name) => {
    if (typeof operations[name] !== "function")
      throw Error(`Unported actor dependency: ${name}`);
    return operations[name];
  };
  const effects = createActorEffects(data, actors, operations);
  const weapons = createActorWeapons(actors, effects, aiming, state);
  const relative = (actor, frame) =>
    relativeToActor(aiming, actor, actors[0], 0, frame, state);
  const samplePlayer = (actor, frame) =>
    sampleRelativeToActor(aiming, actor, actors[0], 0, frame, {
      ...state,
      inactiveSteering: actors[16].scriptLow,
    });
  const contact = (actor, slot) =>
    requireOperation("resolveContact")(actor, slot, {
      dx: 0,
      dy: 0,
      forced: true,
    });
  const fire = (actor, slot, frame) =>
    (operations.fire ?? weapons.fire)(actor, slot, frame);
  const cue = (name) => operations.onCue?.(name);
  const cooldown = (actor) => {
    if (!actor.timer) return false;
    actor.timer = byte((actor.timer & 15) - 1);
    return true;
  };
  const copyPosition = (actor, target) => {
    for (const field of ["xLow", "xHigh", "y"]) actor[field] = target[field];
  };
  const animated = (mask) => (actor, slot) => {
    actor.heading = (actor.timer & mask) >> 2;
    actor.timer = byte(actor.timer + 1);
    if (!actor.timer) effects.destroy(slot);
  };
  const linkedActor = (actor) => {
    const target = actors[actor.link & 31];
    if (!target) throw Error("Linked actor is outside the 30-slot pool");
    return target;
  };
  function followLinked(actor, slot, frame) {
    const target = linkedActor(actor);
    if (!byte(actor.link << 3)) return target;
    copyPosition(actor, target);
    actor.contactFlags = target.contactFlags;
    if (!(actor.flags & 15) && !(byte(slot * 64 + frame) & 15)) {
      actor.style ^= target.hitbox;
      target.style = actor.style & 3;
    }
    return target;
  }
  function turretBase(actor, slot, frame) {
    followLinked(actor, slot, frame);
    actor.turnTarget = byte(actor.turnTarget - 1);
    if (actor.timer) actor.timer = byte(actor.timer - 1);
    if (!(actor.turnTarget & 7)) {
      const sample = samplePlayer(actor, frame);
      actor.heading =
        (actor.heading + turnStep(actor.heading, sample.steering & 15)) & 7;
    }
  }
  function turretSetting(actor, key) {
    if (!turretData?.[key] || actor.counter >= turretData[key].length)
      throw Error(`Unported turret configuration: ${key}/${actor.counter}`);
    return turretData[key][actor.counter];
  }
  function cacheCounter(actor, slot) {
    if (actor.counter2 !== actor.scriptLow) {
      actor.scriptLow = actor.counter2;
      operations.onStatusChange?.(actor, slot);
    }
  }
  function burstTick(actor, slot, frame) {
    actor.pendingKind = byte(actor.pendingKind - 1);
    if (!(turretSetting(actor, "fireMask") & actor.pendingKind)) {
      if (fire(actor, slot, frame) >= 0) actor.timer = 15;
    }
  }
  function turretBurst(actor, slot, frame) {
    const mode = turretSetting(actor, "positionMode");
    if (!(mode & 128)) {
      if (!byte(mode << 1)) followLinked(actor, slot, frame);
      else {
        const target = linkedActor(actor);
        copyPosition(target, actor);
        actor.contactFlags = target.contactFlags;
        if (!(target.scriptHigh & 128) || target.kind === 1)
          target.timer = byte(target.timer + 1);
      }
    }
    if (actor.timer) actor.timer = byte(actor.timer - 1);
    burstTick(actor, slot, frame);
    if (!actor.pendingKind)
      actor.pendingKind = turretSetting(actor, "recovery");
  }
  function emplacementSetting(key, index) {
    const value = emplacementData?.[key]?.[index];
    if (!Number.isInteger(value))
      throw Error(`Unported emplacement configuration: ${key}/${index}`);
    return value;
  }
  function fixedBurst(actor, slot, frame) {
    actor.turnTarget = byte(actor.turnTarget - 1);
    if (actor.turnTarget >= 192 || actor.turnTarget & 15) return;
    const heading = actor.heading;
    actor.heading = (heading >> 1) + 3;
    const spawned = fire(actor, slot, frame);
    actor.heading = heading;
    if (spawned >= 0) {
      actor.timer = 15;
      actors[spawned].y = byte(actors[spawned].y - 16);
    }
  }
  function downwardShot(actor, slot, frame) {
    if (actor.timer || frame >= 192 || (((actor.kind & 4) << 2) ^ frame) & 31)
      return;
    const spawned = fire(actor, slot, frame);
    if (spawned >= 0) {
      actor.timer = 15;
      actors[spawned].heading = 4;
    }
  }
  function splitShot(actor, slot, frame) {
    const spawned = fire(actor, slot, frame);
    if (spawned < 0) return;
    actor.timer = 15;
    const projectile = actor.projectileKind,
      heading = actor.heading;
    actors[spawned].rangeThreshold = emplacementSetting(
      "splitShotRange",
      relative(actor, frame).directionFine,
    );
    actor.projectileKind = 63;
    actor.heading = 3;
    fire(actor, slot, frame);
    actor.heading = 5;
    fire(actor, slot, frame);
    actor.heading = heading;
    actor.projectileKind = projectile;
  }
  const handlers = {
    d0c6() {},
    d16f() {},
    df27() {},
    df28() {},
    e717: animated(12),
    e71f: animated(28),
    eb90: createProjectileUpdate(data, effects, {
      resolveContact: (actor, slot, delta) =>
        requireOperation("resolveContact")(actor, slot, delta),
      getBlastState: () => state.blastState,
    }),
    e785(actor, slot) {
      actor.timer = byte(actor.timer + 1);
      if (!actor.timer || actor.y >= 240) return effects.destroy(slot);
      actor.appearance = byte(((actor.timer & 28) >> 2) + actor.pendingKind);
      const delta = motionDelta(
        data,
        actor.flags & 15,
        actor.heading,
        actor.timer,
      );
      moveActor(actor, delta.dx, delta.dy);
    },
    d0c7(actor, slot) {
      actor.appearance = actor.parameter2;
      contact(actor, slot);
      if (byte(actor.contactFlags << 1)) actor.appearance = 51;
      else {
        actor.timer = byte(actor.timer - 1);
        if (actor.timer === 0) {
          actor.counter = byte(actor.counter - 1);
          if (actor.counter === 0) actor.y = 255;
        }
      }
    },
    d098(actor, slot) {
      actor.timer = byte(actor.timer - 1);
      for (let index = 2; index < 17; index++)
        if (
          actors[index].y !== 255 &&
          [14, 16, 18].includes(actors[index].kind)
        )
          return;
      effects.initialize(slot, 72);
    },
    dae4(actor) {
      if (actor.style & 2) copyPosition(actor, actors[1]);
    },
    daec(actor) {
      copyPosition(actor, actors[1]);
    },
    dacb(actor, slot, frame) {
      if (hasActiveActors(actors, slot)) return;
      actor.kind = 11;
      actor.flags |= 32;
      handlers.dae4(actor);
    },
    d325(actor, slot, frame) {
      if (hasActiveActors(actors, slot)) return;
      effects.destroy(slot);
      state.blastState = 0;
    },
    e6bb(actor) {
      actor.timer = byte(actor.timer + 2);
      const offset = actor.timer & 248;
      if (offset === 208) actor.y = 255;
      else {
        const target = actors[offset >> 3];
        if (!target)
          throw Error("Actor follow cursor is outside the 30-slot pool");
        if (target.y !== 255) copyPosition(actor, target);
      }
    },
    d339(actor, slot, frame) {
      if (actor.timer) {
        actor.timer = byte(actor.timer - 1);
        return;
      }
      if (relative(actor, frame).range < 6) effects.destroy(slot);
    },
    d351(actor, slot, frame) {
      actor.heading = relative(actor, frame).directionFine & 15;
      actor.kind = 70;
      fire(actor, slot, frame);
      actor.rangeThreshold = 120;
    },
    d36b(actor, slot) {
      actor.rangeThreshold = byte(actor.rangeThreshold - 1);
      if (actor.rangeThreshold === 0) effects.initialize(slot, 211);
    },
    d379(actor, slot) {
      if (!cooldown(actor)) effects.initialize(slot, actor.link);
    },
    d3b4(actor) {
      actor.flags ^= 32;
      actor.timer = byte(actor.timer - 1);
      if (!(actor.xHigh & 128) && actor.timer & 127) return;
      if (!(actor.xHigh & 128)) cue("flyby");
      moveActor(actor, 128, 0);
    },
    e074(actor, slot, frame) {
      actor.timer = byte(actor.timer - 1);
      if (state.modifiers & 2) return;
      if (relative(actor, frame).range >= 6) actor.timer = 0;
      else if (!(frame & 31)) cue("nearby-alert");
    },
    d01e(actor, slot) {
      if (actor.xHigh & 128 || actor.y >= 232) {
        actor.y = 255;
        return;
      }
      actor.timer = byte(actor.timer - 1);
      const delta = motionDelta(
        data,
        actor.flags & 15,
        actor.heading,
        actor.timer,
      );
      moveActor(actor, delta.dx, delta.dy);
      requireOperation("sampleContact")(actor, slot, delta);
      if (actor.contactFlags & 128 && byte(actor.contactFlags << 1))
        actor.y = 255;
    },
    d045(actor, slot, frame) {
      if (actor.timer) {
        actor.timer = byte(actor.timer - 1);
        return;
      }
      contact(actor, slot);
      if (byte(actor.contactFlags << 1)) {
        actor.contactFlags |= 128;
        actor.appearance = 224;
        if (!(frame & 63)) {
          actor.heading = 0;
          const spawned = fire(actor, slot, frame);
          if (spawned >= 0) actors[spawned].contactFlags = 0;
        }
      } else {
        actor.appearance = 225;
        if (!((slot * 64 + frame) & 63)) actor.timer = 32;
      }
    },
    d170(actor, slot, frame) {
      turretBase(actor, slot, frame);
      if (actor.timer || byte(slot * 64 + frame) >= 160) return;
      actor.pendingKind = byte(actor.pendingKind + 1);
      if (actor.pendingKind < actor.parameter2) return;
      actor.pendingKind = 0;
      if (fire(actor, slot, frame) >= 0) actor.timer = 15;
    },
    d1a1(actor, slot, frame) {
      if (slot === 0) return;
      const target = followLinked(actor, slot, frame);
      if (target.scriptHigh & 128) return;
      actor.kind = actor.pendingKind;
      actor.pendingKind = 0;
    },
    d1b9(actor, slot, frame) {
      if (actor.pendingKind) {
        if (actor.pendingKind & 128) {
          actor.pendingKind = byte(actor.pendingKind + 1);
          followLinked(actor, slot, frame);
          cooldown(actor);
        } else turretBurst(actor, slot, frame);
        return;
      }
      turretBase(actor, slot, frame);
      const sample = samplePlayer(actor, frame);
      const target = linkedActor(actor);
      if (target.kind === 47) return;
      if (target.scriptHigh & 128) {
        if (target.kind !== 2) return;
      } else if (
        byte(
          turretSetting(actor, "rangeLimit") + ((state.modifiers >> 6) & 1),
        ) < sample.range
      )
        return;
      if (turnStep(actor.heading, sample.steering) === 0)
        actor.pendingKind = turretSetting(actor, "burstLength");
    },
    d0f2(actor, slot, frame) {
      handlers.d1b9(actor, slot, frame);
      cacheCounter(actor, slot);
    },
    d7df(actor, slot, frame) {
      contact(actor, slot);
      if (!byte(actor.contactFlags << 1)) {
        effects.destroy(slot);
        return;
      }
      const link = actor.link;
      actor.link = 0;
      handlers.d170(actor, slot, frame);
      actor.link = link;
    },
    d802(actor, slot, frame) {
      if (cooldown(actor)) return;
      contact(actor, slot);
      if (!byte(actor.contactFlags << 1)) {
        effects.destroy(slot);
        return;
      }
      const value = emplacementSetting(
        "contactTurret",
        (samplePlayer(actor, frame).steering & 15) >> 1,
      );
      actor.heading = (value >> 1) & 7;
      if (value & 128) return;
      actor.turnTarget = byte(actor.turnTarget + 1);
      if (actor.turnTarget >= 224 || actor.turnTarget & actor.parameter2)
        return;
      if (fire(actor, slot, frame) >= 0) actor.timer = 15;
    },
    d855(actor, slot, frame) {
      if (actor.counter) {
        if (actor.spawnMarker !== 255) actor.spawnMarker &= 127;
        if (!((slot * 64 + frame) & 15)) actor.style ^= 3;
      }
      if (cooldown(actor)) return;
      const value = emplacementSetting(
        "fixedTurret",
        relative(actor, frame).directionFine,
      );
      actor.heading = value & 15;
      if (!(value & 128)) fixedBurst(actor, slot, frame);
    },
    d8c3(actor, slot, frame) {
      actor.heading = 2;
      if (!cooldown(actor)) fixedBurst(actor, slot, frame);
    },
    df71(actor, slot) {
      cacheCounter(actor, slot);
      actor.heading = 4;
      handlers.d01e(actor, slot);
    },
    e02b(actor, slot) {
      cacheCounter(actor, slot);
      if (actor.contactFlags & 3) {
        actor.pendingKind = byte(actor.pendingKind + 1) | 128;
        return;
      }
      if (actor.pendingKind & 128) {
        actor.pendingKind = byte(actor.pendingKind + 1);
        return;
      }
      actor.timer = byte(actor.timer - 1);
      if (byte(actor.y + 120) < 136) {
        const heading = actor.y & 128 ? 0 : 4;
        if (heading !== actor.heading) {
          actor.heading = heading;
          actor.pendingKind = 192;
        }
      }
      const delta = motionDelta(
        data,
        actor.flags & 15,
        actor.heading,
        actor.timer,
      );
      requireOperation("resolveContact")(actor, slot, delta);
      moveActor(actor, delta.dx, delta.dy);
    },
    dff3(actor, slot, frame) {
      cacheCounter(actor, slot);
      if (linkedActor(actor).pendingKind === 224) splitShot(actor, slot, frame);
      else turretBase(actor, slot, frame);
    },
    d686(actor, slot, frame) {
      const index = byte(actor.rangeThreshold << 4) | (actor.timer >> 3);
      actor.heading = emplacementSetting("curvedShotHeading", index);
      handlers.eb90(actor, slot, frame);
    },
    d6ab(actor, slot, frame) {
      if (actor.link) {
        actor.link = byte(actor.link - 1);
        return;
      }
      if (actor.timer) actor.timer = byte(actor.timer - 1);
      downwardShot(actor, slot, frame);
      for (let index = 2; index < 17; index++)
        if (actors[index].kind === 16) return;
      effects.destroy(slot);
    },
    e655(actor, slot, frame) {
      if (!actor.counter) {
        actor.counter = 1;
        weapons.emit(slot, actor.projectileKind);
        return;
      }
      actor.timer |= 128;
      if (actor.scriptLow) {
        actor.scriptLow = byte(actor.scriptLow - 1);
        if (!(actor.scriptLow & 128) && !(actor.scriptLow & 15)) {
          const difference =
            (actor.heading - relative(actor, frame).directionFine) & 15;
          const delta = difference === 0 ? 0 : difference <= 8 ? -1 : 1;
          actor.heading = (actor.heading + delta) & 15;
        }
      }
      handlers.eb90(actor, slot, frame);
    },
    d386(actor, slot) {
      if (hasActiveActors(actors, slot)) return;
      if (actor.counter) {
        actor.counter = byte(actor.counter - 1);
        if (actor.counter) return;
        cue("stage-clear");
        state.musicCommand = 128;
      }
      actor.timer = byte(actor.timer - 1);
      if (actor.timer) return;
      actor.counter2 = byte(actor.counter2 - 1);
      if (!actor.counter2) state.mode = 12;
    },
  };
  const movement = createMovementHandlers(
    data,
    aiming,
    actors,
    state,
    effects,
    weapons,
    operations,
  );
  Object.assign(handlers, movement.handlers);
  return { handlers, effects, locomotion: movement.motion };
}
