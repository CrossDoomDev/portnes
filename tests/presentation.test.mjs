import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NativeGame } from "../src/game.js";
import { encodePassword, decodePassword } from "../src/password.js";
import { NativeCutscene } from "../src/cutscene.js";
import { actorColumns, ACTOR_FIELDS, actorFromColumns } from "../src/actors.js";
import { gameConfig, gameOutput, readGameFixture } from "./game-inputs.mjs";
const config = gameConfig();

test("128 radio queues match 4736 original control polls, including pickup messages 252–255", () => {
  const fixture = readGameFixture("./radio-fixtures.json"), hash = createHash("sha256");
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 252, 253, 254, 255];
  for (let scenario = 0; scenario < fixture.cases; scenario++) {
    const g = new NativeGame(config), queue = Array(6).fill(255);
    for (let i = 0; i < scenario % 5 + 1; i++) queue[i] = ids[(scenario + i) % ids.length];
    queue.forEach((v, i) => { g.state.reservedActors[1][ACTOR_FIELDS[2][i]] = v; });
    g.openRadio("inventory");
    for (let tick = 0; g.radio; tick++) {
      const mask = tick >= 36 ? scenario & 1 ? 16 : 32 : tick % 7 < 3 ? 128 : tick % 7 === 4 ? 64 : 0;
      g.radioStep(mask);
      if (g.radio) hash.update(Uint8Array.from([g.radio.messages[g.radio.index],
        ...ACTOR_FIELDS[2].slice(0, 6).map(f => g.state.reservedActors[1][f]),
        g.player.controls.held, g.player.controls.cannonRepeat, g.player.controls.machineRepeat]));
    }
    assert.equal(g.state.messageId, 255);
  }
  assert.equal(hash.digest("hex"), fixture.sha256);
});

test("checkpoint reset matches 128 original resumes with every actor field populated", () => {
  const fixture = readGameFixture("./checkpoint-dirty-fixtures.json"), hash = createHash("sha256");
  for (let n = 0; n < fixture.cases; n++) {
    const g = new NativeGame(config, { state: { worldPage: n * 17 & 511, frameCounter: n } });
    g.state.mode = 6;
    g.state.resources = [n % 41, (n + 1) % 41, (n + 2) % 41, (n + 3) % 41, n % 25];
    g.state.reserveEnergy = n % 33; g.state.modifiers = n & 255;
    for (let slot = 0; slot < 32; slot++) Object.assign(slot < 30 ? g.actors[slot] : g.state.reservedActors[slot - 30],
      actorFromColumns(Array.from({ length: 3 }, (_, group) => Array.from({ length: 8 }, (_, field) =>
        (n * 17 + slot * 53 + group * 31 + field * 23) & 255))));
    g.step(0); hash.update(Uint8Array.from(gameOutput(g)));
  }
  assert.equal(hash.digest("hex"), fixture.sha256);
});

test("both intro choreographies match 886 original frames, actor motion and logical layout", () => {
  for (const fixture of readGameFixture("./cutscene-fixtures.json")) {
    const g = new NativeGame(config); g.presentation.clearSceneActors();
    const scene = new NativeCutscene(config.presentation.cutscenes[fixture.scene], g.actors, config.data, g.state,
      { sound: id => g.sound(id), layout: frame => g.layout.update(frame) });
    const hash = createHash("sha256");
    for (let n = 0; n < fixture.frames; n++) {
      assert.equal(scene.step(), false);
      // Actor 16's unused interpreter pointer/trampoline fields are replaced
      // by an action index; retain every actor/gameplay/layout field.
      const values = [...g.actors, ...g.state.reservedActors].flatMap((a, slot) =>
        actorColumns(a).flatMap((group, j) => group.filter((v, i) =>
          !(slot === 16 && j === 1 && [0, 1, 4, 5, 6].includes(i)))))
        .concat(g.state.layoutParts.slice(1).flatMap(p => [p.y, p.token, p.layer, p.x]),
          g.state.soundCommand, g.state.currentMusic);
      hash.update(Uint8Array.from(values));
    }
    assert.equal(scene.step(), true); assert.equal(hash.digest("hex"), fixture.sha256);
  }
});

test("field radio suspends before collision damage and restores the interrupted frame after closing", () => {
  const g = new NativeGame(config);
  const savedMessage = g.state.messageId;
  Object.assign(g.actors[2], { xLow: 116, xHigh: 0, y: 116, kind: 5,
    flags: 48, hitbox: 2, counter2: 0, projectileKind: 217,
    deathEffect: 127, dropId: 127, spawnMarker: 255 });
  // 217 + 47 wraps to radio message 8; equipment contacts use dropId.
  g.actors[2].kind = 27; g.actors[2].dropId = 217;
  g.step(0);
  assert.ok(g.radio); assert.ok(g.pendingFrame); assert.equal(g.actors[2].y, 116);
  assert.equal(g.radio.messages[0], 8);
  const actors = JSON.stringify(g.actors), clock = g.state.frameCounter;
  for (let n = 0; n < 20; n++) g.step(0);
  assert.equal(JSON.stringify(g.actors), actors); assert.notEqual(g.state.frameCounter, clock);
  g.step(128); assert.ok(g.radio); g.step(0); g.step(16);
  assert.equal(g.radio, null); assert.equal(g.pendingFrame, null);
  assert.equal(g.actors[2].y, 255); assert.equal(g.state.messageId, savedMessage);
  assert.equal(g.state.messageState, 255);
});

