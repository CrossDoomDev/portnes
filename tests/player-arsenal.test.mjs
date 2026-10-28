import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { arsenalInputs, setupArsenal, arsenalOutput, runArsenal } from "./player-arsenal-inputs.mjs";
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const data = read("../data/actors.json"), equipment = read("../data/player-equipment.json"), fixtures = read("./player-arsenal-fixtures.json");
test("player weapons, resource costs, inventory toggles and pickups match 14336 original cases", () => {
 const next = arsenalInputs(fixtures.seed);
 for (const fixture of fixtures.routines) {
  const hash = createHash("sha256");
  for (let n = 0; n < fixture.cases; n++) {
   const input = next(n);
   if (fixture.name === "pickup") input.state.reserveEnergy %= 33;
   if (fixture.name === "consume") input.index = n % 5;
   if (fixture.name === "equipment") input.actors[7].dropId = n % 11;
   runArsenal(fixture.name, setupArsenal(data, equipment, input), input);
   hash.update(Uint8Array.from(arsenalOutput(input)));
  }
  assert.equal(hash.digest("hex"), fixture.sha256, fixture.name);
 }
});
