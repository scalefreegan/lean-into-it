import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ResearchClaim, ResearchMap, ResearchSource } from "../../shared/research.ts";
import type { ResearchListReply } from "../../shared/wire.ts";
import { ApiError, deleteResearchMap, researchMap, researchMaps, startResearch, stopResearch } from "../api/client.ts";
import { href } from "../router.ts";
import { Button, cx, Notice } from "../ui.tsx";

// Field notes (#/notes, #/notes/<id>): the Tutor's research maps of results
// in the news, made from the web and kept with their sources and date
// (web/server/research.ts). The app says nothing of its own about any
// result: every line of a map is the Tutor's, with the sources it read.

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export function FieldNotes({ id }: { id?: number }) {
  const [list, setList] = useState<ResearchListReply | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const reload = useCallback(() => researchMaps().then(setList, (e: Error) => setListError(e.message)), []);
  useEffect(() => void reload(), [reload]);
  // A run goes on on the server whatever page is open: while it does, ask how it is going.
  const running = list?.job?.running ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold text-fg">Field notes</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-2">
          Ask about a result in the news, an AI-assisted proof or a newly formalised theorem, and the Tutor searches the web and maps it: what was claimed, what was formally verified and in
          which system, which ideas of your path it rests on, and what is still open. Every claim cites its sources; the map says what it could not confirm.
        </p>
      </header>
      {id === undefined ? (
        <>
          <Ask list={list} reload={reload} />
          {listError && <Notice tone="bad">{listError}</Notice>}
          {list && <Saved maps={list.maps} />}
        </>
      ) : (
        <MapPage id={id} onDeleted={() => void reload()} />
      )}
    </div>
  );
}

function Ask({ list, reload }: { list: ResearchListReply | null; reload: () => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null);
  const job = list?.job ?? null;
  const running = job?.running ?? false;
  const otherTurn = (list?.busy ?? false) && !running;
  const ask = () => {
    const q = question.trim();
    if (!q || running) return;
    setError(null);
    startResearch(q).then(
      () => {
        setQuestion("");
        void reload();
      },
      (e: Error) => setError({ text: e.message, offline: e instanceof ApiError && e.code === "offline" }),
    );
  };
  return (
    <section className="rounded-2xl border border-line-strong bg-panel p-5" data-research-ask>
      <label htmlFor="research-question" className="text-sm font-semibold text-fg">
        Which result?
      </label>
      <textarea
        id="research-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={1000}
        rows={3}
        disabled={running}
        placeholder="e.g. the AI system that proved an olympiad problem in Lean, or a theorem newly formalised in Mathlib"
        className="mt-2 w-full rounded-xl border border-line-strong bg-raised px-3 py-2 text-fg placeholder:text-fg-3"
      />
      <p className="mt-2 text-xs text-fg-3">What you type here goes to a web search. Needs the internet; a map takes a few minutes, and goes on if you leave this page.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={ask} disabled={running || otherTurn || !question.trim()}>
          Map it
        </Button>
        {running && <Button onClick={() => void stopResearch().then(reload)}>Stop</Button>}
        {otherTurn && <span className="text-sm text-fg-3">The Tutor is busy with another turn.</span>}
      </div>
      <div className="mt-3" aria-live="polite">
        {running && job && (
          <p className="text-sm text-fg-2" data-research-running>
            Searching and reading sources for “{job.question}”…
          </p>
        )}
        {!running && job?.mapId !== undefined && (
          <p className="text-sm text-fg-2" data-research-done>
            The map of “{job.question}” is ready:{" "}
            <a href={href("notes", String(job.mapId))} className="font-semibold text-accent hover:underline">
              open it
            </a>
            .{" "}
            <button type="button" onClick={() => void stopResearch().then(reload)} className="font-semibold text-fg-3 hover:underline">
              Dismiss
            </button>
          </p>
        )}
        {!running && job?.error && (
          <div data-research-failed>
            <Notice tone={job.error.startsWith(OFFLINE_HINT_START) || job.error === "Stopped." ? "warn" : "bad"}>
              {job.error === "Stopped." ? `Stopped: “${job.question}” was not mapped.` : `“${job.question}” was not mapped. ${job.error}`}{" "}
              <button type="button" onClick={() => void stopResearch().then(reload)} className="font-semibold underline">
                Dismiss
              </button>
            </Notice>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone={error.offline ? "warn" : "bad"} live={error.offline ? "status" : "alert"}>
            {error.text}
          </Notice>
        </div>
      )}
    </section>
  );
}

/** The server's offline sentence starts so (web/server/research.ts OFFLINE). */
const OFFLINE_HINT_START = "Research maps need the internet";

