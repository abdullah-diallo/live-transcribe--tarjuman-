export interface AudioPipeline {
  sourceStream: MediaStream;
  /**
   * AudioWorkletNode that emits 40ms Int16 PCM frames (16kHz, mono) via
   * `port.onmessage`. Each message's `data` is an ArrayBuffer ready to
   * forward as a binary WebSocket message.
   */
  pcmNode: AudioWorkletNode;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  gainNode: GainNode;
  teardown: () => Promise<void>;
}

export class MicPermissionError extends Error {
  constructor(message = "Microphone permission denied") {
    super(message);
    this.name = "MicPermissionError";
  }
}

export class MicUnavailableError extends Error {
  constructor(message = "Microphone is not available on this device") {
    super(message);
    this.name = "MicUnavailableError";
  }
}

/**
 * Builds the audio processing graph:
 *   mic → highpass(85Hz) → compressor(2.5:1 @ -18dB) → gain(1.1×)
 *                                                       ├── AudioWorkletNode → Int16 PCM frames → Deepgram
 *                                                       └── AnalyserNode (fed to level meter)
 *
 * Echo cancellation, noise suppression, and auto gain control are enabled at
 * the capture level before the signal reaches our graph.
 *
 * Audio reaches Deepgram as Linear16 PCM in 40ms frames — small enough that
 * the time between speech and the first interim transcript stays under the
 * perceptual threshold for a "live" feel.
 */
export async function createAudioPipeline(): Promise<AudioPipeline> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new MicUnavailableError();
  }

  let sourceStream: MediaStream;
  try {
    sourceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        // All three of these need to be on for the macOS built-in mic to
        // produce usable audio in Chrome. Disabling noiseSuppression in
        // particular caused the mic stream to read as literal silence —
        // the OS audio chain seems to bypass entirely without it. The
        // tradeoff (some quiet voiced consonants lost) is acceptable
        // compared to "no audio at all".
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (e) {
    const err = e as DOMException;
    if (
      err?.name === "NotAllowedError" ||
      err?.name === "PermissionDeniedError" ||
      err?.name === "SecurityError"
    ) {
      throw new MicPermissionError(err.message || "Microphone permission denied");
    }
    throw err;
  }

  const AudioCtx: typeof AudioContext =
    (window.AudioContext as typeof AudioContext) ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).webkitAudioContext as typeof AudioContext);

  const audioContext = new AudioCtx({ sampleRate: 16000 });

  // Some browsers create the AudioContext in a suspended state until a user
  // gesture; our caller (a click handler) satisfies that requirement, but we
  // still resume explicitly in case a browser chooses to keep it suspended.
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // Ignore — will be resumed by the next user gesture if needed.
    }
  }

  const source = audioContext.createMediaStreamSource(sourceStream);

  const highPass = audioContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 85;
  highPass.Q.value = 0.7;

  // Compressor settings tuned to handle PA-distance audio without pumping on
  // close-mic speech. The earlier 4:1 / -24dB / 1.5x-gain stack worked when
  // Opus downstream was hiding the artifacts; Linear16 surfaces them, so the
  // dynamics need to be gentler.
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const gain = audioContext.createGain();
  gain.gain.value = 1.1;

  source.connect(highPass);
  highPass.connect(compressor);
  compressor.connect(gain);

  // The downstream nodes are an AnalyserNode (visualizer) and an
  // AudioWorkletNode (Deepgram). Neither is a real destination — Chrome's
  // rendering thread does not always pull audio through a graph that has no
  // path to a destination, and the symptom is process() running with
  // silent input buffers and AnalyserNode reading zeros. A
  // MediaStreamDestination is a real sink and forces the graph to render.
  // The output stream is intentionally unused.
  const driverSink = audioContext.createMediaStreamDestination();
  gain.connect(driverSink);

  // Load and instantiate the PCM worklet. The module is served from /public
  // at /pcm-worklet.js. addModule rejects on 404 / parse error, which we
  // surface to the caller — there is no useful fallback path.
  await audioContext.audioWorklet.addModule("/pcm-worklet.js");
  const pcmNode = new AudioWorkletNode(audioContext, "pcm-worklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  });
  gain.connect(pcmNode);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;
  gain.connect(analyser);

  let toreDown = false;
  const teardown = async () => {
    if (toreDown) return;
    toreDown = true;
    try {
      pcmNode.port.onmessage = null;
      pcmNode.port.close();
    } catch {
      /* already closed */
    }
    const nodes: AudioNode[] = [source, highPass, compressor, gain, driverSink, pcmNode, analyser];
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    sourceStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* already stopped */
      }
    });
    try {
      await audioContext.close();
    } catch {
      /* already closed */
    }
  };

  return {
    sourceStream,
    pcmNode,
    audioContext,
    analyser,
    gainNode: gain,
    teardown,
  };
}
