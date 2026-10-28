import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { actorColumns, actorFromColumns } from "../src/actors.js";
import { createActorHandlers } from "../src/actor-handlers.js";
import { createActorEffects } from "../src/actor-effects.js";
import { createActorWeapons } from "../src/actor-weapons.js";
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const aiming = read("../data/aiming.json"),
  data = read("../data/actors.json"),
  fixture = read("./combat-fixtures.json"),
  turrets = read("../data/turrets.json");
const hash = (bytes) =>
  createHash("sha256").update(Uint8Array.from(bytes)).digest("hex");
function inputs() {
  let seed = fixture.seed;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  return function setup(iteration) {
    const actors = Array.from({ length: 30 }, () => {
      const a = actorFromColumns(
        Array.from({ length: 3 }, () => Array.from({ length: 8 }, rand)),
      );
      a.y = iteration % 3 === 0 ? 255 : a.y % 232;
      a.flags = (a.flags & 240) | a.flags % 15;
      a.heading &= 15;
      a.deathEffect = 0;
      a.dropId = 127;
      a.spawnMarker = 255;
      a.kind &= 127;
      a.projectileKind = [48, 53, 56, 58, 59, 26, 172, 95][
        a.projectileKind & 7
      ];
      return a;
    });
    const actor = actors[7];
    actor.y = [0, 100, 231, 240][iteration & 3];
    actor.xHigh = [0, 1, 128, 255][iteration & 3];
    actor.timer =
      iteration < 8
        ? [0, 1, 15, 16, 31, 127, 208, 255][iteration]
        : actor.timer;
    actor.parameter2 &= 31;
    actor.counter %= 14;
    actor.link = 0;
    actor.rangeThreshold = iteration % 8;
    if (iteration % 4 === 0) {
      actor.y = 100;
      actor.xHigh = 0;
    }
    const frame = rand(),
      contact = rand(),
      hits = rand() & 1 ? 255 : 0,
      state = { modifiers: rand(), equipment: rand(), blastState: rand() };
    const effects = createActorEffects(data, actors),
      weapons = createActorWeapons(actors, effects, aiming, state);
    const operations = {
      resolveContact(a, s, delta) {
        a.contactFlags = contact;
        if ((contact << 1) & 255) {
          delta.dx = 0;
          delta.dy = 0;
        }
      },
      sampleContact(a) {
        a.contactFlags = contact;
      },
      takeHits() {
        return hits;
      },
      fire: weapons.fire,
    };
    return { actors, actor, frame, state, operations, weapons };
  };
}
test("native actor handlers and eight weapon branches match isolated original routines", () => {
  const setup = inputs();
  const currentHandlers = createActorHandlers(
    data,
    aiming,
    [],
    {},
    {},
  ).handlers;
  for (const entry of fixture.entries)
    assert.equal(typeof currentHandlers[entry], "function");
  for (const expected of fixture.handlers) {
    const output = [];
    for (let n = 0; n < expected.cases; n++) {
      const f = setup(n);
      if (expected.entry === "e6bb") f.actor.timer = n % 208;
      if (["d170", "d1a1", "d1b9", "d0f2"].includes(expected.entry))
        f.actor.link = [0, 1, 2, 7, 14][n % 5];
      const { handlers } = createActorHandlers(
        data,
        aiming,
        f.actors,
        f.state,
        f.operations,
        turrets,
      );
      handlers[expected.entry](f.actor, 7, f.frame);
      output.push(
        ...f.actors.flatMap((a) => actorColumns(a).flat()),
        f.state.blastState,
      );
    }
    assert.equal(hash(output), expected.sha256, `handler ${expected.entry}`);
  }
  for (const expected of fixture.weapons) {
    const output = [];
    for (let n = 0; n < expected.cases; n++) {
      const f = setup(n);
      f.actor.projectileKind = expected.prototype;
      f.actor.appearance = n & 1 ? 112 : 48;
      for (let slot = 17; slot < 26; slot++)
        f.actors[slot].y = slot - 17 < n % 10 ? 255 : 100;
      const result = f.weapons.fire(f.actor, 7, f.frame);
      output.push(
        ...f.actors.flatMap((a) => actorColumns(a).flat()),
        result >= 0 ? 1 : 0,
        result >= 0 ? result + 1 : 0,
      );
    }
    assert.equal(hash(output), expected.sha256, `weapon ${expected.prototype}`);
  }
});
test("missing map and collision dependencies fail explicitly", () => {
  const actors = Array.from({ length: 30 }, () =>
    actorFromColumns(Array.from({ length: 3 }, () => Array(8).fill(0))),
  );
  const { handlers, effects } = createActorHandlers(data, aiming, actors, {});
  assert.throws(
    () => handlers.d0c7(actors[0], 0),
    /Unported actor dependency: resolveContact/,
  );
  assert.throws(
    () => effects.destroy(0),
    /Unported destruction dependency: changeMap/,
  );
});
