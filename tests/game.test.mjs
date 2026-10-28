import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import NES from "../vendor/jsnes/nes.js";
import { makeMaterialFrame } from "../src/materials.js";
import { validateSave, SAVE_VERSION } from "../src/storage.js";
import { CARTRIDGE } from "../src/cartridge.js";

const rom = fs.readFileSync(new URL("../rom/iron-tank.nes", import.meta.url));
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function makeGame() {
  let frame,
    audioHash = 0,
    audioCount = 0;
  const nes = new NES({
    sampleRate: 48000,
    onFrame: (value) => {
      frame = value;
    },
    onAudioSample: (l, r) => {
      audioHash = ((audioHash * 33) ^ ((l * 1e7) | 0) ^ ((r * 1e7) | 0)) | 0;
      audioCount++;
    },
  });
  nes.loadROM(rom);
  return { nes, frame: () => frame, audio: () => [audioHash, audioCount] };
}
function setButtons(nes, frame) {
  const down = new Set();
  if (frame >= 180 && frame < 184) down.add(3);
  if (frame >= 1450 && frame < 1650) down.add(4);
  if (frame >= 1650 && frame < 1700) {
    down.add(1);
    down.add(7);
  }
  if (frame >= 1700 && frame < 1800) {
    down.add(0);
    down.add(1);
  }
  if (frame >= 1850 && frame < 1853) down.add(2);
  if (frame >= 1920 && frame < 1923) down.add(2);
  for (let button = 0; button < 8; button++)
    nes[down.has(button) ? "buttonDown" : "buttonUp"](1, button);
}

test("new renderer leaves CPU, mapper, PPU and audio identical across title, briefing, landing, movement, fire and Select", () => {
  const original = makeGame(),
    newGraphics = makeGame();
  const target = new Uint8Array(245760),
    signatures = new Set();
  let changedPixels = 0;
  for (let frame = 0; frame < 2100; frame++) {
    setButtons(original.nes, frame);
    setButtons(newGraphics.nes, frame);
    original.nes.frame();
    newGraphics.nes.frame();
    if (frame % 7 === 0) {
      makeMaterialFrame(newGraphics.frame(), newGraphics.nes.ppu, target);
      assert.deepEqual(newGraphics.frame(), original.frame());
      if (frame > 1450) signatures.add(digest(Array.from(newGraphics.frame())));
      if (frame === 1505)
        for (let i = 0; i < 61440; i++) {
          if (
            target[i * 4] !== (original.frame()[i] & 255) ||
            target[i * 4 + 1] !== ((original.frame()[i] >> 8) & 255)
          )
            changedPixels++;
        }
    }
    if ([179, 500, 1400, 1650, 1870, 2099].includes(frame)) {
      assert.equal(
        digest(newGraphics.nes.toJSON()),
        digest(original.nes.toJSON()),
        `state diverged at frame ${frame}`,
      );
      assert.deepEqual(newGraphics.audio(), original.audio());
    }
  }
  assert.ok(changedPixels > 50000, `Only ${changedPixels} pixels changed`);
  assert.ok(signatures.size > 20, "Game did not animate");
  assert.ok(original.audio()[1] > 1000000, "APU did not generate audio");
});

test("save state resumes the same game and rejects another cartridge", () => {
  const game = makeGame();
  for (let frame = 0; frame < 1650; frame++) {
    setButtons(game.nes, frame);
    game.nes.frame();
  }
  const save = {
    version: SAVE_VERSION,
    romHash: CARTRIDGE.sha256,
    createdAt: "2026-10-28T12:00:00Z",
    frame: 1650,
    state: game.nes.toJSON(),
  };
  validateSave(save, CARTRIDGE.sha256);
  assert.throws(
    () => validateSave({ ...save, romHash: "different" }, CARTRIDGE.sha256),
    /Сохранение повреждено/,
  );
  const replay = makeGame();
  replay.nes.fromJSON(JSON.parse(JSON.stringify(save.state)));
  for (let frame = 1650; frame < 1800; frame++) {
    setButtons(game.nes, frame);
    setButtons(replay.nes, frame);
    game.nes.frame();
    replay.nes.frame();
  }
  assert.deepEqual(
    Array.from(replay.nes.cpu.mem),
    Array.from(game.nes.cpu.mem),
  );
  assert.deepEqual(replay.frame(), game.frame());
  assert.equal(replay.nes.cpu.REG_PC, game.nes.cpu.REG_PC);
});
