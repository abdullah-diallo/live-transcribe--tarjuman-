// AudioWorkletProcessor that converts the audio graph's Float32 output to
// signed 16-bit PCM and posts ArrayBuffer frames to the main thread. Fed
// to Deepgram as raw Linear16 (encoding=linear16&sample_rate=16000) so we
// avoid the container framing latency MediaRecorder/WebM-Opus imposes on
// small chunks.
//
// Frame size: 640 samples = 40ms at 16kHz. Small enough to keep
// audio-to-transcript latency low; large enough to avoid one-message-per-
// quantum WebSocket spam.
class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 640;
    this.buffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex++] = channel[i];
      if (this.bufferIndex >= this.frameSize) {
        const int16 = new Int16Array(this.frameSize);
        for (let j = 0; j < this.frameSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(int16.buffer, [int16.buffer]);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorkletProcessor);
