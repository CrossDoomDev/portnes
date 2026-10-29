import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorColumns } from "../src/actors.js";
import { createActorHandlers } from "../src/actor-handlers.js";
import { inputStream, nativeOperations } from "./locomotion-inputs.mjs";
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url))),
  data = read("../data/actors.json"),
  aiming = read("../data/aiming.json"),
  turrets = read("../data/turrets.json"),
  fixtures = read("./locomotion-fixtures.json");
const hash = (bytes) =>
  createHash("sha256").update(Uint8Array.from(bytes)).digest("hex");
test("native passage, movement, turning, pause and turn-choice helpers reproduce isolated original outputs", () => {
  const next = inputStream(fixtures.seed);
  for (const fixture of fixtures.helpers) {
    const output = [];
    for (let n = 0; n < fixture.cases; n++) {
      const input = next(n),
        operations = nativeOperations(input),
        { locomotion } = createActorHandlers(
          data,
          aiming,
          input.actors,
          input.state,
          operations,
          turrets,
        );
      let result;
      if (fixture.name === "probe" || fixture.name === "longProbe")
        result = locomotion.probe(input.actor, 7, fixture.name === "longProbe");
      else if (fixture.name === "chooseTurn")
        result = locomotion.chooseTurn(input.actor, 7, input.frame);
      else result = locomotion[fixture.name](input.actor, 7);
      output.push(
        ...input.actors.flatMap((a) => actorColumns(a).flat()),
        input.state.seed,
        operations.count,
        ...(fixture.name === "probe" || fixture.name === "longProbe"
          ? [Number(result)]
          : []),
      );
    }
    assert.equal(hash(output), fixture.sha256, fixture.name);
  }
});
test("ten native enemy movement handlers reproduce 1,024 original cases each", () => {
  const next = inputStream(fixtures.seed);
  // Helpers and handlers were recorded in one deterministic input stream.
  for (const fixture of fixtures.helpers)
    for (let n = 0; n < fixture.cases; n++) next(n);
  for (const fixture of fixtures.handlers) {
    const output = [];
    for (let n = 0; n < fixture.cases; n++) {
      const input = next(n, fixture.kind),
        operations = nativeOperations(input),
        { handlers } = createActorHandlers(
          data,
          aiming,
          input.actors,
          input.state,
          operations,
          turrets,
        );
      handlers[fixture.entry](input.actor, 7, input.frame);
      output.push(
        ...input.actors.flatMap((a) => actorColumns(a).flat()),
        input.state.seed,
        operations.count,
      );
    }
    assert.equal(hash(output), fixture.sha256, fixture.entry);
  }
});
test("native pathfinding requires an explicit random call-context provider", () => {
  const input = inputStream(1)(0),
    { locomotion } = createActorHandlers(
      data,
      aiming,
      input.actors,
      input.state,
    );
  assert.throws(
    () => locomotion.chooseTurn(input.actor, 7, 0),
    /Unported locomotion dependency: random/,
  );
});
