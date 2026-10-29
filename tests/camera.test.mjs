import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WorldMap } from "../src/world.js";
import { TerrainCache } from "../src/terrain-cache.js";
import { createCameraSystem } from "../src/camera.js";
import { cameraInputs, cameraOutput } from "./camera-inputs.mjs";
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const world = new WorldMap(read("../data/world.json")), fixtures = read("./camera-fixtures.json");
function setup(input) {
  input.cache = new TerrainCache(world); input.cache.cells.set(input.cells);
  const events = [];
  input.camera = createCameraSystem(world, input.cache, input.actors, input.state, {
    refreshEnvironment(s) { events.push([0, s.worldPage & 255, (s.worldPage >> 8) & 1]); },
    onRowLoaded(e) { events.push([1, e.page & 255, e.page >> 8, e.half, e.row]); },
  });
  return events;
}

test("native common camera pass reproduces 8192 original states, cache rows and object shifts", () => {
  const next = cameraInputs(fixtures.seed), hash = createHash("sha256");
  for (let n = 0; n < fixtures.cases; n++) {
    const input = next(n), events = setup(input);
    input.camera.advance(input.horizontal, input.vertical);
    hash.update(Uint8Array.from(cameraOutput(input, events)));
  }
  assert.equal(hash.digest("hex"), fixtures.sha256);
});

test("four 4096-frame camera sequences preserve mixed cache rows and 16-bit page wrap", () => {
  const next = cameraInputs(fixtures.seed);
  for (let n = 0; n < fixtures.cases; n++) next(n);
  for (const fixture of fixtures.sequences) {
    const input = next(fixture.index), events = setup(input), hash = createHash("sha256");
    input.state.worldPage = [511, 256, 1, 0][fixture.index]; input.state.cameraFineY = 0;
    for (let frame = 0; frame < fixture.frames; frame++) {
      events.length = 0;
      input.camera.advance(frame % 512 < 256 ? 1 : 255, 255);
      hash.update(Uint8Array.from(cameraOutput(input, events)));
    }
    assert.equal(hash.digest("hex"), fixture.sha256, `sequence ${fixture.index}`);
  }
});

test("scroll requires the scene environment pass and reserved records", () => {
  const input = cameraInputs(55)(0), cache = new TerrainCache(world);
  input.state.cameraFineY = 233;
  assert.throws(() => createCameraSystem(world, cache, input.actors, input.state).advance(0, -1), /refreshEnvironment/);
  assert.throws(() => createCameraSystem(world, cache, input.actors.slice(0, 30), input.state).advance(0, 0), /reserved scene records/);
});
