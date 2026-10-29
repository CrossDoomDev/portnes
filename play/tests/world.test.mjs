import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  WorldMap,
  actorCollisionFlags,
  createPlayerCollisionResolver,
} from "../src/world.js";
const world = new WorldMap(
  JSON.parse(fs.readFileSync(new URL("../data/world.json", import.meta.url))),
);
const fixtures = JSON.parse(
  fs.readFileSync(new URL("./world-fixtures.json", import.meta.url)),
);
test("all decoded map records are structurally complete", () => {
  assert.equal(world.data.pages.length, 512);
  assert.equal(world.width, 512);
  assert.equal(world.height, 122880);
  assert.equal(world.data.chunks.length, 122);
  assert.equal(world.data.collisionDefinitions.length, 27);
  for (const page of world.data.pages) {
    assert.equal(page.chunks.length, 2);
    for (const id of page.chunks) {
      const rows = world.chunks.get(id);
      assert.equal(rows.length, 15);
      for (const row of rows) assert.equal(row.length, 16);
    }
    assert.ok(world.collisions.has(`${page.tileset}:${page.materialPolicy}`));
  }
});
test("native map rows match samples captured from original F503", () => {
  for (const sample of fixtures.rows)
    for (let column = 0; column < 16; column++)
      assert.equal(
        world.at(column * 16, sample.page * 240 + sample.row * 16).metatile,
        sample.values[column],
      );
});
test("native8px collision values match original F443 captures", () => {
  for (const sample of fixtures.points) {
    const actual = world.at(sample.x, sample.y);
    assert.equal(actual.metatile, sample.metatile);
    assert.equal(actual.collision, sample.flags);
  }
});
test("native24px actor rectangles match original F27E captures", () => {
  for (const sample of fixtures.actors)
    assert.equal(
      actorCollisionFlags(world, sample.x, sample.y, sample.environmentPage),
      sample.flags,
    );
});
test("native player gate and flag updates match F18C/F1DC captures", () => {
  for (const sample of fixtures.resolvers) {
    const resolve = createPlayerCollisionResolver(world, () => ({
      page: sample.page,
      fineY: 0,
    }));
    assert.deepEqual(resolve(sample.state), sample.expected);
  }
});
