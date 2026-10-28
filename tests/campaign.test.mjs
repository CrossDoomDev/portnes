import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WorldMap } from "../src/world.js";
import { campaignInputs, setupCampaign, campaignOutput, runCampaign } from "./campaign-inputs.mjs";
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const data = read("../data/campaign.json"), world = new WorldMap(read("../data/world.json")), fixtures = read("./campaign-fixtures.json");
test("campaign routes, environment, music signals, radio and transition gates match 14336 original cases", () => {
 const next = campaignInputs(fixtures.seed);
 for (const fixture of fixtures.routines) {
  const hash = createHash("sha256");
  for (let n = 0; n < fixture.cases; n++) {
   const input = next(n);
   if (fixture.name === "route" && !input.selector) input.selector = 1;
   runCampaign(fixture.name, setupCampaign(data, world, input), input);
   hash.update(Uint8Array.from(campaignOutput(input)));
  }
  assert.equal(hash.digest("hex"), fixture.sha256, fixture.name);
 }
});
