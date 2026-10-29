import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorFromColumns, actorColumns } from "../src/actors.js";
import {
  findActorCollision,
  createActorCombat,
} from "../src/actor-collisions.js";
import { createActorEffects } from "../src/actor-effects.js";
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const data = read("../data/actors.json"),
  scores = read("../data/scores.json"),
  fixture = read("./collision-fixtures.json");
const hash = (a) =>
  createHash("sha256").update(Uint8Array.from(a)).digest("hex");
test("4,096 collision pool scans and 4,096 damage/score cases match original routines", () => {
  let seed = fixture.seed;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  let actual = [];
  for (let n = 0; n < fixture.collisions.cases; n++) {
    const actors = Array.from({ length: 30 }, () =>
      actorFromColumns(
        Array.from({ length: 3 }, () => Array.from({ length: 8 }, rand)),
      ),
    );
    const sourceSlot = rand() % 30,
      startSlot = rand() % 30,
      count = 1 + (rand() % (30 - startSlot)),
      state = { mode: rand(), cameraLow: rand() };
    actual.push(
      findActorCollision(data, actors, sourceSlot, startSlot, count, state) + 1,
    );
  }
  assert.equal(hash(actual), fixture.collisions.sha256);
  actual = [];
  for (let n = 0; n < fixture.damage.cases; n++) {
    const actors = Array.from({ length: 30 }, () => {
      const a = actorFromColumns(
        Array.from({ length: 3 }, () => Array.from({ length: 8 }, rand)),
      );
      a.kind = 7;
      a.link = 0;
      a.deathEffect = 127;
      a.dropId = 127;
      a.spawnMarker = 255;
      return a;
    });
    const sourceSlot = [0, 26, 27, 28, 29][rand() % 5],
      targetSlot = 2 + (rand() % 15);
    const state = {
      modifiers: rand(),
      reserveEnergy: rand(),
      score: rand() | (rand() << 8) | (rand() << 16),
      highScore: rand() | (rand() << 8) | (rand() << 16),
    };
    createActorCombat(
      actors,
      createActorEffects(data, actors),
      state,
      scores,
    ).damagePair(sourceSlot, targetSlot);
    actual.push(
      ...actors.flatMap((a) => actorColumns(a).flat()),
      state.modifiers,
      state.reserveEnergy,
      ...[0, 1, 2].map((i) => (state.score >> (i * 8)) & 255),
      ...[0, 1, 2].map((i) => (state.highScore >> (i * 8)) & 255),
    );
  }
  assert.equal(hash(actual), fixture.damage.sha256);
});
