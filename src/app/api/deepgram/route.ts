import { NextResponse } from "next/server";
import { isValidLangCode } from "@/lib/utils";

/**
 * Issues a single-use session token for the browser to open a WebSocket
 * against our /api/deepgram-ws proxy (defined in server.js).
 *
 * The token is stored in `globalThis.__deepgramSessionTokens` along with the
 * Deepgram-side WebSocket URL the proxy should connect to. When the browser
 * upgrades to /api/deepgram-ws, server.js validates the token, looks up the
 * stored URL, and opens an outbound `wss://api.deepgram.com/v1/listen?...`
 * connection authenticated server-side with the long-lived API key.
 *
 * Why we proxy instead of giving the browser direct credentials:
 *   In some networks the browser cannot reach wss://api.deepgram.com at all
 *   — the TLS handshake is killed by an extension, OS firewall, or ISP DPI
 *   middlebox, surfacing as a generic close code 1006 with no reason.
 *   Routing through the loopback (browser → localhost → Node → Deepgram)
 *   sidesteps every variant of that block. The Node-side connection uses
 *   the same REST-style `Authorization: Token` header that has always worked
 *   for our /v1/projects calls.
 */

interface SessionEntry {
  deepgramUrl: string;
  expiresAt: number;
}

declare global {
  var __deepgramSessionTokens: Map<string, SessionEntry> | undefined;
}

function getSessions(): Map<string, SessionEntry> {
  if (!globalThis.__deepgramSessionTokens) {
    globalThis.__deepgramSessionTokens = new Map();
  }
  return globalThis.__deepgramSessionTokens;
}

// Token must be valid long enough for the user to start the recorder, but
// short enough that a leaked one is uninteresting. Browser opens the WS
// within ~100ms of receiving the token in practice.
const TOKEN_TTL_MS = 60_000;

function makeToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function GET(req: Request) {
  if (!process.env.DEEPGRAM_API_KEY) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const reqUrl = new URL(req.url);
  const languageParam = reqUrl.searchParams.get("language") ?? "en";
  const language =
    isValidLangCode(languageParam) ||
    /^[a-z]{2}(-[A-Z]{2})?$/i.test(languageParam)
      ? languageParam
      : "en";
  // nova-3 is required for Arabic. nova-2 returns HTTP 400 "Bad Request" on
  // any /listen WS connection with `language=ar`. nova-3 is a strict superset
  // — it supports every language nova-2 did, with comparable or better
  // accuracy, and adds Arabic plus a `language=multi` mode for sessions where
  // the source language drifts mid-utterance.
  const model = reqUrl.searchParams.get("model") ?? "nova-3";

  // The browser sends raw Linear16 PCM (16kHz mono, Int16 little-endian)
  // straight from an AudioWorklet. With WebM/Opus we had to omit
  // `encoding=` because the container framing was self-describing; with
  // raw PCM we MUST declare it or Deepgram won't know how to decode the
  // frames.
  const dgParams = new URLSearchParams({
    language,
    model,
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    punctuate: "true",
    smart_format: "true",
    interim_results: "true",
    // 200ms is the fastest comfortable value: direct-mic and arm's-length
    // PA capture rarely have intra-sentence pauses > 200ms. If verification
    // on real khutbah audio shows mid-sentence fragmentation, bump to 250.
    endpointing: "200",
    // Tag each word with a speaker id so the client can either label them or
    // filter to a single dominant speaker. Critical for non-khutbah lectures
    // and panel discussions; a no-op when only one person is speaking.
    diarize: "true",
  });
  const deepgramUrl = `wss://api.deepgram.com/v1/listen?${dgParams.toString()}`;

  // Build the proxy URL the browser will connect to. Pick ws:// vs wss://
  // based on the request scheme so this works in production behind TLS too.
  const proto = req.headers.get("x-forwarded-proto") === "https" ? "wss" : "ws";
  const host = req.headers.get("host") ?? "localhost:3000";
  const token = makeToken();
  const proxyUrl = `${proto}://${host}/api/deepgram-ws?token=${encodeURIComponent(token)}`;

  const sessions = getSessions();
  sessions.set(token, {
    deepgramUrl,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  // Opportunistic GC: drop expired entries so the Map doesn't grow unbounded
  // on a long-running dev server. Cheap because there's never many entries.
  for (const [k, v] of sessions) {
    if (v.expiresAt < Date.now()) sessions.delete(k);
  }

  // The shape stays `{ key, url }` so the browser hook doesn't need changes
  // beyond removing its subprotocol logic. `key` is now the proxy session
  // token (only the proxy will look at it); `url` is our loopback URL.
  return NextResponse.json({ key: token, url: proxyUrl });
}
