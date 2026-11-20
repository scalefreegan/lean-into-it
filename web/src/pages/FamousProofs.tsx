import { useCallback, useEffect, useState } from "react";
import type { GalleryEntry } from "../../shared/content.ts";
import { proofLines, readSteps } from "../../shared/paired.ts";
import type { CheckReply } from "../../shared/wire.ts";
import { galleryCheck } from "../api/client.ts";
import { href } from "../router.ts";
import { useApp } from "../state.tsx";
import { cx, Notice } from "../ui.tsx";
import { PairedView } from "../widgets/InformalFormal.tsx";

// The Lab's Famous Proofs gallery (#/lab/famous, #/lab/famous/<id>): classic
// proofs from content/gallery.yaml, one open at a time, each in words beside
// a Lean proof, with its proof map. Lean is asked through /api/gallery,
// which reads the statement and the proof from the file and records nothing.

/** Mathlib's documentation, opened at a name. */
const mathlibDocs = (name: string) => `https://leanprover-community.github.io/mathlib4_docs/find/?pattern=${encodeURIComponent(name)}#doc`;

export function FamousProofs({ id }: { id?: string }) {
  const { content } = useApp();
  const entries = content.gallery ?? [];
  const entry = id ? entries.find((e) => e.id === id) : entries[0];
  return (
    <div className="flex flex-col gap-6" data-famous>
      <nav aria-label="Famous proofs" className="flex flex-wrap gap-2">
        {entries.map((e) => {
          const on = e.id === entry?.id;
          return (
            <a
              key={e.id}
              href={href("lab", "famous", e.id)}
              data-famous-entry={e.id}
              aria-current={on ? "page" : undefined}
              className={cx("rounded-lg border px-3 py-1.5 text-sm transition-colors", on ? "border-accent bg-accent-soft font-semibold text-fg" : "border-line bg-panel text-fg-2 hover:bg-raised")}
            >
              {e.title}
            </a>
          );
        })}
      </nav>
      {!entry ? (
        <Notice tone="warn">{entries.length ? `There is no famous proof called “${id}”.` : "The gallery is empty: content/gallery.yaml has no entries."}</Notice>
      ) : (
        <Entry key={entry.id} entry={entry} />
      )}
    </div>
  );
}

function Entry({ entry }: { entry: GalleryEntry }) {
  const { content } = useApp();
  const level = content.levels.find((l) => l.id === entry.level);
  const lines = proofLines(entry.solution);
  const { steps } = readSteps(entry.steps, lines.length);
  // The whole proof checked once, for its map; then the goals after a line, on asking.
  const [checked, setChecked] = useState<{ reply: CheckReply | null; error: string | null } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    galleryCheck({ id: entry.id }, ctrl.signal)
      .then((reply) => setChecked({ reply, error: null }))
      .catch((e: Error) => !ctrl.signal.aborted && setChecked({ reply: null, error: e.message }));
    return () => ctrl.abort();
  }, [entry.id]);
  const ask = useCallback(
    async (line: number, signal: AbortSignal) => (await galleryCheck({ id: entry.id, cursor: { line: line - 1, character: proofLines(entry.solution)[line - 1].length } }, signal)).cursorGoals,
    [entry.id, entry.solution],
  );
  const reply = checked?.reply;
  return (
    <article data-famous-proof={entry.id} className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold text-fg">{entry.title}</h2>
        <p className="mt-1 text-lg text-fg-2">{entry.says}</p>
      </header>
      <dl className="grid max-w-[96ch] gap-x-6 gap-y-2 text-fg-2 sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-fg">Who</dt>
        <dd>{entry.who}</dd>
        <dt className="font-semibold text-fg">Why it matters</dt>
        <dd>{entry.why}</dd>
        <dt className="font-semibold text-fg">To follow the Lean</dt>
        <dd data-famous-level={entry.level}>
          <a className="font-semibold text-accent underline-offset-2 hover:underline" href={href("level", String(entry.level))}>
            Level {entry.level}
            {level ? `: ${level.title}` : ""}
          </a>
          {level?.status === "outline" ? " (still to be written)" : ""}
        </dd>
        {(entry.formal || entry.mathlib) && (
          <>
            <dt className="font-semibold text-fg">The Lean statement</dt>
            <dd>
              {entry.formal}
              {entry.mathlib && (
                <>
                  {entry.formal ? " " : ""}
                  In Mathlib:{" "}
                  <a className="font-mono text-sm text-accent underline-offset-2 hover:underline" href={mathlibDocs(entry.mathlib)} target="_blank" rel="noreferrer" data-famous-mathlib>
                    {entry.mathlib}
                  </a>
                  .
                </>
              )}
            </dd>
          </>
        )}
      </dl>
      {checked?.error ? (
        <Notice tone="warn">{`Lean could not check this proof: ${checked.error}`}</Notice>
      ) : reply && !reply.solved ? (
        // The tests hold every entry to Lean; this is a gallery.yaml edited since.
        <Notice tone="warn">{`Lean does not accept this proof as written${reply.error ? `: ${reply.error.message.split("\n")[0]}` : ""}.`}</Notice>
      ) : null}
      <PairedView statement={entry.statement} lines={lines} steps={steps} ask={ask} map={reply?.map ?? null} caption={checked ? undefined : "Lean is checking the proof; its map appears below when it has."} />
    </article>
  );
}
