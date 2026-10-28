export class AudioOutput {
  constructor() {
    this.context = null;
    this.node = null;
    this.gain = null;
    this.initializing = null;
    this.muted = false;
    this.left = new Float32Array(1024);
    this.right = new Float32Array(1024);
    this.position = 0;
  }
  async start() {
    if (!globalThis.AudioContext)
      throw new Error("Звук не поддерживается этим браузером.");
    if (!this.context) {
      this.context = new AudioContext({
        sampleRate: 48000,
        latencyHint: "interactive",
      });
      this.initializing = (async () => {
        if (this.context.audioWorklet) {
          await this.context.audioWorklet.addModule(
            new URL("./audio-worklet.js", import.meta.url),
          );
          this.node = new AudioWorkletNode(this.context, "iron-tank-audio", {
            outputChannelCount: [2],
            processorOptions: { inputRate: 48000 },
          });
        } else this.node = this.createFallback();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.muted ? 0 : 0.7;
        this.node.connect(this.gain).connect(this.context.destination);
      })();
    }
    // Resume inside the gesture, before awaiting module loading.
    const resume = this.context.resume();
    await this.initializing;
    await resume;
    this.clear();
  }
  createFallback() {
    // Compatibility for HTTP and older browsers. Modern HTTPS uses AudioWorklet.
    const node = this.context.createScriptProcessor(1024, 0, 2);
    const capacity = 16384,
      left = new Float32Array(capacity),
      right = new Float32Array(capacity);
    let read = 0,
      write = 0,
      count = 0,
      fraction = 0;
    const ratio = 48000 / this.context.sampleRate;
    node.port = {
      postMessage: (data) => {
        if (data.type === "clear") {
          read = 0;
          write = 0;
          count = 0;
          fraction = 0;
          return;
        }
        for (let i = 0; i < data.left.length; i++) {
          if (count === capacity) {
            read = (read + 1) % capacity;
            count--;
          }
          left[write] = data.left[i];
          right[write] = data.right[i];
          write = (write + 1) % capacity;
          count++;
        }
      },
    };
    node.onaudioprocess = (event) => {
      const outputL = event.outputBuffer.getChannelData(0),
        outputR = event.outputBuffer.getChannelData(1);
      for (let i = 0; i < outputL.length; i++) {
        if (count < 2) {
          outputL[i] = 0;
          outputR[i] = 0;
          continue;
        }
        const next = (read + 1) % capacity;
        outputL[i] = left[read] * (1 - fraction) + left[next] * fraction;
        outputR[i] = right[read] * (1 - fraction) + right[next] * fraction;
        fraction += ratio;
        const advance = Math.min(Math.floor(fraction), count);
        fraction -= advance;
        read = (read + advance) % capacity;
        count -= advance;
      }
    };
    return node;
  }
  setMuted(muted) {
    this.muted = muted;
    if (this.gain)
      this.gain.gain.setTargetAtTime(
        muted ? 0 : 0.7,
        this.context.currentTime,
        0.015,
      );
  }
  write = (left, right) => {
    if (!this.node || this.context.state !== "running") return;
    this.left[this.position] = left;
    this.right[this.position++] = right;
    if (this.position === this.left.length) this.flush();
  };
  flush() {
    if (!this.node || this.position === 0) return;
    this.node.port.postMessage({
      type: "samples",
      left: this.left.slice(0, this.position),
      right: this.right.slice(0, this.position),
    });
    this.position = 0;
  }
  clear() {
    this.position = 0;
    this.node?.port.postMessage({ type: "clear" });
  }
  pause() {
    this.clear();
    this.context?.suspend().catch(() => {});
  }
}
