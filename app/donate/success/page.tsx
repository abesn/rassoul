"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function DonateSuccess() {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
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
          // Webhook hasn't fired yet — retry a few times
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
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Jazak Allahu khairan</h1>
      {status === "verifying" || status === "pending" ? (
        <p className="mt-4 text-stone-600 dark:text-stone-300">
          Confirming your donation… {status === "pending" && "(waiting for Stripe webhook)"}
        </p>
      ) : status === "ok" ? (
        <>
          <p className="mt-4 text-stone-600 dark:text-stone-300">
            Your donation is confirmed and your browser now has unlimited chatbot access for the
            next 90 days. May Allah accept it from you.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-md bg-emerald-600 px-4 py-2 text-white">
            Back to home
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-stone-600 dark:text-stone-300">
            We received your payment but couldn't verify the session on our end. This sometimes
            happens if the webhook is delayed. Please email us with your Stripe receipt and we'll
            unlock your access manually.
          </p>
        </>
      )}
    </div>
  );
}
