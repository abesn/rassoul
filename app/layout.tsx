import type { Metadata } from "next";
import Link from "next/link";
import { ChatWidget } from "@/components/chat-widget";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Rassoul — Da'wah, Sirah, Hadith & Duas",
    template: "%s · Rassoul",
  },
  description:
    "Source-grounded Islamic content: duas with authentic citations, the sirah of the Messenger ﷺ, hadith collections, the 99 Names of Allah, and weekly reminders.",
  openGraph: {
    type: "website",
    siteName: "Rassoul",
    locale: "en_US",
  },
  alternates: { canonical: "/" },
};

const NAV = [
  { href: "/duas", label: "Duas" },
  { href: "/sirah", label: "Sirah" },
  { href: "/hadith", label: "Hadith" },
  { href: "/names-of-allah", label: "Names of Allah" },
  { href: "/names-of-the-messenger", label: "Names of the Messenger ﷺ" },
  { href: "/sunnah", label: "Sunnah" },
  { href: "/quran", label: "Quran" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <header className="border-b border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-4xl px-4 py-5 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Rassoul
            </Link>
            <nav className="hidden md:flex gap-5 text-sm text-stone-600 dark:text-stone-300">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-emerald-600">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
        <footer className="mt-20 border-t border-stone-200 dark:border-stone-800">
          <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-stone-500">
            <p>
              Every hadith and ayah on this site is cited to its primary source on{" "}
              <a className="underline" href="https://sunnah.com">
                sunnah.com
              </a>{" "}
              or{" "}
              <a className="underline" href="https://quran.com">
                quran.com
              </a>
              . If you spot an error, please open an issue on GitHub.
            </p>
            <p className="mt-3">
              © {new Date().getFullYear()} Rassoul · <Link href="/feed.xml">RSS</Link> ·{" "}
              <Link href="/donate" className="text-emerald-600 hover:underline">
                Donate
              </Link>
            </p>
          </div>
        </footer>
        <ChatWidget />
      </body>
    </html>
  );
}
