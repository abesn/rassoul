import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <SiteHeader />

        <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16">{children}</main>

        <footer className="mt-24 border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 text-sm text-slate-500 grid gap-4 md:grid-cols-2">
            <p>
              Every hadith and ayah on this site is cited to its primary source on{" "}
              <a className="underline hover:text-brand-500" href="https://sunnah.com">
                sunnah.com
              </a>{" "}
              or{" "}
              <a className="underline hover:text-brand-500" href="https://quran.com">
                quran.com
              </a>
              . Spot an error? Open an issue on{" "}
              <a className="underline hover:text-brand-500" href="https://github.com/abesn/rassoul">
                GitHub
              </a>
              .
            </p>
            <p className="md:text-right">
              © {new Date().getFullYear()} Rassoul ·{" "}
              <Link href="/feed.xml" className="hover:text-brand-500">
                RSS
              </Link>{" "}
              ·{" "}
              <Link href="/donate" className="text-brand-500 hover:text-brand-600">
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
