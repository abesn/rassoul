"use client";
import { useState } from "react";

const PRESETS = [3, 5, 10, 25];

export default function DonatePage() {
  const [amount, setAmount] = useState(5);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setErr(null);
    try {
      const cents = Math.round((custom ? Number(custom) : amount) * 100);
      if (!Number.isFinite(cents) || cents < 100) {
        setErr("Minimum donation is $1.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/donate/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to start checkout");
      window.location.href = data.url;
    } catch (e) {
      setErr((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Support Rassoul</h1>
      <p className="mt-4 text-stone-600 dark:text-stone-300">
        Every donation, no matter the amount, unlocks unlimited chatbot questions for 90 days on
        this browser. Beyond that, it keeps the lights on for source-grounded da'wah content that
        cites every claim back to its primary source.
      </p>
      <p className="mt-3 text-sm text-stone-500">
        One-time, secure card payment via Stripe. No subscription. No recurring charges.
      </p>

      <div className="mt-8 space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                amount === p && !custom
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                  : "border-stone-300 dark:border-stone-700 hover:border-emerald-500"
              }`}
            >
              ${p}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Or enter a custom amount (USD)</label>
          <div className="flex items-center rounded-md border border-stone-300 dark:border-stone-700 focus-within:border-emerald-500">
            <span className="px-3 text-stone-500">$</span>
            <input
              type="number"
              min="1"
              step="1"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Any amount, $1 minimum"
              className="flex-1 bg-transparent py-2 pr-3 outline-none"
            />
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          onClick={start}
          disabled={loading}
          className="w-full rounded-md bg-emerald-600 px-4 py-3 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Opening Stripe…" : "Donate"}
        </button>
      </div>
    </div>
  );
}
