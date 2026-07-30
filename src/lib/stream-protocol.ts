/**
 * Wire protocol shared by the streaming AI routes and their browser consumers.
 *
 * Deliberately dependency-free. The server half of this protocol lives in
 * `@/lib/anthropic-stream`, which imports `next/server` — pulling that into a
 * client hook would drag server-only code into the browser bundle. This module
 * is the neutral ground both sides can import.
 */

/**
 * Separates streamed prose from the trailing metadata JSON in a plain-text
 * stream. U+241E (record separator) cannot appear in model prose, so a client
 * can split on it safely.
 *
 * Emitted by /api/translate and /api/chat; parsed by use-translator and
 * use-chat-stream. It was previously hand-copied into each side under a "MUST
 * byte-match" comment — this is that comment made structural.
 */
export const META_SENTINEL = "\n␞__TARJUMAN_META__␞\n";
