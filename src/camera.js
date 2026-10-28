import { byte } from "./actors.js";

/** Common camera pass EE9C–EF30, row selection EF8D–EFC2 and F132–F176.
 * The scene coordinator supplies the environment/event pass at fineY=232.
 * worldPage retains the original 16-bit counter; WorldMap wraps its low 9 bits.
 */
export function createCameraSystem(world, cache, actors, state, operations = {}) {
  function loadHalf(half) {
    const page = world.page(state.worldPage),
      flag = page.descriptorFlags[half],
      row = state.cameraFineY >> 4;
    if (byte(state.cameraFineY + 24) === 0) {
      if (half === 0 && flag) {
        for (let slot = 2; slot < 17; slot++) {
          const actor = actors[slot];
          if (
            actor.kind >= 32 && actor.kind < 72 &&
            ![48, 49, 56].includes(actor.kind)
          ) {
            actor.kind = 63;
            actor.flags = (actor.flags & 240) | 3;
            actor.heading = 4;
          }
        }
      } else if (half === 1)
        state.equipment = (state.equipment & 239) | (flag << 4);
    }
    cache.loadRow(state.worldPage, half, row);
    operations.onRowLoaded?.({ page: state.worldPage & 511, half, row });
  }
  function anchors() {
    const reserved = actors.length >= 32 ? actors.slice(30, 32) : state.reservedActors;
    if (reserved?.length !== 2)
      throw Error("Camera requires two reserved scene records");
    const x = state.mode & 128
      ? 16
      : (((state.cameraHigh << 8) | state.cameraLow) + 16) & 65535;
    for (const actor of reserved) {
      actor.xLow = x & 255;
      actor.xHigh = x >> 8;
    }
  }
  function advance(horizontal, vertical) {
    const dx = byte(horizontal),
      x = ((state.cameraHigh << 8) | state.cameraLow) + (dx < 128 ? dx : dx - 256);
    state.cameraLow = x & 255;
    state.cameraHigh = (x >> 8) & 255;
    // EE9C reduces every negative request to -1; other values do not scroll Y.
    const dy = byte(vertical) & 128 ? -1 : 0;
    if (dy) {
      let delta = 255;
      if (byte(state.cameraFineY + delta) >= 240) delta ^= 16;
      const total = state.cameraFineY + delta;
      state.cameraFineY = byte(total);
      state.worldPage = (state.worldPage - 1 + (total > 255 ? 1 : 0)) & 65535;
      if ((byte(state.cameraFineY + 8) & 15) === 0) {
        state.cameraHigh &= 127;
        if (byte(state.cameraFineY + 24) === 0) {
          if (typeof operations.refreshEnvironment !== "function")
            throw Error("Unported camera dependency: refreshEnvironment");
          operations.refreshEnvironment(state);
        }
        loadHalf(0);
        state.cameraHigh |= 128;
        loadHalf(1);
      }
      for (let slot = 2; slot < 30; slot++)
        if (actors[slot].y !== 255) actors[slot].y = byte(actors[slot].y + 1);
    }
    anchors();
    return { dx: dx < 128 ? dx : dx - 256, dy };
  }
  return { advance };
}
