import test from "node:test";
import assert from "node:assert/strict";
import { bindSceneState } from "../src/scene-state.js";
import { actorFromColumns } from "../src/actors.js";
import { createActorHandlers } from "../src/actor-handlers.js";
const record = () =>
  actorFromColumns(Array.from({ length: 3 }, () => Array(8).fill(0)));
test("reserved scene records and named HUD/blast state remain linked in both directions", () => {
  const reserved = [record(), record()],
    state = bindSceneState(
      { blastState: 112, deadFlag: 255, healthSegments: 15, statusTimer: 51 },
      reserved,
    );
  assert.equal(reserved[0].scriptLow, 112);
  assert.equal(reserved[0].heading, 255);
  assert.equal(reserved[0].timer, 15);
  assert.equal(reserved[1].appearance, 51);
  reserved[0].scriptLow = 252;
  assert.equal(state.blastState, 252);
  state.statusTimer = 260;
  assert.equal(reserved[1].appearance, 4);
});
test("scene scans require reserved records instead of treating absent state as empty actors", () => {
  const actors = Array.from({ length: 30 }, record);
  for (const actor of actors) Object.assign(actor, { kind: 7, y: 255 });
  const { handlers } = createActorHandlers({}, {}, actors, {});
  assert.throws(
    () => handlers.da1a(actors[7], 7, 0),
    /Unported scene dependency: reserved actor 30/,
  );
});
