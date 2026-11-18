import { useEffect } from "react";
import type { Lesson, Level } from "../../shared/content.ts";
import { lessonMastered, lessonMastery } from "../../shared/progress.ts";
import { href } from "../router.ts";
import { lessonProgress, useApp } from "../state.tsx";
import { cx, MasteryBar, Notice, Tick } from "../ui.tsx";

// The Path: every level in order, the lessons written so far, and what each
// unwritten level will cover.

export function Home() {
  const { content, solved, reloadProgress } = useApp();
  useEffect(reloadProgress, [reloadProgress]);
  const next = content.lessons.find((l) => !lessonProgress(l, solved).complete) ?? null;
  const total = content.lessons.reduce((n, l) => n + l.exercises.length, 0);
  const done = content.lessons.reduce((n, l) => n + lessonProgress(l, solved).done, 0);

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
        </p>
      </header>

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

      {/* Two columns where there is room; levels read left to right, then down. */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {content.levels.map((level) => (
          <LevelCard key={level.id} level={level} lessons={content.lessons.filter((l) => l.level === level.id)} nextId={next?.id ?? null} />
        ))}
      </div>
    </div>
  );
}

function LevelCard({ level, lessons, nextId }: { level: Level; lessons: Lesson[]; nextId: string | null }) {
  const { content, solved, mastery } = useApp();
  const trackTitle = (id: string) => content.tracks.find((t) => t.id === id)?.title ?? id;
  const written = lessons.length > 0;
  return (
    <section data-level={level.id} className={cx("rounded-2xl border bg-panel p-5", written ? "border-line-strong shadow-sm" : "border-line")}>
      <div className="flex items-baseline gap-3">
        <span className={cx("font-mono text-sm font-semibold", written ? "text-accent" : "text-fg-3")}>Level {level.id}</span>
        <h2 className={cx("text-2xl font-semibold", written ? "text-fg" : "text-fg-2")}>{level.title}</h2>
        {!written && <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-fg-3">outlined</span>}
      </div>
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

      {written && (
        <ul className="mt-4 flex flex-col gap-2">
          {lessons.map((lesson) => {
            const p = lessonProgress(lesson, solved);
            const known = lessonMastery(lesson, mastery);
            return (
              <li key={lesson.id}>
                <a
                  href={href("lesson", lesson.id)}
                  data-lesson={lesson.id}
                  className={cx(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-raised",
                    lesson.id === nextId ? "border-accent bg-accent-soft" : "border-line",
                  )}
                >
                  {p.complete ? <Tick className="shrink-0 text-good" /> : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-line-strong" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{lesson.title}</span>
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
                </a>
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
    </section>
  );
}
