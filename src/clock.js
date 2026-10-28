// NTSC timing. Display refresh rate never changes the simulation rate.
export const NTSC_FPS = 60.0988138974405;
export const FRAME_MS = 1000 / NTSC_FPS;

export class FrameClock {
  constructor() {
    this.reset();
  }
  reset() {
    this.previous = null;
    this.accumulator = 0;
  }
  advance(now, step) {
    if (this.previous === null) {
      this.previous = now;
      return 0;
    }
    const elapsed = Math.max(0, Math.min(100, now - this.previous));
    this.previous = now;
    this.accumulator += elapsed;
    let frames = 0;
    while (this.accumulator + 1e-7 >= FRAME_MS && frames < 5) {
      step();
      this.accumulator -= FRAME_MS;
      frames++;
    }
    if (frames === 5) this.accumulator = Math.min(this.accumulator, FRAME_MS);
    return frames;
  }
}