test("64 interrupted gameplay frames reproduce original state after 1280 radio polls", () => {
  const fixture = readGameFixture("./radio-game-fixtures.json"), hash = createHash("sha256");
  for (let scenario = 0; scenario < fixture.cases; scenario++) {
    const g = new NativeGame(config, { state: { frameCounter: scenario * 4 } });
    Object.assign(g.actors[2], { xLow: 116, xHigh: 0, y: 116, kind: 27, flags: 48,
      hitbox: 2, counter2: 0, dropId: 205 + scenario % 4, deathEffect: 127, spawnMarker: 255 });
    g.step(0);
    for (let poll = 0; g.radio; poll++) g.step(poll >= 19 ? scenario & 1 ? 16 : 32 : poll % 6 === 2 ? 128 : 0);
    hash.update(Uint8Array.from(gameOutput(g)));
  }
  assert.equal(hash.digest("hex"), fixture.sha256);
});

test("inventory radio cycles queued messages, clears the queue and returns to the inventory", () => {
  const g = new NativeGame(config);
  g.state.mode = 2; g.step(0); g.state.messageId = 2; g.state.messageState = 3;
  g.state.reservedActors[1].parameter2 = 255; g.state.statusTimer = 223;
  g.state.modifiers = 4; g.state.frameCounter = 1;
  g.step(0); assert.ok(g.radio); assert.equal(g.radio.messages.length, 2);
  g.step(128); assert.equal(g.radio.index, 1);
  g.step(0); g.step(32);
  assert.equal(g.radio, null); assert.equal(g.state.mode, 2);
  assert.equal(g.state.messageId, 255); assert.equal(g.state.statusTimer, 51);
  g.step(32); assert.equal(g.state.mode, 2);
  g.step(0); g.step(32); assert.equal(g.state.mode, 0);
});

test("passwords match all 512 original positions and 32768 original decode results", () => {
  const fixture = readGameFixture("./password-fixtures.json"), hash = createHash("sha256");
  fixture.encoded.forEach((text, page) => {
    assert.equal(encodePassword(page), text); assert.equal(decodePassword(text).page, page);
  });
  let seed = fixture.decoder.seed;
  for (let n = 0; n < fixture.decoder.cases; n++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const text = n < 512 ? fixture.encoded[n] : String(seed % 10000000).padStart(7, "0");
    const value = decodePassword(text);
    hash.update(Uint8Array.from([Number(value.valid), value.counter & 255, value.counter >> 8]));
  }
  assert.equal(hash.digest("hex"), fixture.decoder.sha256);
  assert.equal(decodePassword("abc").valid, false);
});

test("title starts the two intro sequences, then hands initialized actors to gameplay", () => {
  const g = new NativeGame(config, { startAtTitle: true });
  g.step(16); assert.equal(g.state.mode, 16);
  let frames = 0;
  while (g.state.mode && frames++ < 20000) g.step(0);
  assert.equal(g.state.mode, 0); assert.ok(frames > 100);
  assert.equal(g.actors[0].kind, 31); assert.equal(g.actors[0].counter2, 32);
  assert.equal(g.state.lives, 2); assert.deepEqual(g.state.resources, [0, 0, 0, 0, 0]);
});

test("death consumes attempts, waits before checkpoint, and offers continue after the last attempt", () => {
  const g = new NativeGame(config);
  for (let death = 0; death < 3; death++) {
    g.state.mode = 7; g.step(0);
    if (death < 2) {
      assert.equal(g.presentation.kind, "retry"); assert.equal(g.state.lives, 1 - death);
      g.step(128); assert.equal(g.state.mode, 6);
      g.step(0); assert.equal(g.state.mode, 0);
    } else {
      assert.equal(g.presentation.kind, "gameover"); assert.equal(g.state.lives, 2);
      assert.equal(decodePassword(g.presentation.password).valid, true);
      g.state.score = 123; g.state.resources[0] = 7;
      g.step(16); assert.equal(g.state.mode, 6);
      assert.equal(g.presentation.kind, "decision");
      for (let n = 0; n < 120; n++) g.step(0);
      g.step(0); assert.equal(g.state.score, 0); assert.equal(g.state.resources[0], 7);
    }
  }
});

test("password entry resets stocks and uses the original checkpoint selector", () => {
  const g = new NativeGame(config, { startAtTitle: true });
  g.step(32); g.step(0); g.step(16); g.step(0);
  assert.equal(g.state.mode, 20); assert.equal(g.presentation.kind, "password");
  g.state.resources[0] = 40;
  assert.equal(g.presentation.submitPassword("0000000"), false);
  assert.equal(g.presentation.kind, "passwordError");
  for (let n = 0; n < 119; n++) g.step(0);
  assert.equal(g.state.mode, 20); g.step(0); assert.equal(g.state.mode, 4);
  g.step(0); g.state.mode = 20; g.step(0);
  assert.equal(g.presentation.submitPassword(encodePassword(430)), true);
  g.step(0);
  assert.equal(g.state.mode, 0); assert.equal(g.state.resources[0], 0);
  assert.ok(g.events.some(e => e.type === "checkpoint"));
});

test("title idle story can be interrupted; ending runs its complete caption and credit sequence", () => {
  const g = new NativeGame(config, { startAtTitle: true });
  for (let n = 0; n < 1100 && g.state.mode === 4; n++) g.step(0);
  assert.equal(g.state.mode, 8); g.step(0);
  g.step(128); assert.equal(g.state.mode, 8); // skips only the preface
  g.step(0); g.step(128); assert.equal(g.state.mode, 4);
  g.state.mode = 12;
  const captions = new Set();
  for (let n = 0; n < 30000 && g.presentation.kind !== "finished"; n++) {
    g.step(0); if (g.presentation.caption.length) captions.add(g.presentation.caption.join("\n"));
  }
  assert.equal(g.presentation.kind, "finished"); assert.ok(captions.size >= 10);
  assert.equal(g.state.mode, 12);
});
