import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import MotionProvider from "@/components/motion/MotionProvider";
import SceneHost from "@/components/three/SceneHost";
import Toaster from "@/components/ui/Toaster";

import "./globals.css";

// Self-hosted by next/font at build time: no request to Google when the site runs.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Editorial accent: a few words per headline in italic serif ("Take the *seat.*"), never body text.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif", display: "swap" });

export const metadata = {
  title: { default: "InterviewOS", template: "%s · InterviewOS" },
  description:
    "Take the seat. Practise realistic interviews with VERA, get structured feedback, and improve with ARIA, a mentor that remembers every session.",
};

export const viewport = { themeColor: "#0a0a0b", colorScheme: "dark" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable}`}>
      <body className="min-h-screen antialiased">
        {/* First stop for keyboard users: jump past the navigation to the page itself (every page's <main id="main">). */}
        <a href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-foreground print:hidden">
          Skip to content
        </a>
        <MotionProvider>
          {/* The one 3D canvas, behind every page that asks for it; survives navigation (store/sceneStore.js) */}
          <div className="contents print:hidden"><SceneHost /></div>
          {children}
          <div className="contents print:hidden"><Toaster /></div>
        </MotionProvider>
      </body>
    </html>
  );
}
