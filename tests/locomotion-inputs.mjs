import { actorFromColumns } from "../src/actors.js";
export function inputStream(seed) {
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  return function input(index, kind = 36) {
    const actors = Array.from({ length: 30 }, (_, slot) => {
      const actor = actorFromColumns(
        Array.from({ length: 3 }, () => Array.from({ length: 8 }, rand)),
      );
      actor.y = slot < 2 ? rand() % 232 : 255;
      actor.kind = 7;
      actor.deathEffect = 127;
      actor.dropId = 127;
      actor.spawnMarker = 255;
      return actor;
    });
    const actor = actors[7];
    Object.assign(actor, {
      xLow: rand(),
      xHigh: index % 17 === 0 ? 128 : index & 1,
      y: rand() % 232,
      flags: rand() % 15,
      heading: index % 11 === 0 ? 8 + (rand() % 24) : rand() & 7,
      timer: [0, 1, 7, 8, 15, 127, 128, 255][rand() & 7],
      turnTarget: index % 3 === 0 ? 255 : rand() & 15,
      counter: rand() & 7,
      rangeThreshold: index % 3 === 0 ? 0 : rand() % 9,
      projectileKind: [48, 53, 56, 58][rand() & 3],
      parameter2: rand() & 7,
      kind,
    });
    if (index % 23 === 0) actors[0].y = 255;
    if (index % 29 === 0) actors[1].y = 255;
    const frame = rand(),
      profile = rand() % 7,
      randomBase = rand();
    const state = {
      equipment: rand(),
      modifiers: rand(),
      blastState: 0,
      seed: rand(),
      inactiveRoute: rand(),
    };
    return { actors, actor, frame, profile, randomBase, state };
  };
}
export function contactFor(actor, delta, profile) {
  const heading = actor.heading & 7;
  let flags =
    profile === 0
      ? 0
      : profile === 1
        ? 128
        : profile === 2
          ? heading & 1
            ? 1
            : 0
          : profile === 3
            ? heading === 2 || heading === 3
              ? 2
              : 0
            : profile === 4
              ? Math.abs(delta.dx) > 1 || Math.abs(delta.dy) > 1
                ? 4
                : 0
              : profile === 5
                ? 1
                : heading === 6
                  ? 0
                  : 129;
  if (delta.forced && profile !== 5) flags = 0;
  return flags;
}
export function nativeOperations(input) {
  let count = 0;
  return {
    get count() {
      return count;
    },
    resolveContact(actor, slot, delta) {
      const flags = contactFor(actor, delta, input.profile);
      actor.contactFlags = flags;
      if (flags & 127) delta.dx = delta.dy = 0;
    },
    random() {
      const value = (input.randomBase + 73 * count++) & 255;
      input.state.seed = value;
      return value;
    },
  };
}
