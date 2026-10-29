import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  NativePlayer,
  OriginalControls,
  playerVelocity,
  turnToward,
} from "../src/player.js";
const fixture = JSON.parse(
  fs.readFileSync(new URL("./player-oracle-fixtures.json", import.meta.url)),
);
test("native input polling agrees with 3000 original-program samples", () => {
  const controller = new OriginalControls(),
    hash = createHash("sha256");
  const checkpoints = new Map(
    fixture.input.checkpoints.map(({ tick, ...state }) => [tick, state]),
  );
  fixture.input.masks.forEach((mask, tick) => {
    const result = controller.sample(mask);
    const state = {
      held: result.held,
      triggered: result.triggered,
      target: result.target,
      cannonRepeat: controller.cannonRepeat,
      machineRepeat: controller.machineRepeat,
    };
    hash.update(JSON.stringify(state));
    if (checkpoints.has(tick))
      assert.deepEqual(state, checkpoints.get(tick), `input frame ${tick}`);
  });
  assert.equal(hash.digest("hex"), fixture.input.digest);
});
test("native player control agrees with 3200 original-program callback-isolated steps", () => {
  for (const [scenario, recording] of fixture.players.entries()) {
    const player = new NativePlayer(recording.initial, {
      onCannon: () => false,
      resolveCollision: ({ x, y, dx, dy }) => {
        const flags =
          recording.obstacles === "bounds" && (x + dx > 124 || y + dy < 108)
            ? 129
            : 0;
        return { flags, dx: flags ? 0 : dx, dy: flags ? 0 : dy };
      },
    });
    const hash = createHash("sha256"),
      checkpoints = new Map(
        recording.checkpoints.map(({ tick, ...state }) => [tick, state]),
      );
    recording.masks.forEach((mask, tick) => {
      player.step(mask);
      hash.update(JSON.stringify(player.state));
      if (checkpoints.has(tick))
        assert.deepEqual(
          player.state,
          checkpoints.get(tick),
          `scenario ${scenario}, step ${tick}`,
        );
    });
    assert.equal(hash.digest("hex"), recording.digest, `scenario ${scenario}`);
  }
});
test("eight-direction phase vectors retain original diagonal cadence", () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, phase) => playerVelocity(1, phase)),
    [
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 0, dy: 0 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 0, dy: 0 },
      { dx: 1, dy: -1 },
    ],
  );
  assert.equal(
    turnToward(0, 8),
    7,
    "opposite target chooses counterclockwise turn",
  );
});
