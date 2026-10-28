// JSNES button order: A, B, Select, Start, Up, Down, Left, Right.
export const BUTTON = Object.freeze({
  A: 0,
  B: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
});
export const KEY_MAP = Object.freeze({
  ArrowUp: 4,
  KeyW: 4,
  ArrowDown: 5,
  KeyS: 5,
  ArrowLeft: 6,
  KeyA: 6,
  ArrowRight: 7,
  KeyD: 7,
  KeyX: 0,
  KeyK: 0,
  KeyZ: 1,
  KeyJ: 1,
  ShiftLeft: 2,
  ShiftRight: 2,
  Tab: 2,
  Enter: 3,
});

// Each device owns its presses. Releasing a touch cannot cancel a held key.
export class InputBus {
  constructor(nes) {
    this.nes = nes;
    this.sources = new Map();
  }
  set(source, button, pressed) {
    const key = `${button}:${source}`;
    const wasDown = this.isDown(button);
    if (pressed) this.sources.set(key, button);
    else this.sources.delete(key);
    const down = this.isDown(button);
    if (down !== wasDown) this.nes[down ? "buttonDown" : "buttonUp"](1, button);
  }
  isDown(button) {
    for (const value of this.sources.values())
      if (value === button) return true;
    return false;
  }
  releaseAll() {
    this.sources.clear();
    for (let button = 0; button < 8; button++) this.nes.buttonUp(1, button);
  }
  pollGamepads(pads) {
    const states = new Array(8).fill(false);
    for (const pad of pads ?? []) {
      if (!pad?.connected || pad.mapping !== "standard") continue;
      const press = (index) => Boolean(pad.buttons[index]?.pressed);
      states[0] ||= press(0);
      states[1] ||= press(1);
      states[2] ||= press(8);
      states[3] ||= press(9);
      states[4] ||= press(12) || (pad.axes[1] ?? 0) < -0.5;
      states[5] ||= press(13) || (pad.axes[1] ?? 0) > 0.5;
      states[6] ||= press(14) || (pad.axes[0] ?? 0) < -0.5;
      states[7] ||= press(15) || (pad.axes[0] ?? 0) > 0.5;
    }
    for (let b = 0; b < 8; b++) this.set("gamepad", b, states[b]);
  }
}
