// Raw PCM remains inside this origin. Transfer fixed buffers to the Vosk worker.
class NexusPCM extends AudioWorkletProcessor {
  constructor() { super(); this.block = new Float32Array(4096); this.offset = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (const value of channel) {
      this.block[this.offset++] = value;
      if (this.offset === this.block.length) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(4096); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('nexus-pcm', NexusPCM);
