import { useEffect, useState } from "react";
import type { Exercise, Lesson } from "../../shared/content.ts";
import type { ReviewItem } from "../../shared/progress.ts";
import { EXERCISES } from "../../shared/registry.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { EXERCISE_COMPONENTS } from "../exercises/registry.ts";
import { href } from "../router.ts";
import { useApp } from "../state.tsx";
import { Notice, Tick } from "../ui.tsx";

// Today's review: the concepts that have fallen due, one exercise each
// (web/shared/progress.ts reviewSession says which). Each is a fresh
// attempt, checked and recorded like any other; the record is the review.
// The session is taken once, when the page opens, so a solved item stays
// on the page; the count in the header moves as each one is done. A
// session holds at most REVIEW_SIZE; when more are due, the next batch is
// offered once this one is done, so the header and the page agree.

export function Review() {
  const { content, markSolved, reloadProgress } = useApp();
  const [session, setSession] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  // The latest count, for "more are due" once this session is done.
  const { review } = useApp();
  useEffect(() => {
    let live = true;
    void reloadProgress().then((p) => {
      if (!live) return;
      if (p) setSession(p.review);
      else setError("The review could not be loaded. Is the server running?");
    });
    return () => {
      live = false;
    };
  }, [reloadProgress]);

  const items = (session ?? []).flatMap((item) => {
    const lesson = content.lessons.find((l) => l.id === item.lessonId);
    const exercise = lesson?.exercises.find((e) => e.id === item.exerciseId);
    return lesson && exercise ? [{ item, lesson, exercise }] : [];
  });
  const conceptsDone = items.filter(({ item }) => done.has(`${item.lessonId}/${item.exerciseId}`)).length;

  return (
    <div className="mx-auto flex max-w-[2400px] flex-col gap-6" data-review-page>
      <header>
        <h1 className="text-4xl font-semibold text-fg">Review</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-2">
          What you have learned comes back after a day, then three, then a week and longer, each time you prove it again. A miss brings it back tomorrow.
        </p>
      </header>
      {error && <Notice tone="bad">{error}</Notice>}
      {session === null && !error && <p className="text-fg-3">Loading…</p>}
      {session !== null && items.length === 0 && (
        <Notice tone="good">
          <span data-review-empty>Nothing is due today.</span> A concept joins the review once you have mastered it.{" "}
          <a className="font-semibold text-accent underline" href={href("home")}>
            Back to the Path
          </a>
        </Notice>
      )}
      {items.length > 0 && (
        <p className="text-sm text-fg-3" data-review-progress>
          {conceptsDone} of {items.length} done.
        </p>
      )}
      {items.map(({ item, lesson, exercise }, i) => (
        <ReviewExercise
          key={`${item.lessonId}/${item.exerciseId}`}
          lesson={lesson}
          exercise={exercise}
          number={i + 1}
          done={done.has(`${item.lessonId}/${item.exerciseId}`)}
          onSolved={(body) => {
            markSolved(lesson.id, exercise.id, body);
            setDone((d) => new Set(d).add(`${item.lessonId}/${item.exerciseId}`));
            reloadProgress();
          }}
        />
      ))}
      {items.length > 0 && conceptsDone === items.length && (
        <Notice tone="good">
          {review.length > 0 ? (
            <span className="flex flex-wrap items-center gap-3">
              <span>
                That is {items.length} done. {review.length} more {review.length === 1 ? "is" : "are"} due today.
              </span>
              <button
                type="button"
                data-review-next
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                onClick={() => {
                  setDone(new Set());
                  setSession(review);
                  window.scrollTo(0, 0);
                }}
              >
                Go on
              </button>
            </span>
          ) : (
            "Today's review is done."
          )}
        </Notice>
      )}
    </div>
  );
}

function ReviewExercise({ lesson, exercise, number, done, onSolved }: { lesson: Lesson; exercise: Exercise; number: number; done: boolean; onSolved: (body: string) => void }) {
  const Kind = EXERCISE_COMPONENTS[exercise.kind];
  return (
    <section data-exercise={exercise.id} className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          {EXERCISES[exercise.kind].label} · {number}
          {done && <Tick className="h-4 w-4 text-good" />}
        </div>
        <h3 className="text-xl font-semibold text-fg">{exercise.title}</h3>
        <p className="text-sm text-fg-3">
          From{" "}
          <a className="text-accent underline-offset-2 hover:underline" href={href("lesson", lesson.id)}>
            {lesson.title}
          </a>
        </p>
      </div>
      <ErrorBoundary label={`exercise ${exercise.id}`}>
        <Kind lessonId={lesson.id} exercise={exercise} onSolved={onSolved} />
      </ErrorBoundary>
    </section>
  );
}
