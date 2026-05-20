"use client";
/**
 * Floating chat widget. Visible on every page.
 *
 * Set NEXT_PUBLIC_CHAT_HIDDEN=1 to hide it (e.g., during a maintenance window).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

const HIDDEN = process.env.NEXT_PUBLIC_CHAT_HIDDEN === "1";
const STORAGE_KEY = "rassoul_chat_history_v1";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [meta, setMeta] = useState<{ donor: boolean; remaining: number; limit: number } | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  if (HIDDEN) return null;

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
        aria-label={open ? "Close chat" : "Ask about the Prophet ﷺ"}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-brand-500 text-white pl-4 pr-5 py-3 shadow-lg hover:bg-brand-600 transition flex items-center gap-2"
      >
        {open ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
            Close
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-sm font-medium">Ask about the Prophet ﷺ</span>
          </>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] h-[min(640px,calc(100vh-7rem))] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-900">
            <div>
              <h2 className="text-sm font-semibold">Rassoul Assistant</h2>
              <p className="text-[11px] text-slate-500">Source-grounded. AI, not a scholar.</p>
            </div>
            {meta && !meta.donor && meta.remaining >= 0 && (
              <span className="text-[11px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">
                {meta.remaining}/{meta.limit} left today
              </span>
            )}
            {meta?.donor && (
              <span className="text-[11px] rounded-full bg-brand-50 dark:bg-brand-900/30 px-2 py-1 text-brand-700 dark:text-brand-300 font-medium">
                Donor · unlimited
              </span>
            )}
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {msgs.length === 0 && (
              <div className="text-slate-500 space-y-3">
                <p>Ask anything about the life, teachings, and example of the Prophet Muhammad ﷺ.</p>
                <p>Every answer cites its primary source. If sources don't cover your question, I'll say so.</p>
                <div className="mt-4 grid gap-2">
                  {[
                    "When was the Prophet ﷺ born?",
                    "What did he say about kindness to parents?",
                    "Tell me about the Battle of Badr",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-500 hover:text-brand-500"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap leading-relaxed ${
                    m.role === "user"
                      ? "bg-brand-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {m.content || (streaming && i === msgs.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            {rateLimited && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-900/30 dark:border-brand-700/40 p-3">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Unlock unlimited questions</p>
                <p className="text-xs mt-1 text-slate-600 dark:text-slate-300">
                  Donate any amount to support the site and remove daily limits for 90 days.
                </p>
                <Link
                  href="/donate"
                  className="mt-2 inline-block rounded-full bg-brand-500 text-white text-xs px-3 py-1.5 hover:bg-brand-600"
                >
                  Donate
                </Link>
              </div>
            )}
          </div>

          <form
            className="border-t border-slate-200 dark:border-slate-700 p-3 flex gap-2 bg-white dark:bg-slate-900"
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
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={streaming || rateLimited || !input.trim()}
              className="rounded-lg bg-brand-500 text-white px-3.5 py-2 text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              {streaming ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