function Saved({ maps }: { maps: ResearchListReply["maps"] }) {
  if (!maps.length) return <p className="text-fg-3">No maps yet.</p>;
  return (
    <section>
      <h2 className="text-xl font-semibold text-fg">Saved maps</h2>
      <ul className="mt-2 flex flex-col divide-y divide-line rounded-2xl border border-line-strong bg-panel">
        {maps.map((m) => (
          <li key={m.id}>
            <a href={href("notes", String(m.id))} data-research-map={m.id} className="block px-5 py-3 hover:bg-raised">
              <span className="block font-semibold text-fg">{m.title}</span>
              <span className="block text-sm text-fg-3">
                {day(m.madeAt)} · {m.question}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MapPage({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const [map, setMap] = useState<ResearchMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [map]);
  useEffect(() => {
    researchMap(id).then(setMap, (e: Error) => setError(e.message));
  }, [id]);
  const back = (
    <a href={href("notes")} className="text-sm font-semibold text-accent hover:underline">
      ← All field notes
    </a>
  );
  if (error)
    return (
      <>
        {back}
        <Notice tone="bad">{error}</Notice>
      </>
    );
  if (!map) return back;
  const remove = () =>
    deleteResearchMap(id).then(
      () => {
        onDeleted();
        window.location.hash = href("notes");
      },
      (e: Error) => setError(e.message),
    );
  return (
    <article className="flex flex-col gap-5" data-research-view={map.id}>
      {back}
      <header>
        <h2 ref={heading} tabIndex={-1} className="text-3xl font-semibold text-fg outline-none">
          {map.title}
        </h2>
        <p className="mt-1 text-sm text-fg-3">
          Made {day(map.madeAt)} from the sources below. Asked: “{map.question}”
        </p>
        {map.summary && (
          <p className="mt-3 text-lg text-fg-2">
            <span className="text-sm font-semibold text-fg-3">In the Tutor's words: </span>
            {map.summary}
          </p>
        )}
      </header>

      <Part title="Claimed" note="Announced, argued or reported: not checked by a proof assistant." data="claimed">
        <Claims items={map.claimed} sources={map.sources} empty="No claims with a source." />
      </Part>

      <Part title="Formally verified" note="Checked by a proof assistant, and which one." data="verified">
        {map.verified.length > 0 && (
          <ul className="flex flex-col gap-2">
            {map.verified.map((v, i) => (
              <li key={i} className="text-fg-2">
                <span className="mr-2 rounded-full border border-good bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">{v.system}</span>
                {v.text}
                <Cites n={v.sources} sources={map.sources} />
              </li>
            ))}
          </ul>
        )}
        {map.verifiedNote && (
          <p className={cx("text-fg-2", map.verified.length > 0 && "mt-3")}>
            {map.verified.length > 0 && <span className="text-sm font-semibold text-fg-3">The Tutor's note: </span>}
            {map.verifiedNote}
          </p>
        )}
      </Part>

      <Part title="In your path" note="The ideas it rests on." data="concepts">
        {map.concepts.length ? (
          <ul className="flex flex-col gap-2">
            {map.concepts.map((c) => (
              <li key={c.concept} className="text-fg-2">
                {c.kind === "lesson" ? (
                  <a href={href("lesson", c.lessonId)} className="font-semibold text-accent hover:underline">
                    {c.title}
                  </a>
                ) : (
                  <span>
                    <span className="font-semibold text-fg">{c.title}</span> <span className="text-sm text-fg-3">(Level {c.level}: outlined, not yet written)</span>
                  </span>
                )}
                {c.why && <span> — {c.why}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-3">None of the path's concepts was named.</p>
        )}
      </Part>

      <Part title="Still open or disputed" data="open">
        <Claims items={map.open} sources={map.sources} empty="Nothing open or disputed was found." />
      </Part>

      {map.unconfirmed.length > 0 && (
        <Part title="Could not confirm" data="unconfirmed">
          <ul className="list-disc pl-5 text-fg-2">
            {map.unconfirmed.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Part>
      )}

      <Part title="Sources" data="sources">
        <ol className="flex flex-col gap-2">
          {map.sources.map((s) => (
            <li key={s.n} id={`source-${s.n}`} className="text-sm text-fg-2">
              <span className="mr-2 font-mono text-fg-3">[{s.n}]</span>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-accent hover:underline">
                {s.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {(s.publisher || s.date) && <span className="text-fg-3"> · {[s.publisher, s.date].filter(Boolean).join(", ")}</span>}
              {s.private ? (
                <span className="ml-2 text-xs font-semibold text-warn">not opened: not a public address</span>
              ) : s.reachable === false ? (
                <span className="ml-2 text-xs font-semibold text-warn">did not open when the map was made</span>
              ) : s.reachable === null ? (
                <span className="ml-2 text-xs font-semibold text-fg-3">not checked in time</span>
              ) : null}
            </li>
          ))}
        </ol>
      </Part>

      <div className="flex items-center gap-3">
        {confirming ? (
          <>
            <span className="text-sm text-fg-2">Delete this map?</span>
            <Button onClick={remove}>Delete</Button>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
          </>
        ) : (
          <Button onClick={() => setConfirming(true)}>Delete this map</Button>
        )}
      </div>
    </article>
  );
}

function Part({ title, note, data, children }: { title: string; note?: string; data: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line-strong bg-panel p-5" data-research-part={data}>
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {note && <p className="text-sm text-fg-3">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Claims({ items, sources, empty }: { items: ResearchClaim[]; sources: ResearchSource[]; empty: string }) {
  if (!items.length) return <p className="text-fg-3">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((c, i) => (
        <li key={i} className="text-fg-2">
          {c.text}
          <Cites n={c.sources} sources={sources} />
        </li>
      ))}
    </ul>
  );
}

function Cites({ n, sources }: { n: number[]; sources: ResearchSource[] }) {
  return (
    <span className="ml-1 whitespace-nowrap">
      {n.map((k) => {
        const s = sources.find((x) => x.n === k);
        return s ? (
          <a key={k} href={s.url} target="_blank" rel="noreferrer noopener" title={s.title} aria-label={`Source ${k}: ${s.title} (opens in a new tab)`} className="ml-0.5 font-mono text-xs text-accent hover:underline">
            [{k}]
          </a>
        ) : null;
      })}
    </span>
  );
}
