import {
  byte,
  motionDelta,
  moveActor,
  reserveSlot,
  applyPrototype,
  ACTOR_FIELDS,
} from "./actors.js";

const signed = (value) => (value & 128 ? value - 256 : value);

/** Native boss bodies and linked scene objects. Scene/map/RNG dependencies
 * are explicit; no console program or graphics data is executed here. */
export function createBossHandlers(
  data,
  actors,
  state,
  operations,
  config,
  effects,
  weapons,
  helpers,
  handlers,
) {
  const requireOperation = (name) => {
    if (typeof operations[name] !== "function")
      throw Error(`Unported scene dependency: ${name}`);
    return operations[name];
  };
  const setting = (key, index) => {
    const value = config?.[key]?.[index];
    if (value === undefined)
      throw Error(`Unported boss configuration: ${key}/${index}`);
    return value;
  };
  const actorAt = (slot) => {
    const actor = actors[slot] ?? state.reservedActors?.[slot - 30];
    if (!actor)
      throw Error(`Unported scene dependency: reserved actor ${slot}`);
    return actor;
  };
  const cue = (name) => operations.onCue?.(name);
  function recordAt(offset) {
    offset &= 255;
    if (!(offset & 7)) return actorAt(offset >> 3);
    const view = {};
    for (let group = 0; group < 3; group++)
      for (let field = 0; field < 8; field++) {
        const position = byte(offset + field),
          slot = position >> 3,
          name = ACTOR_FIELDS[group][position & 7];
        Object.defineProperty(view, ACTOR_FIELDS[group][field], {
          get: () => actorAt(slot)[name],
          set: (value) => {
            actorAt(slot)[name] = value;
          },
        });
      }
    return view;
  }
  const cameraX = () => (state.cameraLow ?? 0) | ((state.cameraHigh ?? 0) << 8);
  const fineY = () => state.cameraFineY ?? 0;
  function status(actor, slot) {
    if (actor.rangeThreshold === actor.counter2) return;
    actor.rangeThreshold = actor.counter2;
    operations.onStatusChange?.(actor, slot);
  }
  function anchor(actor) {
    state.spriteAnchor = {
      x:
        (101 +
          (~((((actor.xHigh << 8) | actor.xLow) - cameraX()) & 65535) &
            65535)) &
        511,
      y: byte(actor.y + actor.parameter2),
      marker: 160,
    };
  }
  function arenaCamera(actor, slot, x, y) {
    const camera = (x - ((actor.xHigh << 8) | actor.xLow) - 1) & 65535;
    state.cameraLow = camera & 255;
    state.cameraHigh = camera >> 8;
    state.cameraFineY = byte(y - actor.y - 1);
    status(actor, slot);
  }
  function bossMove(actor, slot) {
    const delta = motionDelta(
      data,
      actor.flags & 15,
      actor.heading,
      actor.turnTarget,
    );
    for (let index = 2; index < 14; index++) {
      const target = actors[index];
      if (target.kind === 13 && target.y !== 255)
        moveActor(target, delta.dx, delta.dy);
    }
    moveActor(actor, delta.dx, delta.dy);
    return delta;
  }
  function wind(actor) {
    for (let slot = 2; slot < 10; slot++) {
      if (actors[slot].y !== 255 && actors[slot].xHigh & 128) {
        actor.heading = (-actor.heading & 7) | (actor.xLow & 128 ? 8 : 0);
        return;
      }
    }
  }
  function pose(actor, frame) {
    const direction = helpers.relative(actor, frame).directionFine;
    actor.pendingKind = setting("poseByDirection", direction);
    actor.appearance = byte(actor.pendingKind + 71);
    return direction;
  }
  function poseShot(actor, slot, frame, prepare = true, phase = frame) {
    if (prepare) {
      actor.flags |= 48;
      if (frame >= 212) return;
    }
    if (phase & 31 || actor.timer) return;
    const spawned = helpers.fire(actor, slot, frame);
    if (spawned < 0) return;
    actor.timer = 15;
    const target = actorAt(spawned);
    if (actor.projectileKind === 212) {
      target.flags = byte(target.flags + (frame >> 1) + (frame & 1));
      target.heading = byte(actor.pendingKind << 1);
    } else target.heading = actor.pendingKind;
    const offset = setting("muzzleOffsets", actor.pendingKind)[
      (frame & 32) >> 5
    ];
    moveActor(target, offset.dx, offset.dy);
    target.xHigh &= 127;
  }
  function orbit(actor) {
    let phase = actor.counter;
    for (let guard = 0; guard < 8; guard++) {
      actor.counter = phase;
      switch (phase) {
        case 1:
          actor.heading = 12;
          if (actor.xLow >= 40) return;
          phase = 2;
          break;
        case 2:
          actor.heading = 8;
          if (actor.y < 192) return;
          phase = 3;
          break;
        case 3:
          actor.heading = 0;
          if (actor.y >= 160) return;
          phase = 4;
          break;
        case 4:
          actor.heading = 4;
          if (actor.xLow < 176) return;
          phase = 5;
          break;
        case 5:
          actor.heading = 8;
          if (actor.y < 192) return;
          phase = 6;
          break;
        case 6:
          actor.heading = 0;
          if (actor.y >= 128) return;
          phase = 1;
          break;
        default:
          throw Error(`Unported boss orbit phase ${phase}`);
      }
    }
    throw Error("Nonterminating boss orbit transition");
  }
  function findKind(kind, start = 2) {
    for (let slot = start; slot < 32; slot++)
      if (actorAt(slot).kind === kind) return slot;
    return -1;
  }
  function followX(actor, body) {
    const x = (((body.xHigh << 8) | body.xLow) + signed(actor.counter)) & 32767;
    actor.xLow = x & 255;
    actor.xHigh = x >> 8;
  }
  function acquireBody(actor) {
    if (byte(actor.link << 1)) return;
    for (let slot = 2; slot < 10; slot++) {
      const body = actors[slot];
      if (
        (body.kind === 45 || body.kind === 57) &&
        body.xLow === actor.xLow &&
        !((body.xHigh ^ actor.xHigh) & 1)
      ) {
        actor.link = slot;
        actor.appearance = 52;
        actor.flags = 4;
        return;
      }
    }
    actor.y = 255;
  }
  function bodyStatus(actor, slot) {
    const body = actorAt(actor.link & 31);
    if (body.kind < 32) {
      effects.destroy(slot);
      return;
    }
    if (body.y === 255) {
      actor.y = 255;
      return;
    }
    actor.y = byte(actor.y + ((actor.kind & 1) << 4));
    if ((actor.y & 240) === 240) actor.y = 0;
  }
  function spawnLayout(id) {
    for (const record of setting("layouts", id)) {
      const reserved = reserveSlot(actors, 16, 12),
        slot = reserved < 0 ? 14 : reserved;
      const actor = actorAt(slot);
      const x = id === 3 ? record.x + 168 : (record.x - cameraX()) & 65535;
      actor.xLow = x & 255;
      actor.xHigh = (x >> 8) & 255;
      const y = record.y - fineY();
      actor.y = byte(y - (y < 0 ? 16 : 0));
      effects.initialize(slot, record.prototype);
    }
  }
  function stageTransition(actor, slot, id) {
    if (helpers.hasActiveActors(slot)) return;
    effects.destroy(slot);
    state.blastState = 0;
    requireOperation("changeMap")(id, actor, slot);
    spawnLayout(id);
    state.musicCommand = 152;
  }
  const entries = {
    d415(actor, slot, frame) {
      wind(actor);
      if (actor.timer) actor.timer = byte(actor.timer - 1);
      if (actor.link) {
        if (state.statusTimer !== 51) return;
        actor.link = byte(actor.link - 1);
        status(actor, slot);
        if (!(actor.flags & 48)) return;
        pose(actor, frame);
        poseShot(actor, slot, frame);
        return;
      }
      actor.projectileKind = actors[0].y & 128 ? 139 : 212;
      poseShot(actor, slot, frame);
      bossMove(actor, slot);
      arenaCamera(actor, slot, 112, 80);
      const direction = pose(actor, frame);
      actor.turnTarget = byte(actor.turnTarget - 1);
      if (actor.turnTarget) return;
      actor.turnTarget = 15;
      if (byte(actor.y + 96) >= 208) return;
      if (!(actor.y & 128)) {
        actor.heading = setting("flightDirection", direction);
        if (frame & 1) actor.link = 120;
      } else {
        actor.heading = (actor.heading + 8) & 15;
        if (!(frame & 16)) actor.heading = 0;
      }
    },
    d537(actor, slot, frame) {
      if (actor.link) {
        actor.link = byte(actor.link - 1);
        return;
      }
      actor.flags |= 48;
      if (actor.timer) actor.timer = byte(actor.timer - 1);
      arenaCamera(actor, slot, 105, 79);
      if (!actor.counter) {
        actor.turnTarget = byte(actor.turnTarget - 1);
        if (!actor.turnTarget) {
          actor.turnTarget = 15;
          if (!(actor.y & 128)) {
            if (!(actor.xHigh & 1)) {
              actor.counter = 1;
              actor.turnTarget = 1;
            } else actor.heading = actor.xLow & 128 ? 4 : 12;
          }
        }
      }
      if (actor.counter) {
        helpers.downwardShot(actor, slot, frame);
        actor.turnTarget = byte(actor.turnTarget - 1);
        if (!actor.turnTarget) {
          orbit(actor);
          actor.turnTarget = 15;
        }
      }
      const delta = bossMove(actor, slot);
      moveActor(actors[3], delta.dx, delta.dy);
    },
    d5c4(actor, slot, frame) {
      wind(actor);
      if (actor.link) {
        actor.link = byte(actor.link - 1);
        return;
      }
      if (actor.timer) actor.timer = byte(actor.timer - 1);
      actor.flags |= 48;
      bossMove(actor, slot);
      arenaCamera(actor, slot, 113, 72);
      if (!actor.timer && !(frame & 63)) helpers.splitShot(actor, slot, frame);
      actor.turnTarget = byte(actor.turnTarget - 1);
      if (actor.turnTarget) return;
      if (actor.y >= 96) {
        actor.heading = 0;
        actor.turnTarget = 1;
      } else {
        actor.heading = setting(
          "pursuitDirection",
          helpers.relative(actor, frame).directionFine,
        );
        actor.turnTarget = 80;
      }
    },
    df29(actor, slot, frame) {
      acquireBody(actor);
      if (actor.y === 255) return;
      handlers.d1b9(actor, slot, frame);
      bodyStatus(actor, slot);
    },
    df7c(actor, slot, frame) {
      acquireBody(actor);
      if (actor.y === 255) return;
      helpers.followLinked(actor, slot, frame);
      bodyStatus(actor, slot);
      if (actor.timer) {
        actor.timer = byte(actor.timer - 1);
        return;
      }
      if (
        !(byte(slot * 16 + frame) & 15) &&
        helpers.fire(actor, slot, frame) >= 0
      )
        actor.timer = 15;
    },
    d9ac(actor, slot, frame) {
      const bodySlot = findKind(55, actor.link & 31);
      if (bodySlot < 0) {
        effects.destroy(slot);
        return;
      }
      actor.link = bodySlot;
      const body = actorAt(bodySlot);
      if ((body.flags & 48) !== 48) return;
      followX(actor, body);
      if (actor.timer) {
        actor.timer = byte(actor.timer - 1);
        return;
      }
      if ((frame & 127) !== actor.turnTarget) return;
      const y = byte(actor.y - 8);
      if (y & 128) return;
      actor.y = y;
      actor.heading = 4;
      if (weapons.emit(slot, 61, 9) >= 0) actor.timer = 15;
      actor.heading = 4;
      helpers.fire(actor, slot, frame);
      actor.y = byte(y + 8);
    },
    da86(actor, slot, frame) {
      if (!state.blastState) state.musicCommand = 152;
      helpers.cacheCounter(actor, slot);
      const bodySlot = findKind(60, actor.link & 31);
      if (bodySlot < 0) {
        effects.destroy(slot);
        return;
      }
      actor.link = bodySlot;
      const body = actorAt(bodySlot);
      followX(actor, body);
      pose(actor, frame);
      if (helpers.cooldown(actor)) return;
      actor.xHigh &= 127;
      poseShot(actor, slot, frame, false, body.pendingKind);
    },
    d8de(actor, slot, frame) {
      if (!(actor.flags & 48)) {
        if (!(byte(fineY() - 16) & 128)) return;
        for (let index = 2; index < 32; index++)
          if ((actorAt(index).kind & 254) === 52) return;
        cue("scene-approach");
      }
      if (actor.projectileKind) {
        actor.projectileKind = byte(actor.projectileKind - 1);
        actor.flags |= 32;
        return;
      }
      actor.flags |= 16;
      if (actor.counter !== actor.counter2) {
        actor.counter = byte(actor.counter - 1);
        operations.onStatusChange?.(actor, slot);
      }
      actor.timer |= 128;
      if (!byte(actor.timer << 1)) {
        actor.flags |= 48;
        actor.timer = ((frame & 6) << 2) + 16;
        const steering = setting(
          "dartSteering",
          helpers.relative(actor, frame).directionFine >> 1,
        );
        actor.heading = steering.heading;
        const speed = actor.scriptLow
          ? byte(steering.speed - 3)
          : steering.speed;
        actor.flags = (actor.flags & 240) | speed;
        actor.scriptLow = byte(actor.scriptLow - 1);
        if (actor.scriptLow & 128) actor.scriptLow = byte(actor.scriptLow + 1);
      }
      handlers.eb90(actor, slot, frame);
      anchor(actor);
    },
    da1a(actor, slot, frame) {
      actor.xHigh &= 127;
      if (findKind(61) < 0) {
        effects.destroy(slot);
        return;
      }
      if (actor.pendingKind) {
        actor.pendingKind = byte(actor.pendingKind - 1);
        anchor(actor);
        return;
      }
      actor.timer |= 128;
      actor.counter = byte(actor.counter - 1);
      if (!actor.counter) {
        if (!(actor.style & 3)) actor.style = actors[0].xLow & 128 ? 4 : 0;
        const step = setting("waveSteps", actor.style);
        actor.counter = step.duration;
        actor.pendingKind = 48;
        actor.heading = step.heading;
        actor.style = byte(actor.style + 1);
        return;
      }
      handlers.eb90(actor, slot, frame);
      anchor(actor);
    },
    dbe9(actor, slot, frame) {
      if (!(actor.xHigh & 128) && byte(actor.y + 18) >= 18) {
        handlers.dd4e(actor, slot, frame);
        return;
      }
      let attachment = -1;
      if (actor.appearance === 112) {
        if (!Number.isInteger(state.conversionSearchOffset))
          throw Error("Unported scene dependency: conversion search cursor");
        for (let index = 0; index < 3; index++) {
          const offset = byte(state.conversionSearchOffset + index * 8);
          if (recordAt(offset).y === 255) {
            attachment = offset;
            break;
          }
        }
        if (attachment < 0) return;
        actor.counter2 = 5;
        for (const field of ["xLow", "xHigh", "y"])
          recordAt(attachment)[field] = actor[field];
      } else {
        for (let index = 14; index < 32; index++)
          if ((actorAt(index).link & 31) === slot) {
            attachment = index * 8;
            break;
          }
        if (attachment < 0) return;
      }
      const target = recordAt(attachment);
      applyPrototype(data, target, byte(actor.counter2 + 4));
      operations.onRecordInitialize?.(attachment, byte(actor.counter2 + 4));
      target.link |= slot;
      effects.initialize(slot, actor.counter2);
      actor.timer = actor.pendingKind = 8;
    },
    daff(actor, slot) {
      if (!state.blastState) state.musicCommand = 144;
      anchor(actor);
      if (!actor.counter) return;
      actor.counter = byte(actor.counter - 1);
      if (!actor.counter)
        requireOperation("changeMap")(actor.spawnMarker & 127, actor, slot);
    },
    e733(actor, slot) {
      for (let index = 17; index < 25; index++) {
        effects.initialize(index, 173);
        actors[index].kind = 9;
        for (const field of ["xLow", "xHigh", "y"])
          actors[index][field] = actor[field];
        actors[index].heading = index & 7;
      }
      actor.y = 255;
      if (!actor.counter) {
        cue("large-burst");
        state.musicCommand = 0;
      }
      const blast = byte(state.blastState + 112);
      state.blastState = blast & 128 ? (blast & 127) | 124 : blast;
    },
    d2dc(actor, slot) {
      stageTransition(actor, slot, 1);
    },
    d2ff(actor, slot) {
      stageTransition(actor, slot, 2);
    },
    cda0(actor, slot) {
      effects.destroy(slot);
      spawnLayout(3);
    },
    cde5(actor, slot, frame) {
      state.deadFlag = 255;
      state.healthSegments = 0;
      state.musicCommand = 0;
      cue("player-breakdown");
      if (!(actor.rangeThreshold & 7)) actor.style ^= 3;
      actor.rangeThreshold = byte(actor.rangeThreshold - 1);
      if (!actor.rangeThreshold) {
        state.frameCounter = 1;
        effects.destroy(slot);
        return { frameCounter: 1 };
      }
      const spawned = helpers.fire(actor, slot, frame);
      if (spawned < 0) return;
      const target = actorAt(spawned);
      const yRandom = byte(
        requireOperation("random")("death-y", actor, slot, frame),
      );
      target.y = byte(target.y + (yRandom & 31) - 12);
      const xRandom = byte(
        requireOperation("random")("death-x", actor, slot, frame),
      );
      const x = target.xLow + byte((xRandom & 31) - 20);
      target.xLow = x & 255;
      target.xHigh = byte(target.xHigh + (x >> 8));
      target.timer = byte(target.timer + (xRandom >> 5) + ((xRandom >> 4) & 1));
      operations.onStatusChange?.(actor, slot);
      cue("breakdown-spark");
    },
  };
  return {
    handlers: entries,
    scene: {
      anchor,
      arenaCamera,
      bossMove,
      pose,
      poseShot,
      orbit,
      spawnLayout,
    },
  };
}
