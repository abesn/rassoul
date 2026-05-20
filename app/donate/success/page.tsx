"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function DonateSuccess() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <DonateSuccessInner />
    </Suspense>
  );
}

function DonateSuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<"verifying" | "ok" | "pending" | "error">("verifying");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    async function verify() {
      try {
        const res = await fetch("/api/donate/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (cancelled) return;
        if (res.ok) {
          setStatus("ok");
        } else if (res.status === 404) {
          setStatus("pending");
          if (tries < 8) {
            setTimeout(() => setTries((n) => n + 1), 1500);
          } else {
            setStatus("error");
          }
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [sessionId, tries]);

  return (
    <div className="max-w-xl mx-auto text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(1 144 0)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tightest">
        Jazak Allahu khairan
      </h1>
      {status === "verifying" || status === "pending" ? (
        <p className="mt-4 text-slate-600 dark:text-slate-300">
          Confirming your donation… {status === "pending" && "(waiting for Stripe webhook)"}
        </p>
      ) : status === "ok" ? (
        <>
          <p className="mt-4 text-slate-600 dark:text-slate-300">
            Your donation is confirmed and your browser now has unlimited chatbot access for the
            next 90 days. May Allah accept it from you.
          </p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-full bg-brand-500 px-6 py-2.5 text-white font-medium hover:bg-brand-600"
          >
            Back to home
          </Link>
        </>
      ) : (
        <p className="mt-4 text-slate-600 dark:text-slate-300">
          We received your payment but couldn't verify the session on our end. This sometimes
          happens if the webhook is delayed. Please email us with your Stripe receipt and we'll
          unlock your access manually.
        </p>
      )}
    </div>
  );
}
