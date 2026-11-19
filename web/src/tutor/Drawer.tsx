import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TutorMessage } from "../../shared/wire.ts";
import { ApiError, askTutor, clearTutor, tutorHistory, tutorLadder } from "../api/client.ts";
import { speakableText } from "../../shared/tts/speakable.ts";
import { useListen } from "../listen/data.ts";
import { Markdown, SpokenMarkdown } from "../markdown.tsx";
import { useApp } from "../state.tsx";
import { Button, cx, Notice } from "../ui.tsx";
import { useTutor } from "./store.ts";

// The Tutor's drawer, beside every page. A question goes to the Tutor with
// the page and the exercise last worked on; on an exercise, the hint ladder
// offers one rung at a time, each its own request. Rung 3 gives the line,
// which Lean has checked first, and marks the next check of the exercise
// assisted. The Tutor explains and hints; Lean decides.

const RUNGS = [
  { rung: 1, label: "A nudge", says: "about the idea" },
  { rung: 2, label: "Name the move", says: "or the lemma" },
  { rung: 3, label: "Show the line", says: "counts as assisted" },
] as const;

export function TutorDrawer() {
  const { open, setOpen, active, snapshot, insert } = useTutor();
  const [inserted, setInserted] = useState<string | null>(null);
  // Under each code block of a reply, where there is a free file to put it in.
  const codeAction = insert
    ? (code: string) => (
        <Button
          className="mb-2 text-xs"
          data-tutor-insert
          onClick={() => {
            insert(code);
            setInserted(code);
          }}
        >
          {inserted === code ? "Inserted at the end of your file" : "Insert into the Playground"}
        </Button>
      )
    : undefined;
  const { content } = useApp();
  const [messages, setMessages] = useState<TutorMessage[] | null>(null);
  // Listen mode: a reply is read aloud as it arrives, the word sounding marked.
  const listen = useListen();
  // A reply can take a while: whether to read it is asked when it arrives, not when the question was sent.
  const listenNow = useRef(listen);
  useEffect(() => {
    listenNow.current = listen;
  }, [listen]);
  const [spoken, setSpoken] = useState<{ id: number; word: number | null } | null>(null);
  function readAloud(m: TutorMessage) {
    const text = speakableText(m.text).text;
    if (!text) return;
    const done = () => setSpoken((s) => (s?.id === m.id ? null : s));
    setSpoken({ id: m.id, word: null });
    listenNow.current.speak(text, { aside: true, onWord: (word) => setSpoken((s) => (s?.id === m.id ? { id: m.id, word } : s)), onEnd: done, onError: done, onStop: done });
  }
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [rung, setRung] = useState(0);
  const stop = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  // The history, once, when the drawer first opens.
  useEffect(() => {
    if (!open || messages !== null) return;
    tutorHistory().then(
      (h) => setMessages(h.messages),
      (e: Error) => setTrouble(e.message),
    );
  }, [open, messages]);

  // The rung reached on the exercise in view, from the server.
  const exerciseKey = active ? `${active.lessonId}/${active.exerciseId}` : "";
  useEffect(() => {
    setRung(0);
    if (!open || !active) return;
    let live = true;
    tutorLadder(active.lessonId, active.exerciseId).then(
      (r) => live && setRung(r.rung),
      () => {},
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the exercise, not the object
  }, [open, exerciseKey]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(req: { message?: string; hint?: 1 | 2 | 3 }) {
    if (busy) return;
    setBusy(true);
    setTrouble(null);
    const ctrl = new AbortController();
    stop.current = ctrl;
    try {
      const reply = await askTutor({ ...req, context: snapshot() }, ctrl.signal);
      setMessages((m) => [...(m ?? []), ...reply.messages]);
      const said = reply.messages.findLast((m) => m.role === "assistant");
      if (said && listenNow.current.on && listenNow.current.voiceId) readAloud(said);
      if (req.hint) {
        const given = reply.messages.some((m) => m.role === "assistant" && m.rung === req.hint);
        if (given) setRung((r) => Math.max(r, req.hint!));
      }
      if (req.message) setDraft("");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // The server records why it stopped; fetch the history again for it.
        tutorHistory().then((h) => setMessages(h.messages), () => {});
      } else setTrouble(e instanceof ApiError ? e.message : String(e));
    } finally {
      stop.current = null;
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (text) void send({ message: text });
  }

  async function clear() {
    try {
      await clearTutor();
      setMessages([]);
    } catch (e) {
      setTrouble(e instanceof ApiError ? e.message : String(e));
    }
  }

  const exercise = active ? content.lessons.find((l) => l.id === active.lessonId)?.exercises.find((x) => x.id === active.exerciseId) : undefined;

  if (!open) {
    return (
      <button
        type="button"
        data-tutor-open
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-20 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-lg hover:bg-accent-hover"
      >
        Ask the Tutor
      </button>
    );
  }

  return (
    <aside
      data-tutor
      aria-label="Tutor"
      className="fixed inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-line-strong bg-panel shadow-xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">Tutor</h2>
          <p className="text-xs text-fg-3">Explains and hints. Lean decides what is proved.</p>
          <p className="text-xs text-fg-3" data-tutor-history-note>
            It can read your attempts and progress, and cannot change them.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void clear()} disabled={busy || !messages?.length}>
            Clear
          </Button>
          <Button onClick={() => setOpen(false)} aria-label="Close the Tutor">
            Close
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages === null && !trouble && <p className="text-sm text-fg-3">Loading…</p>}
        {messages?.length === 0 && (
          <p className="text-sm text-fg-3">Ask about anything on the page: why a move did what it did, what a goal means, what an error is saying. On an exercise, the hints below go one step at a time. It can also look at your past attempts: try “what do I keep getting wrong?”{insert ? " Here in the Playground it can try things in Lean itself: ask it to put a statement into Lean, to find a lemma, or for a next step. Nothing goes into your file unless you press Insert." : ""}</p>
        )}
        <ol className="flex flex-col gap-3">
          {messages?.map((m) => (
            <li key={m.id} data-tutor-message={m.role} data-rung={m.rung ?? undefined}>
              {m.role === "user" ? (
                <p className="ml-8 rounded-xl bg-accent-soft px-3 py-2 text-sm text-fg">{m.text}</p>
              ) : m.role === "note" ? (
                <p className="rounded-xl border border-warn bg-warn-soft px-3 py-2 text-sm text-fg">{m.text}</p>
              ) : (
                <div className="mr-4 rounded-xl border border-line bg-ground px-3 py-2 text-sm">
                  {m.rung && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Hint {m.rung}</p>}
                  {spoken?.id === m.id ? <SpokenMarkdown source={m.text} activeWord={spoken.word} codeAction={codeAction} /> : <Markdown source={m.text} codeAction={codeAction} />}
                </div>
              )}
            </li>
          ))}
        </ol>
        {busy && (
          <p className="mt-3 text-sm text-fg-3" role="status">
            The Tutor is thinking…
          </p>
        )}
        {trouble && (
          <div className="mt-3">
            <Notice tone="bad">{trouble}</Notice>
          </div>
        )}
        <div ref={end} />
      </div>

      {exercise && (
        <section className="border-t border-line px-4 py-3" data-hint-ladder={exercise.id} data-rung={rung}>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Hints for “{exercise.title}”</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {RUNGS.map((r) => {
              const reached = rung >= r.rung;
              const next = rung + 1 === r.rung;
              return (
                <button
                  key={r.rung}
                  type="button"
                  data-hint={r.rung}
                  disabled={busy || !next}
                  onClick={() => void send({ hint: r.rung })}
                  className={cx(
                    "rounded-lg border px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed",
                    reached ? "border-good-line bg-good-soft text-fg" : next ? "border-accent bg-panel text-fg hover:bg-accent-soft" : "border-line bg-panel text-fg-3 opacity-60",
                  )}
                >
                  <span className="block font-semibold">
                    {r.rung}. {r.label}
                  </span>
                  <span className="block text-fg-3">{reached ? "given" : r.says}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t border-line px-4 py-3">
        <label className="sr-only" htmlFor="tutor-input">
          Ask the Tutor
        </label>
        <textarea
          id="tutor-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          rows={2}
          placeholder={exercise ? `Ask about “${exercise.title}”…` : "Ask a question…"}
          className="min-w-0 flex-1 resize-none rounded-lg border border-line-strong bg-ground px-3 py-2 text-sm text-fg"
        />
        {busy ? (
          <Button onClick={() => stop.current?.abort()}>Stop</Button>
        ) : (
          <Button variant="primary" type="submit" disabled={!draft.trim()}>
            Send
          </Button>
        )}
      </form>
    </aside>
  );
}
