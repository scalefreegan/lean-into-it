import { useEffect, useState, type ReactNode } from "react";
import type { Lesson, Level } from "../../shared/content.ts";
import { levelOpen, lessonCredited, lessonMastered, lessonMastery, type LevelStatus } from "../../shared/progress.ts";
import { href } from "../router.ts";
import { lessonProgress, useApp } from "../state.tsx";
import { CraftBadge, cx, MasteryBar, Notice, Tick } from "../ui.tsx";
import { LevelLock } from "./LevelLock.tsx";

// The Path: every level in order, the lessons written so far, and what each
// unwritten level will cover. A level opens as the one before it is
// mastered (web/shared/progress.ts levelStatuses); a locked one says what it
// needs, and can be opened anyway.
//
// A card folds down to its heading. Unless the learner has said otherwise,
// only the level with the next lesson in it is unfolded, so the page starts
// short and at the right place. What they fold and unfold is remembered in
// this browser. Opened at a level (#/level/<id>, from a Famous Proofs entry),
// that level is unfolded too and scrolled to.

const OFFER_KEY = "lean-into-it:placement-offer-hidden";
const FOLD_KEY = "lean-into-it:levels-unfolded";

/** The learner's own choices, level id to unfolded; empty when none are kept or storage is unavailable. */
function readFolds(): Record<string, boolean> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}");
    if (!kept || typeof kept !== "object" || Array.isArray(kept)) return {};
    return Object.fromEntries(Object.entries(kept).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function Home({ focus }: { focus?: number } = {}) {
  const { content, solved, levels, mastery, placed, reloadProgress } = useApp();
  // First run: nothing tried and no placement yet. "Not now" hides it here; the link under the header stays.
  const [offerHidden, setOfferHidden] = useState(() => {
    try {
      return localStorage.getItem(OFFER_KEY) === "1";
    } catch {
      return false;
    }
  });
  // Opened at a level, it starts unfolded (kept only once the learner folds or unfolds something).
  const [folds, setFolds] = useState(() => (focus === undefined ? readFolds() : { ...readFolds(), [focus]: true }));
  // Each change is made to the choices as they are then, not as they were when the page was last drawn.
  const changeFolds = (change: (kept: Record<string, boolean>) => Record<string, boolean>) =>
    setFolds((kept) => {
      const next = change(kept);
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(next));
      } catch {
        // Not kept: the page starts from its own choice next time.
      }
      return next;
    });
  const firstRun = !placed && Object.keys(mastery.concepts).length === 0;
  useEffect(() => void reloadProgress(), [reloadProgress]);
  // The first lesson not done in an open level, passing over any the
  // placement check credited and that has not been tried since.
  const next = content.lessons.find((l) => levelOpen(levels, l.level) && !lessonProgress(l, solved).complete && !lessonCredited(l, mastery)) ?? null;
  const total = content.lessons.reduce((n, l) => n + l.exercises.length, 0);
  const done = content.lessons.reduce((n, l) => n + lessonProgress(l, solved).done, 0);
  const unfolded = (level: Level) => folds[level.id] ?? (next !== null && next.level === level.id);
  // Again once the levels are there: the page can be drawn before the content has come.
  const drawn = content.levels.length;
  useEffect(() => {
    if (focus !== undefined) document.querySelector(`[data-level="${focus}"]`)?.scrollIntoView({ block: "start" });
  }, [focus, drawn]);
  const allUnfolded = content.levels.every(unfolded);

  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold text-fg">The Path</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-2">
          From what a proof is, through logic, numbers and calculus, to proving that programs do what they say. Lean checks every step.
        </p>
        <p className="mt-3 text-sm text-fg-3" data-progress>
          {done} of {total} proofs done.
          {next && (
            <>
              {" "}
              <a className="font-semibold text-accent underline-offset-2 hover:underline" href={href("lesson", next.id)}>
                {done ? "Continue" : "Start"}: {next.title}
              </a>
            </>
          )}
          <span className="mx-2 text-line-strong">·</span>
          <a className="text-accent underline-offset-2 hover:underline" href={href("placement")} data-placement-link>
            {placed ? "Take the placement check again" : "Placement check"}
          </a>
        </p>
      </header>

      {firstRun && !offerHidden && (
        <section data-placement-offer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent bg-accent-soft p-5">
          <p className="max-w-2xl text-fg">
            <span className="font-semibold">Know some of this already?</span> A short placement check, a few proofs from each level, lets you skip the levels you know. Lean checks every answer.
          </p>
          <span className="flex gap-3">
            <a className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover" href={href("placement")}>
              Take the placement check
            </a>
            <button
              type="button"
              data-placement-dismiss
              className="rounded-lg px-3 py-2 text-sm font-semibold text-fg-2 hover:bg-raised"
              onClick={() => {
                setOfferHidden(true);
                try {
                  localStorage.setItem(OFFER_KEY, "1");
                } catch {
                  // Not kept: it is offered again next time.
                }
              }}
            >
              Not now
            </button>
          </span>
        </section>
      )}

      {content.problems.length > 0 && (
        <Notice tone="warn">
          <p className="font-semibold">Some lesson files could not be loaded:</p>
          <ul className="mt-1 list-disc pl-5">
            {content.problems.map((p, i) => (
              <li key={i}>
                <code className="font-mono text-xs">{p.file}</code>: {p.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="-mb-3 flex justify-end">
        <button
          type="button"
          data-levels-all
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-fg-2 hover:bg-raised"
          onClick={() => changeFolds(() => Object.fromEntries(content.levels.map((l) => [l.id, !allUnfolded])))}
        >
          {allUnfolded ? "Close all levels" : "Open all levels"}
        </button>
      </div>

      {/* One level to a row, in order, so folding one never moves another
          sideways. An unfolded level's lessons go in two columns where there is room. */}
      <div className="flex flex-col gap-3">
        {content.levels.map((level) => (
          <LevelCard
            key={level.id}
            level={level}
            status={levels.find((s) => s.level === level.id)}
            lessons={content.lessons.filter((l) => l.level === level.id)}
            nextId={next?.id ?? null}
            unfolded={unfolded(level)}
            onFold={(to) => changeFolds((kept) => ({ ...kept, [level.id]: to }))}
          />
        ))}
      </div>
    </div>
  );
}

function LevelCard({
  level,
  status,
  lessons,
  nextId,
  unfolded,
  onFold,
}: {
  level: Level;
  status: LevelStatus | undefined;
  lessons: Lesson[];
  nextId: string | null;
  unfolded: boolean;
  onFold: (unfolded: boolean) => void;
}) {
  const { content, solved, mastery } = useApp();
  const trackTitle = (id: string) => content.tracks.find((t) => t.id === id)?.title ?? id;
  const written = lessons.length > 0;
  const locked = written && status?.state === "locked";
  const lit = written && !locked;
  const lessonsDone = lessons.filter((l) => lessonProgress(l, solved).complete).length;
  const bodyId = `level-${level.id}-body`;
  return (
    <section
      data-level={level.id}
      data-level-state={written ? (status?.state ?? "open") : "outline"}
      data-level-unfolded={unfolded}
      className={cx("rounded-2xl border bg-panel", lit ? "border-line-strong shadow-sm" : "border-line")}
    >
      {/* The whole heading is the control. The h2 keeps the level in the page's outline. */}
      <h2>
        <button
          type="button"
          aria-expanded={unfolded}
          aria-controls={bodyId}
          onClick={() => onFold(!unfolded)}
          className={cx("flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl px-5 text-left hover:bg-raised", unfolded ? "pt-5 pb-1" : "py-4")}
        >
          <span aria-hidden="true" className={cx("w-3 shrink-0 self-center text-xs text-fg-3 transition-transform", unfolded && "rotate-90")}>
            ▶
          </span>
          <span className={cx("font-mono text-sm font-semibold", lit ? "text-accent" : "text-fg-3")}>Level {level.id}</span>
          <span className={cx("font-semibold", unfolded ? "text-2xl" : "text-xl", lit ? "text-fg" : "text-fg-2")}>{level.title}</span>
          {!written && <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-fg-3">outlined</span>}
          {locked && <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-fg-3">locked</span>}
          {status?.state === "done" && <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">done</span>}
          {written && (
            <span className="ml-auto font-mono text-xs font-normal text-fg-3" data-level-count>
              {lessonsDone}/{lessons.length} lessons
            </span>
          )}
        </button>
      </h2>
      <div id={bodyId} hidden={!unfolded} className="px-5 pb-5">
        <p className="mt-1 text-fg-2">{level.summary}</p>

        {level.moves.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
            <span className="font-semibold uppercase tracking-wide">Moves</span>
            {level.moves.map((m) => (
              <span key={m} className="rounded-full border border-line px-2 py-0.5 font-mono text-fg-2">
                {m}
              </span>
            ))}
          </p>
        )}

        {locked && status && <LevelLock status={status} />}

        {written && (
          <ul className="mt-4 grid gap-2 xl:grid-cols-2">
            {lessons.map((lesson) => {
              const p = lessonProgress(lesson, solved);
              const known = lessonMastery(lesson, mastery);
              return (
                <li key={lesson.id}>
                  {/* A locked level's lessons are listed, not linked: the card says how to open it. */}
                  <LessonRow
                    locked={locked}
                    href={href("lesson", lesson.id)}
                    data-lesson={lesson.id}
                    className={cx(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                      locked ? "border-line opacity-70" : lesson.id === nextId ? "border-accent bg-accent-soft hover:bg-raised" : "border-line hover:bg-raised",
                    )}
                  >
                    {p.complete ? <Tick className="shrink-0 text-good" /> : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-line-strong" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-fg">
                        {lesson.title}
                        {lesson.craft && <CraftBadge className="ml-2" />}
                      </span>
                      <span className="block text-sm text-fg-3">{lesson.summary}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-fg-3">
                      <span className="block">{trackTitle(lesson.track)}</span>
                      <span className="block font-mono">
                        {p.done}/{p.total}
                      </span>
                      {known !== null && (
                        <span className="mt-1 block">
                          <MasteryBar value={known} mastered={lessonMastered(lesson, mastery)} label={`${lesson.title} mastery`} />
                        </span>
                      )}
                    </span>
                  </LessonRow>
                </li>
              );
            })}
          </ul>
        )}

        {level.topics.length > 0 && (
          <details className="mt-4" open={!written && level.id === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-fg-3">{written ? "Still to come in this level" : "What this level will cover"}</summary>
            <ul className="mt-2 list-disc pl-5 text-sm text-fg-2">
              {level.topics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        )}

        <LevelPlan level={level} />
      </div>
    </section>
  );
}

/** A level's plan from curriculum.yaml: the lessons still to write, and the
 *  concepts it will teach with what each builds on. Listed, not linked. */
function LevelPlan({ level }: { level: Level }) {
  const { content } = useApp();
  const toWrite = level.planned.filter((p) => !content.lessons.some((l) => l.id === p.id));
  const trackTitle = (id: string) => content.tracks.find((t) => t.id === id)?.title ?? id;
  const toBuild = new Set(content.levels.flatMap((l) => l.newWidgets.map((w) => w.id)));
  const declared = new Map(content.levels.flatMap((l) => l.concepts.map((c) => [c.id, c.title] as const)));
  // A concept only a lesson names has no title of its own: the first lesson teaching it gives one.
  const named = (id: string) => declared.get(id) ?? content.lessons.find((l) => l.concepts.includes(id))?.title ?? id;
  if (!toWrite.length && !level.concepts.length) return null;
  return (
    <>
      {toWrite.length > 0 && (
        <div className="mt-4" data-level-planned>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-3">Lessons to write</h3>
          <ul className="mt-2 grid gap-2 xl:grid-cols-2">
            {toWrite.map((p) => (
              <li key={p.id} data-planned-lesson={p.id} className="flex items-start gap-3 rounded-xl border border-dashed border-line px-4 py-3">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-line-strong" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg-2">{p.title}</span>
                  {p.summary && <span className="block text-sm text-fg-3">{p.summary}</span>}
                  {p.widgets.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1 text-xs text-fg-3">
                      {p.widgets.map((w) => (
                        <span key={w} className="rounded-full border border-line px-2 py-0.5 font-mono">
                          {w}
                          {toBuild.has(w) && " (to build)"}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs text-fg-3">{trackTitle(p.track)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {level.concepts.length > 0 && (
        <details className="mt-4" data-level-concepts>
          <summary className="cursor-pointer text-sm font-semibold text-fg-3">Concepts, and what each builds on</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-fg-2">
            {level.concepts.map((c) => (
              <li key={c.id}>
                {c.title}
                {c.needs.length > 0 && <span className="text-fg-3"> — builds on {[...new Set(c.needs.map(named))].join("; ")}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function LessonRow({ locked, href: to, children, ...rest }: { locked: boolean; href: string; className: string; "data-lesson": string; children: ReactNode }) {
  return locked ? (
    <div aria-disabled="true" {...rest}>
      {children}
    </div>
  ) : (
    <a href={to} {...rest}>
      {children}
    </a>
  );
}
