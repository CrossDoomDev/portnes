import { actorFromColumns } from "../src/actors.js";
import { bindSceneState } from "../src/scene-state.js";
export function bossInputs(seed) {
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  return (index, entry, kind) => {
    const actors = Array.from({ length: 32 }, (_, slot) => {
      const a = actorFromColumns(
        Array.from({ length: 3 }, () => Array.from({ length: 8 }, rand)),
      );
      Object.assign(a, {
        kind: 7,
        y: slot < 2 ? 80 + (rand() % 100) : 255,
        spawnMarker: 255,
        dropId: 127,
        deathEffect: 127,
        flags: 131,
        link: 0,
        scriptHigh: 0,
      });
      return a;
    });
    const actor = actors[7];
    Object.assign(actor, {
      xLow: rand(),
      xHigh: index % 7 === 0 ? 128 : index & 1,
      y: rand() % 232,
      flags: 128 + (rand() % 15),
      kind,
      heading: rand() & 15,
      turnTarget: [0, 1, 15, 80, 255][index % 5],
      pendingKind: index % 7,
      counter: index % 7,
      link: index % 4 ? 0 : 1,
      timer: [0, 1, 15, 128, 255][index % 5],
      counter2: rand() % 14,
      parameter2: rand() & 15,
      projectileKind: [48, 53, 56, 58, 59, 26, 172, 95][index & 7],
    });
    if (entry === "d415" || entry === "d537" || entry === "d5c4") {
      actor.link = index % 3 === 0 ? 1 : 0;
      actor.flags = 128 + [3, 6, 8][index % 3];
      actor.counter = index % 7;
    }
    if (entry === "df29" || entry === "df7c") {
      actor.counter = index % 14;
      actor.link = index % 4 === 0 ? 0 : [1, 4, 31][index % 3];
      Object.assign(actors[4], {
        kind: index & 1 ? 45 : 57,
        xLow: actor.xLow,
        xHigh: actor.xHigh,
        y: index % 9 === 0 ? 255 : 100,
        scriptHigh: 0,
      });
    }
    if (entry === "d9ac" || entry === "da86") {
      actor.link = index % 5 === 0 ? 0 : 2;
      const slot = [4, 30, 31][index % 3];
      actors[slot].kind = entry === "d9ac" ? 55 : 60;
      actors[slot].flags = index % 4 === 0 ? 16 : 48;
      actors[slot].pendingKind = index % 2 ? 0 : 32;
      if (index % 7 === 0) actors[slot].kind = 7;
    }
    if (entry === "d8de") {
      actor.flags = index % 4 === 0 ? 3 : 51;
      actor.projectileKind = index % 3 === 0 ? 1 : 0;
      actor.scriptLow = index % 2;
      actor.counter = actor.counter2;
      actor.timer = index % 3 === 0 ? 128 : rand();
      if (index % 8 === 0) actors[4].kind = 52;
    }
    if (entry === "da1a") {
      if (index % 5) actors[[4, 30, 31][index % 3]].kind = 61;
      actor.counter = [0, 1, 32][index % 3];
      actor.pendingKind = index & 1 ? 0 : 1;
      actor.style = index & 7;
    }
    if (entry === "dbe9") {
      actor.appearance = index % 3 === 0 ? 112 : 51;
      actor.counter2 = index % 10;
      actor.link = 131;
      actor.turnTarget = 255;
      const target = [14, 30, 31][index % 3];
      actors[target].link = 7;
      if (index % 11 === 0) for (let s = 14; s < 17; s++) actors[s].y = 100;
    }
    if (entry === "d2dc" || entry === "d2ff") {
      if (index & 1) {
        actors[3].y = 100;
        actors[3].kind = 36;
      }
    }
    if (entry === "daff") actor.counter = index % 3;
    if (entry === "e733") actor.counter = index & 1;
    if (entry === "cde5")
      actor.rangeThreshold = [0, 1, 2, 8, 16, 32][index % 6];
    const frame = [0, 1, 16, 32, 64, 128, 192, 224, 255][index % 9],
      forcedFlags = [0, 128, 1, 64, 129][index % 5],
      randomBase = rand();
    const state = {
      mode: rand(),
      modifiers: rand(),
      equipment: rand(),
      cameraLow: rand(),
      cameraHigh: rand(),
      cameraFineY: rand(),
      statusTimer: index % 3 === 0 ? 51 : rand(),
      musicCommand: rand(),
      blastState: [0, 15, 127, 128, 200, 255][index % 6],
      seed: rand(),
      deadFlag: rand(),
      healthSegments: rand(),
      frameCounter: frame,
      conversionSearchOffset: [112, 76, 80, 0, 248][index % 5],
      inactiveRoute: 0,
      spriteAnchor: { x: rand() + 256 * (rand() & 1), y: rand(), marker: 160 },
    };
    bindSceneState(state, actors.slice(30));
    return { actors, actor, frame, forcedFlags, randomBase, state };
  };
}
export function bossOperations(input) {
  let count = 0;
  const mapEvents = [];
  return {
    get count() {
      return count;
    },
    mapEvents,
    resolveContact(actor, slot, delta) {
      actor.contactFlags = input.forcedFlags;
      if (actor.contactFlags & 127) delta.dx = delta.dy = 0;
    },
    sampleContact(actor) {
      actor.contactFlags = input.forcedFlags;
    },
    random() {
      const value = (input.randomBase + 73 * count++) & 255;
      input.state.seed = value;
      return value;
    },
    changeMap(id) {
      mapEvents.push(id);
    },
  };
}
export function bossOutput(input, operations) {
  const s = input.state,
    a = s.spriteAnchor;
  return [
    s.mode,
    s.cameraLow,
    s.cameraHigh,
    s.cameraFineY,
    s.musicCommand,
    s.blastState,
    s.seed,
    s.deadFlag,
    s.healthSegments,
    s.statusTimer,
    s.frameCounter,
    a.x & 255,
    a.x >> 8,
    a.y,
    a.marker,
    operations.count,
    ...operations.mapEvents,
  ];
}
export function configureBossHelper(input, name, index) {
  if (name === "orbit") input.actor.counter = 1;
  if (name === "spawnLayout") {
    if (index % 4 === 0)
      for (let slot = 2; slot < 14; slot++) input.actors[slot].y = 100;
    if (index % 4 === 1)
      for (let slot = 2; slot < 12; slot++) input.actors[slot].y = 100;
  }
  return input;
}
