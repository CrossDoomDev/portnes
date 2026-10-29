import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createMapChanges } from "../src/map-changes.js";
import { TerrainCache, createActorTerrain } from "../src/terrain-cache.js";
import { WorldMap } from "../src/world.js";
import { NativeActorSystem } from "../src/actor-system.js";
import { actorFromColumns } from "../src/actors.js";
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const changes = read("../data/map-changes.json"), fixtures = read("./map-change-fixtures.json");
const world = new WorldMap(read("../data/world.json"));
function randomGenerator(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; };
}

test("all 68 map-change entries reproduce original cache, redraw rows and retained camera half in 4352 cases", () => {
  const random = randomGenerator(fixtures.seed);
  for (const fixture of fixtures.cases) {
    const hash = createHash("sha256");
    for (let n = 0; n < fixture.cases; n++) {
      const cache = new TerrainCache(null), state = { cameraHigh: 0 }, events = [];
      cache.cells.set(Array.from({ length: 480 }, random)); state.cameraHigh = random();
      createMapChanges(changes, cache, state, e => events.push(e))(fixture.id);
      const rows = events.flatMap(e => Array.from({ length: e.height }, (_, y) => [e.half, e.row + y]));
      hash.update(Uint8Array.from([...cache.cells, state.cameraHigh, ...rows.flat()]));
    }
    assert.equal(hash.digest("hex"), fixture.sha256, `map change ${fixture.id}`);
  }
});

test("2048 overlapping and repeated map changes reproduce the original sequence", () => {
  const random = randomGenerator(fixtures.seed);
  // Skip the inputs used by the isolated oracle cases.
  for (const fixture of fixtures.cases)
    for (let i = 0; i < fixture.cases * 481; i++) random();
  const cache = new TerrainCache(null);
  cache.cells.set(Array.from({ length: 480 }, random));
  const state = { cameraHigh: random() }, changeMap = createMapChanges(changes, cache, state), hash = createHash("sha256");
  for (let i = 0; i < fixtures.sequence.frames; i++) {
    changeMap(random() % 68);
    hash.update(Uint8Array.from([...cache.cells, state.cameraHigh]));
  }
  assert.equal(hash.digest("hex"), fixtures.sequence.sha256);
});

test("actor destruction changes shared terrain immediately and a source-row reload restores it", () => {
  const cache = new TerrainCache(world); cache.loadPage(511);
  const events = [], system = new NativeActorSystem({
    data: read("../data/actors.json"), spawns: read("../data/spawns.json"),
    aiming: read("../data/aiming.json"), dispatch: read("../data/handler-coverage.json").dispatch,
    mapChanges: changes, terrainCache: cache, world,
    state: {
      cameraHigh: 0, cameraFineY: 0, worldPage: 511,
      reservedActors: Array.from({ length: 2 }, () => actorFromColumns(
        Array.from({ length: 3 }, () => Array(8).fill(0)),
      )),
    },
    operations: { onMapChange: e => events.push(e) },
  });
  const point = { xLow: 84, xHigh: 0, y: 196, kind: 8, link: 255, contactFlags: 0 },
    terrain = createActorTerrain(cache, () => ({ page: 511, fineY: 0 }));
  terrain.forceContact(point, 0, { dx: 0, dy: 0 });
  const beforeFlags = point.contactFlags;
  assert.notEqual(beforeFlags, 0);
  Object.assign(system.actors[2], { y: 100, spawnMarker: 8, deathEffect: 127, dropId: 127, kind: 7 });
  system.effects.destroy(2);
  assert.deepEqual(events.map(e => e.id), [8]);
  terrain.forceContact(point, 0, { dx: 0, dy: 0 });
  assert.equal(point.contactFlags, 0);
  // The ordinary camera pass reloads row 13 at fineY=216, replacing the edit.
  system.state.cameraFineY = 217;
  system.camera.advance(0, -1);
  terrain.forceContact(point, 0, { dx: 0, dy: 0 });
  assert.equal(point.contactFlags, beforeFlags);
  assert.equal(cache.metatile(6, 13), 122);
});

test("invalid map-change IDs and missing native dependencies fail explicitly", () => {
  const cache = new TerrainCache(world), change = createMapChanges(changes, cache, {});
  assert.throws(() => change(-1), /Unknown map change/);
  assert.throws(() => change(68), /Unknown map change/);
  assert.throws(() => change(0), /cameraHigh/);
  assert.equal(change(3), null);
  assert.throws(() => createMapChanges(changes, null, {}), /live terrain cache/);
});
