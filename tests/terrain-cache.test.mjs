import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WorldMap } from "../src/world.js";
import { TerrainCache, createActorTerrain } from "../src/terrain-cache.js";
import { terrainInputs } from "./terrain-inputs.mjs";
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const world = new WorldMap(read("../data/world.json"));
const fixtures = read("./terrain-cache-fixtures.json");
test("three cached terrain entry points match 12,288 original cases at arbitrary fine scroll positions", () => {
  const next = terrainInputs(fixtures.seed, fixtures.environments),
    cache = new TerrainCache(world);
  for (const fixture of fixtures.routines) {
    const output = [];
    for (let index = 0; index < fixture.cases; index++) {
      const input = next(index);
      cache.cells.set(input.cells);
      createActorTerrain(cache, () => input.camera)[fixture.method](
        input.actor,
        7,
        input.delta,
      );
      output.push(
        input.actor.contactFlags,
        input.delta.dx & 255,
        input.delta.dy & 255,
      );
    }
    assert.equal(
      createHash("sha256").update(Uint8Array.from(output)).digest("hex"),
      fixture.sha256,
      fixture.method,
    );
  }
});
test("cache loads named map rows and preserves every other row until explicitly replaced", () => {
  const cache = new TerrainCache(world);
  cache.loadPage(511);
  const before = Array.from(cache.cells);
  cache.loadRow(510, 1, 14);
  for (let i = 0; i < 464; i++) assert.equal(cache.cells[i], before[i]);
  const page = world.page(510);
  assert.deepEqual(
    Array.from(cache.cells.slice(464)),
    world.chunks.get(page.chunks[1])[14],
  );
  cache.setMetatile(32, 15, 123);
  assert.equal(cache.metatile(0, 0), 123);
});
