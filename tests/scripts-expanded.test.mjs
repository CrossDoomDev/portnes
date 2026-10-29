import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorFromColumns, actorColumns } from "../src/actors.js";
import { NativeActorSystem } from "../src/actor-system.js";
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const data = read("../data/actors.json"),
  spawns = read("../data/spawns.json"),
  aiming = read("../data/aiming.json"),
  turrets = read("../data/turrets.json"),
  scores = read("../data/scores.json"),
  dispatch = read("../data/handler-coverage.json").dispatch;
const fixtures = read("./script-expanded-fixtures.json").fixtures;
test("ten script/coordinator scenarios reproduce 256 original frames across all 30 slots", () => {
  for (const setup of fixtures) {
    const system = new NativeActorSystem({
      data,
      spawns: { ...spawns, scripts: setup.graph },
      aiming,
      turrets,
      scores,
      dispatch,
      operations: {
        resolveContact(a) {
          a.contactFlags = 0;
        },
        sampleContact(a) {
          a.contactFlags = setup.contact ?? 0;
        },
      },
    });
    system.actors[0] = actorFromColumns([
      [100, 0, 100, 0, 0, 0, 0, 0],
      [0, 0, 0, 7, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 127, 127, 255],
    ]);
    Object.assign(system.actors[setup.earlyExit ? 0 : 7], {
      xLow: 100,
      xHigh: 0,
      y: 60,
      heading: 0,
      kind: setup.kind ?? 7,
      scriptLow: 0,
      scriptHigh: 0xb0,
      commandId: "cmd_b000",
      flags: 3,
      timer: setup.timer ?? 0,
      parameter2: 0,
      projectileKind: 48,
      spawnMarker: 255,
      deathEffect: 127,
      dropId: 127,
    });
    if (setup.earlyExit)
      Object.assign(system.actors[1], {
        y: 100,
        kind: 1,
        timer: 20,
        deathEffect: 127,
        dropId: 127,
        spawnMarker: 255,
      });
    const output = [];
    for (let frame = 0; frame < setup.frames; frame++) {
      system.update(-frame & 255);
      output.push(...system.actors.flatMap((a) => actorColumns(a).flat()));
    }
    assert.equal(
      createHash("sha256").update(Uint8Array.from(output)).digest("hex"),
      setup.sha256,
      JSON.stringify(setup.graph),
    );
  }
});
