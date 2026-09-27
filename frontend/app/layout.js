import "./globals.css";

export const metadata = {
  title: { default: "AI Interview Coach", template: "%s · AI Interview Coach" },
  description: "Practice realistic interviews, get structured feedback, and learn from an AI mentor that knows your history.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
