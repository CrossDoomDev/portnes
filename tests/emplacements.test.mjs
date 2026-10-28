import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createActorHandlers } from "../src/actor-handlers.js";
import { actorColumns } from "../src/actors.js";
import { inputStream } from "./locomotion-inputs.mjs";
import {
  configureEmplacement,
  emplacementOperations,
} from "./emplacement-inputs.mjs";
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url))),
  data = read("../data/actors.json"),
  aiming = read("../data/aiming.json"),
  turrets = read("../data/turrets.json"),
  emplacements = read("../data/emplacements.json"),
  fixtures = read("./emplacement-fixtures.json");
test("eleven emplacement, special projectile and linked actor handlers reproduce original routines", () => {
  const next = inputStream(fixtures.seed);
  for (const fixture of fixtures.handlers) {
    const output = [];
    for (let n = 0; n < fixture.cases; n++) {
      const input = configureEmplacement(
          next(n, fixture.kind),
          n,
          fixture.entry,
        ),
        { handlers } = createActorHandlers(
          data,
          aiming,
          input.actors,
          input.state,
          emplacementOperations(input),
          turrets,
          emplacements,
        );
      handlers[fixture.entry](input.actor, 7, input.frame);
      output.push(
        ...input.actors.flatMap((a) => actorColumns(a).flat()),
        input.state.mode,
        input.state.musicCommand,
      );
    }
    assert.equal(
      createHash("sha256").update(Uint8Array.from(output)).digest("hex"),
      fixture.sha256,
      fixture.entry,
    );
  }
});
