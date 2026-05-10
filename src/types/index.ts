// Note: until `npx convex dev` runs and generates convex/_generated,
// we use string placeholders for Id types. F6 will replace these with
// `import type { Id } from "@/../convex/_generated/dataModel"`.
type SessionId = string & { __brand: "sessions" };
type UserId = string & { __brand: "users" };

export type SessionStatus = "recording" | "paused" | "completed";

export interface TranscriptSegment {
  id: string;
  sourceText: string;
  translatedText: string;
  timestamp: number;
}

export interface Session {
  _id: SessionId;
  userId: UserId;
  title?: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: SessionStatus;
  segments: TranscriptSegment[];
  duration: number;
  summary?: string;
  summaryLanguage?: string;
  createdAt: number;
  updatedAt: number;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "paused"
  | "reconnecting"
  | "error";

export type RecordState = "idle" | "recording" | "paused" | "completed";

export interface LiveSegment {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  /** Cumulative duration of this segment in seconds (Deepgram-reported). */
  durationSec?: number;
  /** Speaker id from Deepgram diarization. Same speaker across the session. */
  speaker?: number;
  /** Average word confidence from Deepgram, 0..1. */
  confidence?: number;
}
