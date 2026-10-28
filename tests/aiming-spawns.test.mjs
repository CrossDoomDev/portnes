import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { actorColumns, actorFromColumns } from "../src/actors.js";
import { relativeToActor } from "../src/actor-aiming.js";
import { createSpawnSystem } from "../src/actor-spawns.js";
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const aiming = read("../data/aiming.json"),
  data = read("../data/actors.json"),
  spawns = read("../data/spawns.json"),
  fixture = read("./aiming-spawn-fixtures.json");
const random = () => {
  let seed = fixture.seed;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
};
const hash = (bytes) =>
  createHash("sha256").update(Uint8Array.from(bytes)).digest("hex");
test("12,000 native aiming samples match original directions, ranges, overflow and modifiers", () => {
  const rand = random(),
    output = [];
  for (let i = 0; i < fixture.aiming.cases; i++) {
    const actor = { xLow: rand(), xHigh: rand(), y: rand() },
      target = { xLow: rand(), xHigh: rand(), y: rand() },
      targetSlot = 1 + (rand() % 2),
      frame = rand(),
      status = { equipment: rand(), modifiers: rand() };
    const actual = relativeToActor(
      aiming,
      actor,
      target,
      targetSlot,
      frame,
      status,
    );
    output.push(actual.directionFine, actual.range);
  }
  assert.equal(hash(output), fixture.aiming.sha256);
});
test("all 5,468 spawn records match all 30 original actor slots in four allocation scenarios", () => {
  const rand = random();
  for (let i = 0; i < fixture.aiming.cases * 10; i++) rand();
  const records = spawns.pages.flatMap((p) => p.rows.flat());
  assert.equal(records.length, 5468);
  for (const expected of fixture.spawns) {
    const output = [];
    const scenario = expected.scenario;
    for (const record of records) {
      const actors = Array.from({ length: 30 }, (_, slot) => {
        const a = actorFromColumns(
          Array.from({ length: 3 }, () => Array.from({ length: 8 }, rand)),
        );
        a.y =
          scenario === 0
            ? 255
            : scenario === 1
              ? slot % 3
                ? 255
                : 100
              : scenario === 2
                ? slot >= 14
                  ? 100
                  : 255
                : 100;
        a.kind = slot === 23 ? 7 : 125;
        return a;
      });
      const contact = rand();
      createSpawnSystem(spawns, data, actors, {
        resolveContact(a) {
          a.contactFlags = contact;
        },
      }).spawnRecord(record);
      output.push(...actors.flatMap((a) => actorColumns(a).flat()));
    }
    assert.equal(records.length, expected.cases);
    assert.equal(
      hash(output),
      expected.sha256,
      `allocation scenario ${scenario}`,
    );
  }
});
test("spawn frontier rejects inactive scrolling and non-crossing rows", () => {
  const actors = Array.from({ length: 30 }, () => ({ y: 255 }));
  const system = createSpawnSystem(spawns, data, actors, {
    resolveContact() {
      throw Error("Unexpected spawn");
    },
  });
  assert.deepEqual(system.spawnRow(510, 17, 0), []);
  assert.deepEqual(system.spawnRow(510, 17, 1), []);
  assert.deepEqual(system.spawnRow(510, 18, -1), []);
});
