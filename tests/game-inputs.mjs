import fs from "node:fs";
import { NativeGame } from "../src/game.js";
import { GAME_DATA } from "../src/game-data.js";
import { actorColumns } from "../src/actors.js";
export const readGameFixture = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
export function gameConfig() {
 const config = Object.fromEntries(Object.entries(GAME_DATA).map(([key, file]) =>
  [key, readGameFixture(`../data/${file}.json`)]));
 config.dispatch = readGameFixture("../data/handler-coverage.json").dispatch;
 return config;
}
export function gameScenario(config, scenario) {
 const g = new NativeGame(config, scenario >= 4 && scenario < 8 ? { state: { worldPage: [480, 430, 300, 256][scenario - 4] } } : {});
 if (scenario === 1) { g.state.resources = [40, 40, 40, 40, 24]; g.state.modifiers = 224; }
 if (scenario === 2) { g.state.resources = [40, 40, 40, 40, 24]; g.state.modifiers = 16; }
 if (scenario >= 4 && scenario < 8) {
  for (let slot = 2; slot < 10; slot++) Object.assign(g.actors[slot], {
   xLow: 40 + slot * 29 % 190, xHigh: 0, y: 20 + slot * 17 % 140,
   kind: [32, 33, 34, 36, 37, 38, 39, 56][slot - 2], appearance: 72,
   flags: 131, link: 131, heading: slot & 7, turnTarget: 255, timer: 15,
   projectileKind: 53, parameter2: 2, counter2: 5, scriptLow: 0, scriptHigh: 0,
   spawnMarker: 255, dropId: 127, deathEffect: 127,
  });
 }
 if (scenario >= 8) Object.assign(g.actors[2], {
  xLow: 116, xHigh: 0, y: 116, kind: 11, flags: 48 | (scenario === 11 ? 2 : 0),
  style: [128, 1, 0, 0][scenario - 8], counter: 255, counter2: 0, hitbox: 2,
  link: scenario === 11 ? 0 : 255, timer: 0, deathEffect: 127, dropId: 127,
  spawnMarker: 255, scriptHigh: 0, scriptLow: 0,
 });
 return g;
}
export function gameMask(scenario, frame) {
 return frame < 1700 ? (scenario === 3 ? (frame % 480 < 240 ? 8 : 1) : 8 | 128)
  : 128 | (frame % 240 < 120 ? 2 : 1);
}
export function gameOutput(g) {
 const s = g.state;
 return [
  ...[...g.actors, ...s.reservedActors].flatMap(a => actorColumns(a).flat()),
  ...g.cache.cells, ...s.layoutParts.slice(1).flatMap(p => [p.y, p.token, p.layer, p.x]),
  s.cameraLow, s.cameraHigh, s.cameraFineY, s.worldPage & 255, s.worldPage >> 8,
  s.seed, s.mode, s.scrollY, s.scrollX, s.playerScreenX, s.playerScreenEdge,
  s.frameCounter, s.patience, s.paletteSet, 128 + s.tileset * 4, s.materialPolicy,
  s.musicCommand, s.soundCommand, s.currentMusic,
  g.player.controls.held, g.player.controls.cannonRepeat, g.player.controls.machineRepeat,
  ...s.resources, s.reserveEnergy, s.equipment, s.modifiers,
  ...Array.from({ length: 3 }, (_, i) => s.score >> i * 8 & 255),
  ...Array.from({ length: 3 }, (_, i) => s.highScore >> i * 8 & 255),
 ];
}
