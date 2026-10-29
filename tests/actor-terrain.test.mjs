import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NativeActorSystem } from "../src/actor-system.js";
import { WorldMap } from "../src/world.js";
import { TerrainCache, createActorTerrain } from "../src/terrain-cache.js";
import { actorColumns } from "../src/actors.js";
import { createTerrainScenario } from "./actor-terrain-scenarios.mjs";
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const data = read("../data/actors.json"),
  spawns = read("../data/spawns.json"),
  aiming = read("../data/aiming.json");
const turrets = read("../data/turrets.json"),
  emplacements = read("../data/emplacements.json"),
  scores = read("../data/scores.json");
const dispatch = read("../data/handler-coverage.json").dispatch,
  world = new WorldMap(read("../data/world.json"));
const fixtures = read("./actor-terrain-fixtures.json");
test("native actor scheduler, enemy steering, shots and real cached terrain reproduce eight 512-frame original scenarios", () => {
  for (const fixture of fixtures.scenarios) {
    const setup = createTerrainScenario(data, world, fixture.index),
      cache = new TerrainCache(world);
    cache.loadPage(setup.camera.page);
    let calls = 0;
    const system = new NativeActorSystem({
      data,
      spawns,
      aiming,
      turrets,
      emplacements,
      scores,
      dispatch,
      state: setup.state,
      operations: {
        ...createActorTerrain(cache, () => setup.camera),
        random() {
          const value = (setup.state.seed + 73 * calls++) & 255;
          system.state.seed = value;
          return value;
        },
      },
    });
    system.actors.splice(0, 30, ...setup.actors);
    const output = [];
    for (let frame = 0; frame < fixture.frames; frame++) {
      system.update(-frame & 255);
      output.push(
        ...system.actors.flatMap((actor) => actorColumns(actor).flat()),
        system.state.seed,
        calls & 255,
        calls >> 8,
      );
    }
    assert.equal(calls, fixture.randomCalls);
    assert.equal(
      createHash("sha256").update(Uint8Array.from(output)).digest("hex"),
      fixture.sha256,
      `scenario ${fixture.index}`,
    );
  }
});
