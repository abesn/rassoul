"use client";
/**
 * Floating chat widget. Soft-launched: only renders when the URL contains ?chat=1
 * or localStorage has rassoul_chat_enabled=1. Flip the env flag NEXT_PUBLIC_CHAT_PUBLIC=1
 * to make it visible to everyone.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_PUBLIC = process.env.NEXT_PUBLIC_CHAT_PUBLIC === "1";
const STORAGE_KEY = "rassoul_chat_history_v1";
const ENABLED_KEY = "rassoul_chat_enabled";

export function ChatWidget() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [meta, setMeta] = useState<{ donor: boolean; remaining: number; limit: number } | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Enable detection: ?chat=1 OR localStorage flag OR env flag
  useEffect(() => {
    if (CHAT_PUBLIC) {
      setEnabled(true);
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("chat") === "1") {
      localStorage.setItem(ENABLED_KEY, "1");
      setEnabled(true);
      return;
    }
    if (localStorage.getItem(ENABLED_KEY) === "1") setEnabled(true);
  }, []);

  // Restore history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-20)));
    } catch {
      /* ignore */
    }
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  if (!enabled) return null;

  async function send() {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setRateLimited(false);
    const userMsg: Msg = { role: "user", content: q };
    setMsgs((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: msgs.slice(-6) }),
      });

      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setRateLimited(true);
        setMsgs((m) => {
          const out = m.slice(0, -1);
          out.push({
            role: "assistant",
            content: data.message ?? "You've reached your free questions for today.",
          });
          return out;
        });
        setStreaming(false);
        return;
      }

      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          const evName = ev.split("\n").find((l) => l.startsWith("event: "))?.slice(7);
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (evName === "meta") {
            setMeta({ donor: data.donor, remaining: data.remaining, limit: data.limit });
          } else if (evName === "delta") {
            setMsgs((m) => {
              const out = [...m];
              out[out.length - 1] = {
                role: "assistant",
                content: out[out.length - 1].content + data.text,
              };
              return out;
            });
          } else if (evName === "error") {
            throw new Error(data.message ?? "stream error");
          }
        }
      }
    } catch (err) {
      setMsgs((m) => {
        const out = m.slice(0, -1);
        out.push({ role: "assistant", content: `Sorry, something went wrong: ${(err as Error).message}` });
        return out;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask about the Prophet ﷺ"
        className="fixed bottom-5 right-5 z-50 rounded-full bg-emerald-600 text-white px-4 py-3 shadow-lg hover:bg-emerald-700 transition"
      >
        {open ? "Close" : "Ask about the Prophet ﷺ"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] h-[min(640px,calc(100vh-7rem))] flex flex-col rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl">
          <header className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Rassoul Assistant</h2>
              <p className="text-xs text-stone-500">Source-grounded. AI, not a scholar.</p>
            </div>
            {meta && !meta.donor && meta.remaining >= 0 && (
              <span className="text-xs text-stone-500">{meta.remaining}/{meta.limit} left today</span>
            )}
            {meta?.donor && <span className="text-xs text-emerald-600">Donor · unlimited</span>}
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {msgs.length === 0 && (
              <div className="text-stone-500 space-y-2">
                <p>Ask anything about the life, teachings, and example of the Prophet Muhammad ﷺ.</p>
                <p>Every answer cites its primary source. If sources don't cover your question, I'll say so.</p>
                <ul className="mt-3 space-y-1 text-xs text-stone-400">
                  <li>· When was the Prophet ﷺ born?</li>
                  <li>· What did he say about kindness to parents?</li>
                  <li>· Tell me about the Battle of Badr</li>
                </ul>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                  }`}
                >
                  {m.content || (streaming && i === msgs.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            {rateLimited && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 p-3 text-stone-700 dark:text-stone-200">
                <p className="text-sm font-medium">Unlock unlimited questions</p>
                <p className="text-xs mt-1">
                  Donate any amount to support the site and remove daily limits for 90 days.
                </p>
                <Link
                  href="/donate"
                  className="mt-2 inline-block rounded-md bg-emerald-600 text-white text-xs px-3 py-1.5 hover:bg-emerald-700"
                >
                  Donate
                </Link>
              </div>
            )}
          </div>

          <form
            className="border-t border-stone-200 dark:border-stone-700 p-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={streaming || rateLimited}
              placeholder={rateLimited ? "Daily limit reached — donate to continue" : "Ask a question…"}
              className="flex-1 rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={streaming || rateLimited || !input.trim()}
              className="rounded-md bg-emerald-600 text-white px-3 py-2 text-sm disabled:opacity-50"
            >
              {streaming ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
