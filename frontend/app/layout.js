import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

// Self-hosted by next/font at build time: no request to Google when the site runs.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata = {
  title: { default: "InterviewOS", template: "%s · InterviewOS" },
  description:
    "Take the seat. Practise realistic interviews with VERA, get structured feedback, and improve with ARIA, a mentor that remembers every session.",
};

export const viewport = { themeColor: "#0a0a0b", colorScheme: "dark" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
