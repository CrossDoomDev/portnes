import { byte } from "./actors.js";

/** E1B9–E250. Player projectile pools and modifier application order. */
export function createPlayerWeapons(actors, effects, state, equipment, operations = {}) {
  function cannon() {
    if (state.modifiers & 1) return -1;
    if (state.modifiers & 16) {
      const slot = effects.spawnFromActor(0, 208, 1, 47);
      if (slot < 0) return -1;
      equipment.consumeShot();
      let blast = byte(state.blastState + 32);
      if (blast & 128) blast = (blast & 127) | 124;
      state.blastState = blast;
      operations.onPlayerShot?.("blast", slot);
      return slot;
    }
    const slot = effects.spawnFromActor(0, 208, state.equipment & 1 ? 3 : 1,
      48 + ((state.modifiers >> 7) & 1));
    if (slot < 0) return -1;
    const shot = actors[slot];
    if (state.modifiers & 64) { shot.style |= 7; shot.dropId = 50; }
    if (state.modifiers & 32) shot.timer = byte(shot.timer + 16);
    equipment.consumeShot();
    operations.onPlayerShot?.("cannon", slot);
    return slot;
  }
  function machineGun() {
    const slot = effects.spawnFromActor(1, 232, 1, actors[1].projectileKind);
    if (slot >= 0) operations.onPlayerShot?.("machineGun", slot);
    return slot;
  }
  return { cannon, machineGun };
}
