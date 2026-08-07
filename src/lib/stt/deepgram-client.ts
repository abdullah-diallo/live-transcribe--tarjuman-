/**
 * Raw Deepgram realtime client for the comparison harness.
 *
 * Mirrors production's transport exactly — same /api/deepgram credential route,
 * same loopback-proxy-in-dev behavior, same Linear16 framing — but applies NONE
 * of use-deepgram.ts's filtering. What Deepgram says is what you see.
 */

import type { SttClient, SttClientOptions, SttFinal, SttStatus } from "./types";
import { describeHttpError } from "./types";

interface DeepgramWord {
  word: string;
  confidence?: number;
  speaker?: number;
}

interface DeepgramResult {
  type?: string;
  is_final?: boolean;
  start?: number;
  duration?: number;
  channel?: {
    alternatives?: {
      transcript?: string;
      confidence?: number;
      words?: DeepgramWord[];
    }[];
  };
}

export function createDeepgramClient(opts: SttClientOptions): SttClient {
  const { sourceLanguage, sampleRate, useKeyterms, authToken, handlers } = opts;

  let ws: WebSocket | null = null;
  let ready = false;
  let stopped = false;
  let startedAt = 0;
  let seq = 0;

  const setStatus = (s: SttStatus) => {
    if (!stopped || s === "stopped" || s === "error") handlers.onStatus(s);
  };

  const start = async () => {
    setStatus("connecting");

    const params = new URLSearchParams({
      language: sourceLanguage,
      sample_rate: String(sampleRate),
    });
    // Keyterm prompting is opt-in on the route so production behavior is
    // unchanged until this harness verifies Deepgram accepts it for Arabic.
    if (useKeyterms) params.set("keyterms", "1");

    const res = await fetch(`/api/deepgram?${params.toString()}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });
    if (!res.ok) {
      throw new Error(await describeHttpError(res, "Deepgram"));
    }
    const { key, url } = (await res.json()) as { key: string; url: string };

    await new Promise<void>((resolve, reject) => {
      // Dev routes through the loopback proxy (server.js), which authenticates
      // upstream itself and takes the token in the URL. Prod gets a Deepgram
      // temp key, passed as the `token` subprotocol.
      const isProxy = url.includes("/api/deepgram-ws");
      const socket = isProxy
        ? new WebSocket(url)
        : new WebSocket(url, ["token", key]);
      socket.binaryType = "arraybuffer";
      ws = socket;

      socket.onopen = () => {
        ready = true;
        startedAt = Date.now();
        setStatus("listening");
        resolve();
      };

      socket.onerror = () => {
        if (!ready) reject(new Error("Deepgram WebSocket failed to open"));
        else handlers.onError("Deepgram connection error");
      };

      socket.onclose = (ev) => {
        ready = false;
        if (stopped) return setStatus("stopped");
        // 1006 with no reason is the classic blocked-handshake / rejected-param
        // signature — surface it rather than silently going quiet.
        handlers.onError(
          ev.code === 1006
            ? "Deepgram closed the socket (1006) — check the connection params"
            : `Deepgram closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ""})`,
        );
        setStatus("error");
        if (!ready) reject(new Error(`Deepgram closed (${ev.code})`));
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let msg: DeepgramResult;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type && msg.type !== "Results") return;

        const alt = msg.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim();
        if (!text) return;

        if (!msg.is_final) {
          handlers.onPartial(text);
          return;
        }

        const words = alt?.words ?? [];
        const confidences = words
          .map((w) => w.confidence)
          .filter((c): c is number => typeof c === "number");
        const speakers = words
          .map((w) => w.speaker)
          .filter((s): s is number => typeof s === "number");

        const final: SttFinal = {
          id: `dg-${seq++}`,
          text,
          audioEndSec:
            typeof msg.start === "number" && typeof msg.duration === "number"
              ? msg.start + msg.duration
              : null,
          arrivedAtMs: Date.now() - startedAt,
          confidence: confidences.length
            ? confidences.reduce((a, b) => a + b, 0) / confidences.length
            : (alt?.confidence ?? null),
          speaker: speakers.length ? `S${speakers[0]}` : null,
        };
        handlers.onPartial("");
        handlers.onFinal(final);
      };
    });
  };

  return {
    start,
    send(frame) {
      if (ready && ws?.readyState === WebSocket.OPEN) ws.send(frame);
    },
    stop() {
      stopped = true;
      ready = false;
      try {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        }
        ws?.close();
      } catch {
        /* already closed */
      }
      ws = null;
      setStatus("stopped");
    },
  };
}
