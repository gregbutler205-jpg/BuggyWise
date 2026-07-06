import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuggyWise",
  description: "Search smart. Save big. Compare grocery prices across your local stores.",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#62a830",
};

const NAV = [
  { href: "/", label: "Lists" },
  { href: "/capture", label: "New List" },
  { href: "/prices", label: "Prices" },
  { href: "/stores", label: "Stores" },
  { href: "/review", label: "Review" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // browser extensions (dark-mode toggles, etc.) inject inline styles on
      // <html> before hydration — that's a false-positive mismatch, not ours
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="bg-white border-b border-bw-green/20 sticky top-0 z-10 print:hidden">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/brand/wordmark-header.png"
                alt="BuggyWise — Search Smart. Save Big."
                width={160}
                height={48}
                priority
                className="h-10 w-auto"
              />
            </Link>
            <nav className="flex gap-1 text-sm font-medium overflow-x-auto">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-1.5 rounded-full hover:bg-bw-cream text-bw-ink whitespace-nowrap"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-bw-ink/50 py-4 print:hidden">
          BuggyWise — search smart, save big 🛒
        </footer>
      </body>
    </html>
  );
}
