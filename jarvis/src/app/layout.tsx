import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jarvis in your pocket",
  description:
    "Your personal concierge for local events, entertainment, and wellbeing — booked straight onto your calendar.",
  // PWA: installable on iPhone via Safari "Add to Home Screen" — runs
  // full-screen with its own icon, no App Store build required.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jarvis",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1116",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand">
              <span>Jarvis</span> in your pocket
            </Link>
            <Link href="/digest">Digest (debug)</Link>
            <Link href="/history">History (debug)</Link>
            <Link href="/settings">Settings</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
