import { actorFromColumns } from "../src/actors.js";
export function bossScenario(config, index) {
  const records = Array.from({ length: 32 }, () => {
    const a = actorFromColumns(
      Array.from({ length: 3 }, () => Array(8).fill(0)),
    );
    Object.assign(a, {
      kind: 7,
      y: 255,
      dropId: 127,
      deathEffect: 127,
      spawnMarker: 255,
    });
    return a;
  });
  Object.assign(records[0], {
    xLow: 116,
    xHigh: 0,
    y: 168,
    kind: 0,
    link: 129,
    flags: 51,
    counter2: 32,
    hitbox: 2,
  });
  Object.assign(records[1], {
    xLow: 116,
    xHigh: 0,
    y: 168,
    kind: 0,
    link: 129,
    flags: 48,
    counter2: 32,
    hitbox: 2,
  });
  const state = {
    mode: 128,
    frameCounter: 0,
    modifiers: 0,
    equipment: 0,
    cameraLow: 0,
    cameraHigh: 0,
    cameraFineY: 0,
    musicCommand: 0,
    blastState: 0,
    seed: 17,
    deadFlag: 0,
    healthSegments: 15,
    statusTimer: 51,
    inactiveRoute: 0,
    spriteAnchor: { x: 0, y: 0, marker: 0 },
    reservedActors: records.slice(30),
  };
  const mapEvents = [];
  let calls = 0;
  const operations = {
    changeMap(id) {
      mapEvents.push(id);
    },
    random() {
      const value = (17 + 73 * calls++) & 255;
      system.state.seed = value;
      return value;
    },
  };
  const system = new config.System({ ...config, state, operations });
  system.actors.splice(0, 30, ...records.slice(0, 30));
  if (index < 4) {
    system.scene.spawnLayout(index);
    for (const actor of system.actors)
      if ([14, 16, 18, 55].includes(actor.kind)) {
        actor.link = 0;
        actor.flags |= 48;
        if (actor.kind === 55) {
          actor.projectileKind = 0;
          actor.timer = 128;
        }
      }
  } else {
    Object.assign(system.actors[0], { kind: 6, rangeThreshold: 1 });
    Object.assign(system.actors[2], { kind: 1, y: 100, timer: 20 });
  }
  return {
    system,
    records,
    mapEvents,
    operations,
    get calls() {
      return calls;
    },
    frames: index < 4 ? 768 : 8,
  };
}
