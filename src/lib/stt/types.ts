/**
 * A minimal, provider-neutral STT interface used ONLY by the side-by-side
 * comparison harness (/dev/stt-compare).
 *
 * WHY THIS EXISTS SEPARATELY FROM use-deepgram.ts:
 * The production hook is not a raw engine client — it layers a speaker lock,
 * a confidence floor, an off-language script gate, a single-word filter, and
 * reconnect bookkeeping on top of Deepgram's output. Running the comparison
 * through it would measure Tarjuman's filtering, not the engine. These clients
 * are deliberately dumb: connect, stream PCM, surface exactly what the vendor
 * returned. That is the only way the A/B is about the engines.
 *
 * Consequence: do NOT reuse these in the recording path. They have no
 * reconnect, no noise defenses, and no persistence.
 */

export type SttStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "stopped"
  | "error";

export interface SttFinal {
  id: string;
  text: string;
  /**
   * Engine-reported end of the audio this segment covers, in seconds from
   * session start. Paired with `arrivedAtMs` this yields a true, cross-vendor
   * comparable latency: how long after the words were spoken did the final
   * text actually land.
   */
  audioEndSec: number | null;
  /** Wall-clock ms from session start to when this final arrived. */
  arrivedAtMs: number;
  /** Mean word confidence, when the vendor reports one. */
  confidence: number | null;
  /** Vendor speaker label, when diarization is on and available. */
  speaker: string | null;
}

export interface SttHandlers {
  onPartial: (text: string) => void;
  onFinal: (final: SttFinal) => void;
  onStatus: (status: SttStatus) => void;
  onError: (message: string) => void;
}

export interface SttClient {
  /** Opens the connection. Resolves once the engine is ready for audio. */
  start(): Promise<void>;
  /** Forwards one PCM frame. No-op unless the engine is ready. */
  send(frame: ArrayBuffer): void;
  /** Closes the connection. Safe to call repeatedly. */
  stop(): void;
}

export interface SttClientOptions {
  sourceLanguage: string;
  sampleRate: number;
  /** Bias the decoder toward Islamic vocabulary (see lib/stt/keyterms.ts). */
  useKeyterms: boolean;
  /** Convex auth token — both token-minting routes require a signed-in user. */
  authToken: string | null;
  handlers: SttHandlers;
}

/**
 * Turns a failed credential response into a message worth reading.
 *
 * A route that THROWS (rather than returning a JSON error) yields Next's HTML
 * error page. `res.json()` then rejects, and the usual `body?.error ?? status`
 * pattern degrades to "failed (500)" — which is exactly the message that tells
 * you nothing. Falling back to the raw body text surfaces the real stack.
 */
export async function describeHttpError(
  res: Response,
  label: string,
): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* not JSON — fall through to the raw body */
  }
  const snippet = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return snippet
    ? `${label} credentials failed (${res.status}): ${snippet.slice(0, 300)}`
    : `${label} credentials failed (${res.status})`;
}

/** Latency of a final: how far behind the speaker the text landed. */
export function lagMsOf(final: SttFinal): number | null {
  if (final.audioEndSec === null) return null;
  return Math.round(final.arrivedAtMs - final.audioEndSec * 1000);
}
