import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  motionDelta,
  actorFromColumns,
  actorColumns,
  applyPrototype,
  intersects,
  updateActors,
  UnportedActorError,
} from "../src/actors.js";
import { createScriptRunner } from "../src/actor-scripts.js";
import { createActorHandlers } from "../src/actor-handlers.js";
const read = (name) =>
  JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const data = read("../data/actors.json"),
  expected = read("mechanics-fixtures.json");
const scriptExpected = read("script-fixtures.json"),
  schedulerExpected = read("scheduler-fixture.json"),
  coverage = read("../data/handler-coverage.json");
const sha = (bytes) =>
  createHash("sha256").update(Uint8Array.from(bytes)).digest("hex");
function random() {
  let seed = expected.seed;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
}
test("3840 original motion vectors are reproduced without ROM or emulator", () => {
  const output = [];
  for (let speed = 0; speed < 15; speed++)
    for (let heading = 0; heading < 32; heading++)
      for (let phase = 0; phase < 8; phase++) {
        const d = motionDelta(data, speed, heading, phase);
        output.push(d.dy & 255, d.dx & 255);
      }
  assert.equal(output.length / 2, expected.motion.cases);
  assert.equal(sha(output), expected.motion.sha256);
});
test("224 actor prototype initializations reproduce all original 24 fields", () => {
  const rand = random(),
    output = [];
  let count = 0;
  for (let id = 0; id < 256; id++)
    if (data.prototypes[id]) {
      const columns = Array.from({ length: 3 }, () =>
        Array.from({ length: 8 }, rand),
      );
      const actor = actorFromColumns(columns);
      applyPrototype(data, actor, id);
      output.push(...actorColumns(actor).flat());
      count++;
    }
  assert.equal(count, expected.prototypes.cases);
  assert.equal(sha(output), expected.prototypes.sha256);
});
test("2048 collision comparisons match original unsigned edge behavior", () => {
  const rand = random();
  // The fixture generator uses one deterministic stream after prototype inputs.
  for (let id = 0; id < 256; id++)
    if (data.prototypes[id]) for (let i = 0; i < 24; i++) rand();
  const output = [];
  for (let n = 0; n < expected.hitboxes.cases; n++) {
    const a = { xLow: rand(), xHigh: 0, y: rand(), hitbox: rand() & 15 },
      b = { xLow: rand(), xHigh: 0, y: rand(), hitbox: rand() & 15 },
      camera = rand();
    output.push(intersects(data, a, b, camera) ? 1 : 0);
  }
  assert.equal(sha(output), expected.hitboxes.sha256);
});
test("four native actor script fixtures reproduce 64 original frames each", () => {
  for (const fixture of scriptExpected.fixtures) {
    const actor = actorFromColumns(
      Array.from({ length: 3 }, () => new Array(8).fill(0)),
    );
    actor.y = 100;
    actor.scriptLow = 0;
    actor.scriptHigh = 0xb0;
    actor.commandId = fixture.start;
    actor.flags = fixture.flags;
    const update = createScriptRunner(fixture.graph, data),
      output = [];
    for (let frame = 0; frame < fixture.frames; frame++) {
      if (actor.scriptHigh & 128) update(actor, 0, -frame & 255);
      output.push(...actorColumns(actor).flat());
    }
    assert.equal(sha(output), fixture.sha256);
  }
});
test("actor scheduler retains original order and culls the same slots", () => {
  const actors = Array.from({ length: 30 }, (_, slot) => {
    const a = actorFromColumns(
      Array.from({ length: 3 }, () => new Array(8).fill(0)),
    );
    a.y = [0, 100, 231, 232, 240, 255][slot % 6];
    a.kind = 7;
    return a;
  });
  const order = [];
  updateActors(
    actors,
    0,
    coverage.dispatch,
    { d0c6: (a, slot) => order.push(slot) },
    () => {
      throw Error("Unexpected script");
    },
  );
  assert.deepEqual(order, schedulerExpected.order);
  assert.equal(
    sha(actors.flatMap((a) => actorColumns(a).flat())),
    schedulerExpected.sha256,
  );
  actors[0].kind = 31;
  assert.throws(
    () => updateActors(actors, 0, coverage.dispatch, {}, () => {}),
    UnportedActorError,
  );
});
test("all extracted spawn graphs resolve and the verified native registry covers every original handler entry", () => {
  const spawns = read("../data/spawns.json");
  assert.equal(spawns.pages.length, 512);
  assert.equal(spawns.unresolved.length, 0);
  let records = 0;
  for (const page of spawns.pages) {
    assert.equal(page.rows.length, 15);
    for (const row of page.rows) records += row.length;
  }
  assert.equal(records, 5468);
  assert.equal(Object.keys(spawns.scripts).length, 1081);
  for (const command of Object.values(spawns.scripts))
    for (const key of ["next", "target"])
      if (command[key]) assert.ok(spawns.scripts[command[key]]);
  assert.equal(
    coverage.handlers.filter((h) => h.entry !== "d0c6" && !h.implemented)
      .length,
    0,
  );
  const implemented = Object.keys(
    createActorHandlers({}, {}, [], {}).handlers,
  ).sort();
  assert.deepEqual(
    coverage.handlers
      .filter((h) => h.implemented)
      .map((h) => h.entry)
      .sort(),
    implemented,
  );
  assert.equal(coverage.implemented, implemented.length);
  assert.equal(coverage.campaignIntegrationComplete, false);
});
