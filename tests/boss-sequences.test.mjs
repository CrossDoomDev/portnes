import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NativeActorSystem } from "../src/actor-system.js";
import { WorldMap } from "../src/world.js";
import { TerrainCache, createActorTerrain } from "../src/terrain-cache.js";
import { actorColumns } from "../src/actors.js";
import { bossScenario } from "./boss-scenarios.mjs";
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const config = {
  System: NativeActorSystem,
  data: read("../data/actors.json"),
  spawns: read("../data/spawns.json"),
  aiming: read("../data/aiming.json"),
  turrets: read("../data/turrets.json"),
  emplacements: read("../data/emplacements.json"),
  bosses: read("../data/bosses.json"),
  scores: read("../data/scores.json"),
  dispatch: read("../data/handler-coverage.json").dispatch,
};
const world = new WorldMap(read("../data/world.json")),
  fixtures = read("./boss-sequence-fixtures.json");
test("four native boss layouts reproduce 768 original frames each; player destruction preserves the next actors' frame counter", () => {
  for (const fixture of fixtures.scenarios) {
    const setup = bossScenario(config, fixture.index),
      system = setup.system,
      cache = new TerrainCache(world);
    cache.loadPage(511);
    Object.assign(
      setup.operations,
      createActorTerrain(cache, () => ({
        page: 511,
        fineY: system.state.cameraFineY,
      })),
    );
    const output = [];
    for (let frame = 0; frame < fixture.frames; frame++) {
      system.update(-frame & 255);
      const s = system.state,
        a = s.spriteAnchor;
      output.push(
        ...[...system.actors, ...s.reservedActors].flatMap((record) =>
          actorColumns(record).flat(),
        ),
        s.mode,
        s.cameraLow,
        s.cameraHigh,
        s.cameraFineY,
        s.musicCommand,
        s.seed,
        s.frameCounter,
        a.y,
        a.x >> 8,
        a.marker,
        a.x & 255,
        setup.calls & 255,
        setup.calls >> 8,
      );
    }
    assert.equal(setup.calls, fixture.randomCalls);
    assert.deepEqual(setup.mapEvents, fixture.mapEvents);
    assert.equal(
      createHash("sha256").update(Uint8Array.from(output)).digest("hex"),
      fixture.sha256,
      `scene ${fixture.index}`,
    );
  }
});
