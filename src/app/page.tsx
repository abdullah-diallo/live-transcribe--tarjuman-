import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)] grid place-items-center shadow-[0_0_30px_rgba(46,204,113,0.4)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0A0F1C"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0014 0" />
            <line x1="12" y1="20" x2="12" y2="24" />
          </svg>
        </div>
        <span className="text-xl font-bold">LiveTranscribe</span>
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold max-w-xl leading-tight">
        Real-time transcription and translation for khutbahs, lectures, and
        conferences.
      </h1>
      <p className="max-w-md text-[var(--color-text-2)] text-base leading-relaxed">
        Tap record. See Arabic speech turned into English text as it happens.
        Generate an AI summary when you&apos;re done.
      </p>
      <Link
        href="/record"
        className="mt-2 px-6 py-3 rounded-xl bg-[var(--color-accent)] text-[#0A0F1C] font-bold shadow-[0_0_24px_rgba(46,204,113,0.35)] hover:brightness-110 transition"
      >
        Try it free
      </Link>
      <p className="text-xs text-[var(--color-text-4)]">
        Foundation ready · F0 complete
      </p>
    </main>
  );
}
