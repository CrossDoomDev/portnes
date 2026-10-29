import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorColumns } from "../src/actors.js";
import { createActorHandlers } from "../src/actor-handlers.js";
import {
  bossInputs,
  bossOperations,
  bossOutput,
  configureBossHelper,
} from "./boss-inputs.mjs";
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url))),
  data = read("../data/actors.json"),
  aiming = read("../data/aiming.json"),
  turrets = read("../data/turrets.json"),
  emplacements = read("../data/emplacements.json"),
  bosses = read("../data/bosses.json"),
  fixtures = read("./boss-fixtures.json");
const hash = (values) =>
  createHash("sha256").update(Uint8Array.from(values)).digest("hex");
function helpers(next) {
  for (const fixture of fixtures.helpers) {
    const output = [];
    for (let n = 0; n < fixture.cases; n++) {
      const input = configureBossHelper(next(n, "d537", 16), fixture.name, n),
        operations = bossOperations(input),
        { scene } = createActorHandlers(
          data,
          aiming,
          input.actors,
          input.state,
          operations,
          turrets,
          emplacements,
          bosses,
        );
      const name = fixture.name;
      if (name === "orbit") input.actor.counter = 1;
      if (name === "arenaCamera") scene.arenaCamera(input.actor, 7, 105, 79);
      else if (name === "spawnLayout") scene.spawnLayout(n % 4);
      else if (name === "pose") scene.pose(input.actor, input.frame);
      else if (name === "poseShot") scene.poseShot(input.actor, 7, input.frame);
      else scene[name](input.actor, 7);
      output.push(
        ...input.actors.flatMap((a) => actorColumns(a).flat()),
        ...bossOutput(input, operations),
      );
    }
    assert.equal(hash(output), fixture.sha256, fixture.name);
  }
}
test("seven native boss scene helpers reproduce 512 original cases each", () =>
  helpers(bossInputs(fixtures.seed)));
test("all sixteen remaining actor handlers reproduce 1,024 original cases each", () => {
  const next = bossInputs(fixtures.seed);
  for (const fixture of fixtures.helpers)
    for (let n = 0; n < fixture.cases; n++) next(n, "d537", 16);
  for (const fixture of fixtures.handlers) {
    const output = [];
    for (let n = 0; n < fixture.cases; n++) {
      const input = next(n, fixture.entry, fixture.kind),
        operations = bossOperations(input),
        { handlers } = createActorHandlers(
          data,
          aiming,
          input.actors,
          input.state,
          operations,
          turrets,
          emplacements,
          bosses,
        );
      handlers[fixture.entry](input.actor, 7, input.frame);
      output.push(
        ...input.actors.flatMap((a) => actorColumns(a).flat()),
        ...bossOutput(input, operations),
      );
    }
    assert.equal(hash(output), fixture.sha256, fixture.entry);
  }
});
