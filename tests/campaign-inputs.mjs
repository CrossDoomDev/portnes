import { actorFromColumns, actorColumns } from "../src/actors.js";
import { bindSceneState } from "../src/scene-state.js";
import { createCampaign } from "../src/campaign.js";
export function campaignInputs(seed) {
 let value = seed;
 const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value >>> 24; };
 return n => {
  const actors = Array.from({ length: 32 }, (_, slot) => {
   const a = actorFromColumns(Array.from({ length: 3 }, () => Array.from({ length: 8 }, random)));
   if (slot > 1 && n % 3) a.y = 255;
   return a;
  });
  actors[0].kind = n & 1 ? 31 : 7;
  actors[7].style = [0, 1, 128][n % 3];actors[7].link = n % 5 === 4 ? 255 : n % 4;
  const state = { cameraLow: random(), cameraHigh: random(), cameraFineY: n % 240,
   worldPage: n % 512, mode: random(), equipment: random(), modifiers: random(),
   musicCommand: random(), currentMusic: n % 2 ? 26 : random(), soundCommand: n % 2 ? 26 : random(), audioBusy: random(),
   paletteSet: random() & 15, tileset: random() & 7, materialPolicy: random() & 15,
   statusTimer: random(), radioPhase: random(), radioTicks: random(), messageId: random(), messageState: random(),
   playerScreenX: random(), playerScreenEdge: random(),
   spriteAnchor: { x: (random() << 8) | random(), y: random(), marker: random() },
  };
  bindSceneState(state, actors.slice(30));
  return { actors, state, frame: n & 255, selector: n % 13, events: [] };
 };
}
export function setupCampaign(data, world, input) {
 return createCampaign(data, world, input.actors, input.state, {
  onSound: id => input.events.push([0, id]),
  reloadScene: () => input.events.push([1, 0]),
  spawnLayout: id => input.events.push([2, id]),
  changeMap: id => input.events.push([3, id]),
 });
}
export function campaignOutput(input) {
 const s = input.state, a = s.spriteAnchor;
 return [...input.actors.flatMap(a => actorColumns(a).flat()), s.cameraLow, s.cameraHigh,
  s.cameraFineY, s.worldPage & 255, s.worldPage >> 8, s.mode, s.equipment,
  s.modifiers, s.musicCommand, s.soundCommand, s.audioBusy, s.paletteSet,
  s.tileset, s.materialPolicy, s.playerScreenX, s.playerScreenEdge,
  a.x & 255, a.x >> 8, a.y, a.marker, input.events.length, ...input.events.flat()];
}
export function runCampaign(name, api, input) {
 if (name === "route") api.route(input.selector);
 else if (name === "updateRadio") api.updateRadio(input.frame);
 else if (name === "transition") api.transition(0, 7);
 else api[name]();
}
