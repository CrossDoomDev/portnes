import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NativeGame } from "../src/game.js";
import { gameConfig, gameOutput, readGameFixture } from "./game-inputs.mjs";
const config = gameConfig();

test("128 campaign positions reproduce 97200 continuous original frames with mixed movement and both weapons", () => {
  for (const fixture of readGameFixture("./game-broad-fixtures.json").scenarios) {
    const scenario = fixture.scenario;
    const g = new NativeGame(config, { state: { worldPage: scenario * 7 & 511, cameraHigh: scenario & 1 } });
    for (let i = 0; i < 2; i++) g.actors[i].xHigh = scenario & 1;
    g.layout.update(g.state.frameCounter);
    const hash = createHash("sha256");
    for (let frame = 0; frame < fixture.frames; frame++) {
      assert.equal(g.state.mode & 63, 0);
      g.step([8, 8, 9, 1, 4, 2, 10, 8][((frame >> 7) + scenario) & 7] | 128 | (frame & 32 ? 64 : 0));
      assert.equal(g.radio ?? null, null);
      hash.update(Uint8Array.from(gameOutput(g)));
    }
    assert.equal(g.state.mode & 63, fixture.phase);
    assert.equal(hash.digest("hex"), fixture.sha256, `campaign position ${scenario}`);
  }
});
