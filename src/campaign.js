import { byte } from "./actors.js";

/** Decoded route events, environment/music selection and radio countdowns.
 * Routes preserve the full counter and XOR both world/camera actor layers.
 */
export function createCampaign(data, world, actors, state, operations = {}) {
  if (data?.schema !== 1) throw Error("Unsupported campaign schema");
  const metadata = () => data.pages[state.worldPage & 511];
  const sound = (id) => { state.soundCommand = id; operations.onSound?.(id); };
  function route(selector) {
    if (!selector) return;
    const choices = data.warps[selector - 1];
    if (!choices) throw Error(`Unknown campaign route ${selector}`);
    const target = choices[actors[0].xHigh & 1];
    if (target.page) state.worldPage = target.counter;
    state.cameraHigh ^= target.xorXHigh;
    for (let slot = 0; slot < 30; slot++) actors[slot].xHigh ^= target.xorXHigh;
    operations.onRoute?.({ selector, page: state.worldPage & 511 });
  }
  function music() {
    const command = data.music[metadata().musicProfile];
    if (((state.musicCommand ^ command) & 127) === 0) return;
    state.musicCommand = (command | (state.currentMusic === 26 ? 128 : 0)) & 159;
  }
  function radio() {
    if (!(metadata().routeFlags & 128)) return;
    const trigger = data.radio.find(value => value.page === (state.worldPage & 511));
    const id = trigger?.messages[actors[0].xHigh & 1];
    if (!id) return;
    state.messageId = id;
    state.statusTimer = 223;
    state.radioPhase = 3;
    state.messageState = 255;
    operations.onRadio?.(id);
  }
  function refreshEnvironment() {
    state.paletteSet = world.page(state.worldPage).paletteSet;
    route(world.page(state.worldPage).eventSelector);
    const page = world.page(state.worldPage);
    state.environmentPage = state.worldPage & 511;
    state.tileset = page.tileset;
    state.materialPolicy = page.materialPolicy;
    music();
    radio();
    operations.onEnvironment?.(state.environmentPage);
  }
  function sync() {
    const page = metadata();
    state.mode = (state.mode & 127) | ((page.routeFlags & 64) << 1);
    state.mode = (state.mode & 191) | page.scrollLock;
    if (!state.musicCommand) return;
    if (!(state.musicCommand & 128)) {
      state.musicCommand |= 128;
      sound(state.musicCommand & 127);
    } else if (!(state.audioBusy & 128)) sound(state.musicCommand & 127);
  }
  function updateRadio(frame) {
    if (state.statusTimer === 51) return;
    if (!(frame & 63) && actors[0].kind === 31) sound(65);
    state.statusTimer = 223;
    state.radioTicks = byte(state.radioTicks - 1);
    if (!state.radioTicks) {
      state.radioPhase = byte(state.radioPhase - 1);
      if (!state.radioPhase) state.statusTimer = 51;
    }
  }
  function transition(sourceSlot, targetSlot) {
    const source = actors[sourceSlot], target = actors[targetSlot];
    if (target.flags & 1) {
      for (let slot = 2; slot < 17; slot++)
        if (slot !== targetSlot && actors[slot].kind !== 64 && actors[slot].y !== 255) return false;
    }
    state.worldPage = (state.worldPage + (target.counter < 128 ? target.counter : target.counter - 256)) & 65535;
    if (target.style & 128) refreshEnvironment();
    else if (target.style & 1) {
      state.spriteAnchor = { x: 63736, y: 248, marker: 248 };
      operations.reloadScene();
      operations.onSceneFade?.();
      music();
    } else if (!(target.flags & 2)) {
      state.spriteAnchor = { x: 63736, y: 248, marker: 248 };
      operations.reloadScene();
      target.y = 0;
      return true;
    } else {
      const layout = target.link;
      state.paletteSet = 18;
      state.cameraFineY = state.cameraLow = state.cameraHigh = state.blastState = 0;
      for (let slot = 0; slot < 2; slot++) Object.assign(actors[slot], { xLow: 116, xHigh: 0, y: 168 });
      state.playerScreenX = 116;
      state.playerScreenEdge = 117;
      state.spriteAnchor = { x: 63736, y: 248, marker: 248 };
      operations.reloadScene();
      operations.onSceneFade?.();
      music();
      target.y = 0;
      state.blastState = 0;
      state.cameraFineY = state.cameraLow = state.cameraHigh = 0;
      if (layout !== 255) { operations.spawnLayout(layout); operations.changeMap(layout); }
      target.y = 255;
      operations.onArena?.(layout);
      return true;
    }
    target.y = 0;
    state.blastState = 0;
    return true;
  }
  return { route, refreshEnvironment, music, radio, sync, updateRadio, transition };
}
