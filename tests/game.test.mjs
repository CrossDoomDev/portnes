import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NativeGame } from "../src/game.js";
import { gameConfig, gameScenario, gameMask, gameOutput, readGameFixture } from "./game-inputs.mjs";
const config = gameConfig();
test("eight native game sequences reproduce 9984 continuous original frames, including 340 actual RNG calls", () => {
 const fixtures = readGameFixture("./game-sequence-fixtures.json");
 for (const fixture of fixtures.scenarios) {
  const g = gameScenario(config, fixture.scenario), hash = createHash("sha256");
  let calls = 0;
  const random = g.random;
  g.random = (...args) => { calls++; return random(...args); };
  for (let frame = 0; frame < fixture.frames; frame++) {
   g.step(gameMask(fixture.scenario, frame));
   hash.update(Uint8Array.from(gameOutput(g)));
  }
  assert.equal(calls, fixture.randomCalls, `RNG scenario ${fixture.scenario}`);
  assert.equal(hash.digest("hex"), fixture.sha256, `game scenario ${fixture.scenario}`);
 }
});
test("game pause and inventory freeze actors while polling controls; selected upgrades spend their own stocks", () => {
 const g = new NativeGame(config), actors = () => JSON.stringify(g.actors);
 g.step(16); assert.equal(g.state.mode & 63, 1);
 const snapshot = actors();
 for (let n = 0; n < 8; n++) g.step(0);
 assert.equal(actors(), snapshot);
 g.step(16); assert.equal(g.state.mode & 63, 0);
 g.step(0); g.step(32); assert.equal(g.state.mode & 63, 2);
 g.state.resources[0] = 5;
 g.step(0); g.step(128); assert.equal(g.equipment.active(0), 1);
 g.step(0); g.step(32); assert.equal(g.state.mode & 63, 0);
 g.step(0); g.step(128);
 assert.equal(g.state.resources[0], 4);
 assert.equal(g.state.reserveEnergy, 0);
 assert.ok(g.events.some(e => e.type === "shot"));
 g.state.inventoryIndex = 6; g.state.modifiers |= 4;
 g.step(0); g.step(32); g.step(0);
 assert.equal(g.state.inventoryIndex, 0); assert.equal(g.state.modifiers & 4, 0);
});
test("four scene-transition sequences match 512 continuous original frames, including arena layout allocation and map replacement", () => {
 for (const fixture of readGameFixture("./game-transition-fixtures.json").scenarios) {
  const g = gameScenario(config, fixture.scenario), hash = createHash("sha256");
  for (let frame = 0; frame < fixture.frames; frame++) {
   g.step(gameMask(fixture.scenario, frame));
   hash.update(Uint8Array.from(gameOutput(g)));
  }
  assert.equal(hash.digest("hex"), fixture.sha256, `transition ${fixture.scenario}`);
 }
});
test("checkpoint lookup, reset, live terrain reload and layout match 128 original resumes", () => {
 const fixture = readGameFixture("./checkpoint-fixtures.json"), hash = createHash("sha256");
 for (let n = 0; n < fixture.cases; n++) {
  const g = new NativeGame(config, { state: { worldPage: n * 17 & 511, frameCounter: n } });
  g.state.mode = 6;
  g.state.resources = [n % 41, (n + 1) % 41, (n + 2) % 41, (n + 3) % 41, n % 25];
  g.state.reserveEnergy = n % 33; g.state.modifiers = n & 255;
  g.step(0); hash.update(Uint8Array.from(gameOutput(g)));
 }
 assert.equal(hash.digest("hex"), fixture.sha256);
});
test("checkpoint resume restores the checkpoint world and preserves collected stock", () => {
 const g = new NativeGame(config);
 g.state.resources = [3, 4, 5, 6, 7]; g.state.modifiers = 255;
 g.state.reserveEnergy = 8; g.state.mode = 6;
 g.step(0);
 assert.equal(g.state.mode, 0);
 assert.equal(g.state.modifiers, 0);
 assert.deepEqual(g.state.resources, [3, 4, 5, 6, 7]);
 assert.equal(g.state.reserveEnergy, 32);
 assert.equal(g.actors[0].counter2, 32);
 assert.ok(g.events.some(e => e.type === "checkpoint"));
});
