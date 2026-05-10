import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers/convex-provider";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "LiveTranscribe",
  description:
    "Real-time transcription and translation. Record a khutbah or lecture — see live dual-language text and generate an AI summary in seconds.",
  manifest: "/manifest.json",
  // iOS-specific PWA install metadata. iOS doesn't read manifest.json the
  // way Android does — it needs these meta tags to enable Add-to-Home-Screen
  // standalone mode and pick the right icon.
  appleWebApp: {
    capable: true,
    title: "LiveTranscribe",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  applicationName: "LiveTranscribe",
};

export const viewport: Viewport = {
  themeColor: "#060B18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        suppressHydrationWarning
      >
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
