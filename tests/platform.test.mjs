import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { FrameClock, FRAME_MS, NTSC_FPS } from "../src/clock.js";
import { InputBus, BUTTON } from "../src/input.js";
import {
  validateCartridge,
  inspectCartridge,
  CARTRIDGE,
} from "../src/cartridge.js";
import { sha256Software } from "../src/sha256.js";

test("exact uploaded cartridge and MMC1 layout are preserved", async () => {
  const data = fs.readFileSync(
    new URL("../rom/iron-tank.nes", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(data).digest("hex"),
    CARTRIDGE.sha256,
  );
  assert.equal(sha256Software(data), CARTRIDGE.sha256);
  for (const text of ["", "abc", "Iron Tank", "a".repeat(1000)]) {
    const input = new TextEncoder().encode(text);
    assert.equal(
      sha256Software(input),
      createHash("sha256").update(input).digest("hex"),
    );
  }
  const cartridge = inspectCartridge(data);
  assert.equal(cartridge.mapper, 1);
  assert.equal(cartridge.prgBytes, 131072);
  assert.equal(cartridge.chrBytes, 131072);
  assert.deepEqual(await validateCartridge(data), data);
  const corrupt = Buffer.from(data);
  corrupt[100] ^= 1;
  await assert.rejects(validateCartridge(corrupt), /Контрольная сумма/);
  assert.throws(() => inspectCartridge(new Uint8Array(16)), /исходный файл/);
});

test("30, 60, 120 and 144 Hz displays execute the same NTSC frame count", () => {
  for (const refresh of [30, 60, 120, 144]) {
    const clock = new FrameClock();
    let frames = 0;
    clock.advance(0, () => frames++);
    for (let tick = 1; tick <= refresh * 10; tick++)
      clock.advance((tick * 1000) / refresh, () => frames++);
    assert.equal(frames, Math.floor(10 * NTSC_FPS), `display ${refresh} Hz`);
  }
});

test("background suspension does not run a burst of missed simulation", () => {
  const clock = new FrameClock();
  let count = 0;
  clock.advance(0, () => count++);
  clock.advance(60000, () => count++);
  assert.equal(count, 5);
  clock.reset();
  clock.advance(60000, () => count++);
  assert.equal(count, 5);
  clock.advance(60000 + FRAME_MS, () => count++);
  assert.equal(count, 6);
});

test("keyboard, touch and gamepad cannot release each other’s held buttons", () => {
  const calls = [],
    bus = new InputBus({
      buttonDown: (...args) => calls.push(["down", ...args]),
      buttonUp: (...args) => calls.push(["up", ...args]),
    });
  bus.set("keyboard", BUTTON.A, true);
  bus.set("touch", BUTTON.A, true);
  bus.set("touch", BUTTON.A, false);
  assert.deepEqual(calls, [["down", 1, BUTTON.A]]);
  bus.set("keyboard", BUTTON.A, false);
  assert.deepEqual(calls[1], ["up", 1, BUTTON.A]);
  bus.pollGamepads([
    { connected: true, mapping: "standard", axes: [-0.9, 0], buttons: [] },
  ]);
  assert.equal(bus.isDown(BUTTON.LEFT), true);
  bus.pollGamepads([]);
  assert.equal(bus.isDown(BUTTON.LEFT), false);
  bus.set("touch", BUTTON.UP, true);
  bus.releaseAll();
  assert.equal(bus.sources.size, 0);
});
