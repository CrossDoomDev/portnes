import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { originalRandom } from "../src/random.js";
const fixtures = JSON.parse(
  fs.readFileSync(new URL("./random-fixtures.json", import.meta.url)),
);
test("original random arithmetic agrees with 128 independently recorded cases", () => {
  for (const entry of fixtures)
    assert.equal(
      originalRandom(entry.seed, entry.frameCountdown, entry.contextBytes),
      entry.expected,
    );
});
test("random helper requires explicit call-context data rather than inventing a replacement sequence", () => {
  assert.throws(() => originalRandom(1, 2, []), /eight/);
});
