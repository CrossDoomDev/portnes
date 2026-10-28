class IronTankAudio extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.capacity = 16384;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.read = 0;
    this.write = 0;
    this.count = 0;
    this.fraction = 0;
    this.primed = false;
    this.ratio = (options.processorOptions?.inputRate ?? 48000) / sampleRate;
    this.port.onmessage = ({ data }) => {
      if (data.type === "clear") {
        this.read = 0;
        this.write = 0;
        this.count = 0;
        this.fraction = 0;
        this.primed = false;
        return;
      }
      if (data.type !== "samples") return;
      if (this.count + data.left.length > 4800) {
        // Bound latency after a stalled tab, without speeding up simulation.
        const drop = Math.max(0, this.count + data.left.length - 2400);
        this.read = (this.read + drop) % this.capacity;
        this.count -= drop;
      }
      for (let i = 0; i < data.left.length; i++) {
        this.left[this.write] = data.left[i];
        this.right[this.write] = data.right[i];
        this.write = (this.write + 1) % this.capacity;
        this.count++;
      }
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output?.[0]) return true;
    if (!this.primed && this.count >= 1024) this.primed = true;
    for (let i = 0; i < output[0].length; i++) {
      if (!this.primed || this.count < 2) {
        output[0][i] = 0;
        if (output[1]) output[1][i] = 0;
        if (this.count < 2) this.primed = false;
        continue;
      }
      const next = (this.read + 1) % this.capacity;
      output[0][i] =
        this.left[this.read] * (1 - this.fraction) +
        this.left[next] * this.fraction;
      if (output[1])
        output[1][i] =
          this.right[this.read] * (1 - this.fraction) +
          this.right[next] * this.fraction;
      this.fraction += this.ratio;
      const advance = Math.floor(this.fraction);
      this.fraction -= advance;
      const consumed = Math.min(advance, this.count);
      this.read = (this.read + consumed) % this.capacity;
      this.count -= consumed;
    }
    return true;
  }
}
registerProcessor("iron-tank-audio", IronTankAudio);
