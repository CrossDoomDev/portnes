// Original music and effects composed for the new visual direction.
// No audio files, extracted score, console sound chip or outside service.
const MELODY = [
  72,
  null,
  76,
  79,
  81,
  79,
  76,
  null,
  74,
  76,
  79,
  83,
  81,
  null,
  79,
  76,
  77,
  null,
  81,
  84,
  86,
  84,
  81,
  79,
  77,
  76,
  74,
  null,
  76,
  79,
  77,
  null,
  69,
  null,
  72,
  76,
  79,
  76,
  72,
  null,
  74,
  76,
  81,
  79,
  76,
  74,
  72,
  null,
  71,
  74,
  79,
  null,
  83,
  81,
  79,
  76,
  74,
  71,
  69,
  67,
  71,
  74,
  79,
  null,
];
const BASS = [48, 48, 53, 53, 45, 45, 55, 55];
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
export class GardenMusic {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.timer = null;
    this.step = 0;
  }
  async start() {
    this.context ||= new AudioContext();
    await this.context.resume();
    if (this.enabled) return;
    this.enabled = true;
    this.next = this.context.currentTime + 0.04;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() {
    this.enabled = false;
    clearInterval(this.timer);
    this.timer = null;
    this.context?.suspend();
  }
  tone(note, time, duration, volume = 0.07, type = "sine") {
    if (!this.context || this.context.state !== "running") return;
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz(note);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.01);
  }
  schedule() {
    if (!this.enabled) return;
    const interval = 60 / 112 / 2;
    while (this.next < this.context.currentTime + 0.12) {
      const melody = MELODY[this.step % MELODY.length];
      if (melody !== null) {
        this.tone(melody, this.next, 0.24, 0.055, "sine");
        this.tone(melody + 12, this.next, 0.09, 0.013, "triangle");
      }
      if (this.step % 2 === 0)
        this.tone(
          BASS[(this.step >> 3) % 8],
          this.next,
          0.25,
          0.06,
          "triangle",
        );
      if (this.step % 4 === 2)
        this.tone(91, this.next, 0.035, 0.012, "triangle");
      this.step++;
      this.next += interval;
    }
  }
  pop(mainCannon = false) {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    this.tone(
      mainCannon ? 67 : 88,
      now,
      mainCannon ? 0.15 : 0.055,
      mainCannon ? 0.15 : 0.045,
      "sine",
    );
    if (mainCannon) this.tone(79, now + 0.035, 0.09, 0.07, "triangle");
  }
}
