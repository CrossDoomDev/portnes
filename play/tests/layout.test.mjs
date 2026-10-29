import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorColumns } from "../src/actors.js";
import { createLayoutState } from "../src/layout-state.js";
import { arsenalInputs } from "./player-arsenal-inputs.mjs";
import { gameConfig, readGameFixture } from "./game-inputs.mjs";
const config = gameConfig();
test("logical layout, clipping, budget and offscreen flags reproduce 4096 original passes without drawing original graphics", () => {
 const fixture = readGameFixture("./layout-fixtures.json"), next = arsenalInputs(fixture.seed), hash = createHash("sha256");
 const valid = config.layout.entries.flatMap((value, i) => value ? [i] : []);
 for (let n = 0; n < fixture.cases; n++) {
  const input = next(n), s = input.state;
  Object.assign(s, { mode: n & 1 ? 128 : 0, cameraLow: n & 255, cameraHigh: n & 3,
   layoutParts: Array.from({ length: 64 }, (_, i) => ({ y: (n + i) & 255,
    token: (n + i * 7) & 255, layer: (n + i * 3) & 255, x: (n + i * 13) & 255 })) });
  for (let slot = 0; slot < 32; slot++) {
   const a = input.actors[slot];a.flags |= 128;
   a.appearance = valid[(n + slot * 7) % valid.length];a.xHigh = n & 1;
   if (n % 3 === 0) a.y = 64 + slot * 3;
  }
  createLayoutState(config.layout, input.actors, s).update(n & 255);
  hash.update(Uint8Array.from([...input.actors.flatMap(a => actorColumns(a).flat()),
   ...s.layoutParts.flatMap(p => [p.y, p.token, p.layer, p.x])]));
 }
 assert.equal(hash.digest("hex"), fixture.sha256);
});
