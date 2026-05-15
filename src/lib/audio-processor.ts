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
 * Builds the audio processing graph, tuned for OUTDOOR PA-distance capture
 * (the primary use case is masjid khutbahs, including Madinah Haram and
 * other open-air gatherings where the phone is meters away from a PA
 * speaker, mixed with wind, marble reflections, and crowd murmur):
 *
 *   mic → highpass(120Hz)  ← cuts wind rumble + AC hum
 *       → lowpass(7kHz)    ← cuts outdoor hiss + crowd sibilance
 *       → compressor(4:1 @ -26dB)  ← brings up the distant quiet speech
 *       → gain(1.6×)       ← post-compression makeup for distance
 *           ├── AudioWorkletNode (with -55 dBFS noise gate) → Int16 PCM → Deepgram
 *           └── AnalyserNode (fed to level meter)
 *
 * Echo cancellation, noise suppression, and auto gain control are enabled at
 * the capture level. noiseSuppression is required for the macOS Chrome chain
 * to produce non-silent audio (empirically verified — disabling it caused
 * the mic to read literal silence).
 *
 * Audio reaches Deepgram as Linear16 PCM in 40ms frames — small enough that
 * the time between speech and the first interim transcript stays under the
 * perceptual threshold for a "live" feel. Frames whose RMS falls below the
 * worklet's -55 dBFS gate are zero-filled so Deepgram sees clean silence
 * during gaps between phrases (helps endpointing without breaking the WS
 * cadence).
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

  // 120Hz highpass cuts wind rumble + AC hum + foot shuffling. Most wind
  // energy lives below 100Hz; speech intelligibility starts above 200Hz, so
  // the small "warmth" loss is a fair trade for clean outdoor capture.
  const highPass = audioContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 120;
  highPass.Q.value = 0.7;

  // 7kHz lowpass cuts high-frequency outdoor hiss + crowd sibilance. Speech
  // content sits below 4kHz; the 4-7kHz range carries some consonant detail
  // worth keeping, but everything above is noise for our use case.
  const lowPass = audioContext.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 7000;
  lowPass.Q.value = 0.7;

  // Compressor tuned for OUTDOOR PA distance — Madinah Haram courtyards,
  // open-air gatherings, conferences. The aggressive 4:1 / -26dB stack
  // brings up distant quiet speech that would otherwise sit too low for
  // Deepgram. The earlier gentle 2.5:1 / -18dB was tuned for close-mic
  // (no pumping artifacts on direct speech) but left distant audio
  // under-amplified.
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -26;
  compressor.knee.value = 6;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  // 1.6x makeup gain after compression. Distant outdoor PA captured by
  // a phone mic typically arrives 10-15dB lower than indoor close-mic;
  // makeup gain compensates so Deepgram sees usable signal levels.
  const gain = audioContext.createGain();
  gain.gain.value = 1.6;

  source.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(compressor);
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
    const nodes: AudioNode[] = [source, highPass, lowPass, compressor, gain, driverSink, pcmNode, analyser];
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
