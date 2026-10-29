import { actorFromColumns } from "../src/actors.js";
export function createTerrainScenario(data, world, index) {
  const page = [511, 510, 480, 430, 300, 256, 128, 64][index],
    fineY = [0, 8, 23, 127, 232, 239, 64, 191][index];
  const actors = Array.from({ length: 30 }, () => {
    const actor = actorFromColumns(
      Array.from({ length: 3 }, () => Array(8).fill(0)),
    );
    Object.assign(actor, {
      y: 255,
      kind: 7,
      spawnMarker: 255,
      dropId: 127,
      deathEffect: 127,
    });
    return actor;
  });
  Object.assign(actors[0], {
    xLow: 116,
    xHigh: 0,
    y: 150,
    heading: 0,
    flags: 51,
    link: 129,
    counter2: 32,
  });
  Object.assign(actors[1], {
    xLow: 116,
    xHigh: 0,
    y: 150,
    heading: 0,
    flags: 0,
    link: 129,
  });
  const kinds = [32, 33, 34, 36, 37, 38, 39, 40, 56, 63];
  for (let slot = 2; slot < 12; slot++)
    Object.assign(actors[slot], {
      xLow: 40 + ((slot * 29) % 190),
      xHigh: slot & 1,
      y: 20 + ((slot * 17) % 175),
      kind: kinds[(slot + index) % kinds.length],
      flags: 131,
      link: 131,
      heading: slot & 7,
      turnTarget: 255,
      timer: 15,
      projectileKind: 48,
      parameter2: 2,
      counter2: 10,
    });
  return {
    actors,
    camera: { page, fineY },
    state: {
      mode: 0,
      modifiers: 0,
      equipment: 0,
      blastState: 0,
      seed: 17 + index,
      inactiveRoute: 0,
    },
    frames: 512,
  };
}
