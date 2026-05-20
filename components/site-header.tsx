"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/duas", label: "Duas" },
  { href: "/sirah", label: "Sirah" },
  { href: "/hadith", label: "Hadith" },
  { href: "/names-of-allah", label: "Names of Allah" },
  { href: "/sunnah", label: "Sunnah" },
  { href: "/quran", label: "Quran" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-white/85 dark:bg-slate-950/85 border-b border-slate-200/70 dark:border-slate-800/70">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="font-display font-semibold tracking-tightest text-lg flex items-center gap-2"
          >
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full bg-brand-500"
            />
            Rassoul
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-600 dark:text-slate-300">
            {NAV.map((n) => {
              const active = pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`hover:text-brand-500 ${
                    active ? "text-brand-500 font-medium" : ""
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <Link
              href="/donate"
              className="ml-2 inline-flex items-center rounded-full bg-brand-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-brand-600"
            >
              Donate
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {open ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="3" y1="7" x2="21" y2="7" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="17" x2="21" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile panel */}
        {open && (
          <nav
            id="mobile-nav"
            className="md:hidden pb-4 pt-1 grid gap-1 text-base"
          >
            {NAV.map((n) => {
              const active = pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`block rounded-md px-3 py-2 ${
                    active
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <Link
              href="/donate"
              className="mt-2 block rounded-md bg-brand-500 text-white text-center px-3 py-2.5 font-medium hover:bg-brand-600"
            >
              Donate
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
