import { actorFromColumns, actorColumns } from "../src/actors.js";
import { bindSceneState } from "../src/scene-state.js";
import { createActorEffects } from "../src/actor-effects.js";
import { createPlayerEquipment } from "../src/player-equipment.js";
import { createPlayerWeapons } from "../src/player-weapons.js";
export function arsenalInputs(seed) {
 let value = seed;
 const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value >>> 24; };
 return n => {
  const actors = Array.from({ length: 32 }, (_, slot) => {
   const a = actorFromColumns(Array.from({ length: 3 }, () => Array.from({ length: 8 }, random)));
   if ((slot + n) % 4 !== 0) a.y = 255;
   return a;
  });
  actors[7].projectileKind = n % 11; actors[7].kind = n & 1 ? 5 : 4;
  const state = { resources: Array.from({ length: 5 }, random), reserveEnergy: random(), equipment: random(), modifiers: random(), blastState: random() };
  bindSceneState(state, actors.slice(30));
  actors[1].projectileKind = n & 1 ? 51 : 52;
  return { actors, state, index: n % 9, events: [] };
 };
}
export function setupArsenal(data, equipmentData, input) {
 const effects = createActorEffects(data, input.actors);
 const equipment = createPlayerEquipment(equipmentData, input.actors, input.state, {
  onSound: id => input.events.push(id), onMessage: id => input.events.push(id),
 });
 const weapons = createPlayerWeapons(input.actors, effects, input.state, equipment);
 return { equipment, weapons };
}
export function arsenalOutput(input) {
 return [...input.actors.flatMap(a => actorColumns(a).flat()), ...input.state.resources,
  input.state.reserveEnergy, input.state.equipment, input.state.modifiers, input.state.blastState,
  input.events.length, ...input.events];
}
export function runArsenal(name, api, input) {
 if (name === "cannon" || name === "machineGun") api.weapons[name]();
 else if (name === "pickup" || name === "equipment") api.equipment[name](0, 7);
 else if (name === "toggle") api.equipment.toggle(input.index);
 else if (name === "consumeShot") api.equipment.consumeShot();
 else api.equipment.consume(input.index);
}
