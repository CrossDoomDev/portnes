/** Native source translation of original control routines EDEA-EE5D and
 * CE70-CF5B. No ROM, CPU, PPU, opcodes, dispatch interpreter or emulation.
 * Collision flags/projectiles/camera are explicit external game subsystems.
 */
export const INPUT = Object.freeze({
  A: 128,
  B: 64,
  SELECT: 32,
  START: 16,
  UP: 8,
  DOWN: 4,
  LEFT: 2,
  RIGHT: 1,
});
const TARGET = [255, 4, 12, 255, 8, 6, 10, 8, 0, 2, 14, 0, 255, 4, 12, 255];
const TURN = [0, -1, -1, -1, -1, 1, 1, 1];
export class OriginalControls {
  constructor({ held = 0, cannonRepeat = 0, machineRepeat = 0 } = {}) {
    Object.assign(this, { held, cannonRepeat, machineRepeat });
  }
  sample(mask) {
    mask &= 255;
    let triggered = ~this.held & mask & 255;
    if (triggered & INPUT.A) this.cannonRepeat = 0;
    if (triggered & INPUT.B) this.machineRepeat = 0;
    if (mask & INPUT.A) {
      this.cannonRepeat = (this.cannonRepeat + 1) & 255;
      if ((this.cannonRepeat & 15) === 0) triggered |= INPUT.A;
    }
    if (mask & INPUT.B) {
      this.machineRepeat = (this.machineRepeat + 1) & 255;
      if ((this.machineRepeat & 7) === 0) triggered |= INPUT.B;
    }
    this.held = mask;
    return {
      held: mask,
      triggered,
      target: TARGET[mask & 15],
      startPressed: Boolean(triggered & INPUT.START),
      selectPressed: Boolean(triggered & INPUT.SELECT),
    };
  }
}
export function turnDelta(direction, targetDoubled) {
  return TURN[(direction - (targetDoubled >> 1)) & 7];
}
export function turnToward(direction, targetDoubled) {
  return (direction + turnDelta(direction, targetDoubled)) & 7;
}
const MOVING_DIAGONAL = [true, true, false, true, true, true, false, true];
const VECTOR = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
export function playerVelocity(direction, phase) {
  const d = direction & 7;
  return d % 2 && !MOVING_DIAGONAL[phase & 7]
    ? { dx: 0, dy: 0 }
    : { dx: VECTOR[d][0], dy: VECTOR[d][1] };
}

export class NativePlayer {
  constructor(state = {}, callbacks = {}) {
    const { controls, ...playerState } = state;
    this.state = {
      x: 116,
      y: 116,
      hullDirection: 0,
      turretDirection: 0,
      phase: 0,
      recoil: 0,
      patience: 20,
      collisionFlags: 0,
      ...playerState,
    };
    this.controls = new OriginalControls(controls);
    this.callbacks = callbacks;
  }
  #collision(direction, phase, probe = false, stationary = false) {
    const velocity = stationary
      ? { dx: 0, dy: 0 }
      : playerVelocity(direction, phase);
    const result = this.callbacks.resolveCollision?.({
      ...this.state,
      ...velocity,
      direction,
      probe,
      forced: stationary,
    }) ?? { flags: 0, ...velocity };
    const flags = result.flags ?? 0;
    this.state.collisionFlags = flags;
    return {
      flags,
      dx: result.dx ?? (flags & 127 ? 0 : velocity.dx),
      dy: result.dy ?? (flags & 127 ? 0 : velocity.dy),
    };
  }
  #findPassage() {
    const original = this.state.hullDirection;
    for (const direction of [
      original,
      (original - 1) & 7,
      (original + 1) & 7,
    ]) {
      this.state.hullDirection = direction;
      const collision = this.#collision(direction, 0, true);
      if ((collision.flags & 127) === 0) return false;
    }
    this.state.hullDirection = original;
    const still = this.#collision(original, 0, true, true);
    if (still.flags & 127) this.callbacks.onCrushed?.(this.state);
    return true;
  }
  step(mask) {
    const s = this.state,
      input = this.controls.sample(mask),
      events = [];
    if (input.triggered & INPUT.A) {
      const spawned = Boolean(this.callbacks.onCannon?.({ ...s }));
      events.push({ type: "cannon", spawned, direction: s.turretDirection });
      if (spawned) s.recoil = 16;
    }
    if (input.triggered & INPUT.B) {
      this.callbacks.onMachineGun?.({ ...s });
      events.push({ type: "machineGun", direction: s.hullDirection });
    }
    if (s.recoil) s.recoil = (s.recoil - 1) & 255;
    if (input.target === 255) return { ...input, events, dx: 0, dy: 0 };
    if (input.triggered & INPUT.B)
      s.turretDirection = turnToward(s.turretDirection, input.target);
    let requested = input.target;
    if (turnDelta(s.hullDirection, requested) !== 0) {
      const original = s.hullDirection;
      s.hullDirection = requested >> 1;
      const blocked = this.#findPassage();
      requested = s.hullDirection * 2;
      s.hullDirection = original;
      if (blocked) {
        s.patience = (s.patience - 1) & 255;
        if (s.patience === 0) {
          s.patience = 1;
          s.phase = (s.phase - 1) & 255;
          if ((s.phase & 3) === 0)
            s.hullDirection = turnToward(s.hullDirection, requested);
          return { ...input, events, dx: 0, dy: 0 };
        }
      } else {
        s.patience = 20;
        if (turnDelta(s.hullDirection, requested) !== 0) {
          s.phase = (s.phase - 1) & 255;
          if ((s.phase & 3) === 0)
            s.hullDirection = turnToward(s.hullDirection, requested);
          return { ...input, events, dx: 0, dy: 0 };
        }
      }
    }
    s.phase = (s.phase - 1) & 255;
    if (this.#findPassage()) return { ...input, events, dx: 0, dy: 0 };
    const movement = this.#collision(s.hullDirection, s.phase);
    if (this.callbacks.applyMove) this.callbacks.applyMove(s, movement);
    else {
      s.x = (s.x + movement.dx) & 65535;
      s.y = (s.y + movement.dy) & 255;
    }
    return { ...input, events, dx: movement.dx, dy: movement.dy };
  }
  snapshot() {
    return {
      ...this.state,
      controls: {
        held: this.controls.held,
        cannonRepeat: this.controls.cannonRepeat,
        machineRepeat: this.controls.machineRepeat,
      },
    };
  }
}
