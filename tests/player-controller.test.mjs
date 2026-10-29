import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorColumns, applyPrototype } from "../src/actors.js";
import { createActorEffects } from "../src/actor-effects.js";
import { createPlayerEquipment } from "../src/player-equipment.js";
import { createPlayerWeapons } from "../src/player-weapons.js";
import { createPlayerController } from "../src/player-controller.js";
import { createActorTerrain, TerrainCache } from "../src/terrain-cache.js";
import { WorldMap } from "../src/world.js";
import { arsenalInputs } from "./player-arsenal-inputs.mjs";
import { gameConfig, readGameFixture } from "./game-inputs.mjs";
const config = gameConfig(), world = new WorldMap(config.world);
test("actor-backed player controller matches 4096 original states with actual terrain, motion modes and player weapons", () => {
 const fixture = readGameFixture("./player-controller-fixtures.json"), next = arsenalInputs(fixture.seed), hash = createHash("sha256");
 for (let n = 0; n < fixture.cases; n++) {
  const input = next(n), s = input.state;
  Object.assign(s, { mode: [0, 64, 128][n % 3], cameraLow: n & 255, cameraHigh: n & 1,
   cameraFineY: n % 240, environmentPage: n % 512, scrollY: 0, scrollX: 0,
   playerScreenX: 116, patience: 1 + n % 20, playerShotSucceeded: false });
  for (let slot = 0; slot < 2; slot++) {
   applyPrototype(config.data, input.actors[slot], slot ? 0 : 1);
   Object.assign(input.actors[slot], { xLow: 80 + n % 96, xHigh: n & 1,
    y: 80 + n % 100, heading: (n + slot * 3) & 7, timer: n & 255,
    spawnMarker: 255, deathEffect: 127, dropId: 127 });
  }
  input.actors[1].flags = (input.actors[1].flags & 240) | [3, 4, 6, 8][n % 4];
  const cache = new TerrainCache(world); cache.loadPage(n % 512);
  const operations = { ...createActorTerrain(cache, () => ({ page: s.environmentPage, fineY: s.cameraFineY })), changeMap() {} };
  const effects = createActorEffects(config.data, input.actors, operations),
   equipment = createPlayerEquipment(config.equipment, input.actors, s),
   weapons = createPlayerWeapons(input.actors, effects, s, equipment),
   controller = createPlayerController(config.data, input.actors, s, effects, weapons, operations);
  controller.step(n & 255);
  const actual = [...input.actors.flatMap(a => actorColumns(a).flat()), ...s.resources,
   s.reserveEnergy, s.equipment, s.modifiers, s.mode, s.scrollY, s.scrollX, s.playerScreenX,
   s.patience, controller.controls.held, controller.controls.cannonRepeat, controller.controls.machineRepeat];
  hash.update(Uint8Array.from(actual));
 }
 assert.equal(hash.digest("hex"), fixture.sha256);
});
