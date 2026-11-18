import type { Exercise, Lesson as LessonType } from "../../shared/content.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { Markdown } from "../markdown.tsx";
import { EXERCISES } from "../../shared/registry.ts";
import { EXERCISE_COMPONENTS } from "../exercises/registry.ts";
import { href } from "../router.ts";
import { solvedOf } from "../../shared/progress.ts";
import { lessonProgress, useApp } from "../state.tsx";
import { Notice, Tick } from "../ui.tsx";
import { RenderWidget } from "../widgets/RenderWidget.tsx";
import { useTouch } from "../tutor/store.ts";

// A lesson: prose, widgets and exercises in the order the file gives them. Lean
// checks each exercise; a solved one is remembered (state.tsx markSolved,
// and the server has already stored it).

export function Lesson({ id }: { id: string }) {
  const { content, solved, markSolved, reloadProgress } = useApp();
  const index = content.lessons.findIndex((l) => l.id === id);
  const lesson = content.lessons[index];
  if (!lesson) {
    return (
      <div className="mx-auto max-w-[2400px]">
        <Notice tone="warn">
          There is no lesson called “{id}”. <a className="font-semibold text-accent underline" href={href("home")}>Back to the Path</a>
        </Notice>
      </div>
    );
  }
  const next = content.lessons[index + 1];
  const progress = lessonProgress(lesson, solved);
  const level = content.levels.find((l) => l.id === lesson.level);
  const track = content.tracks.find((t) => t.id === lesson.track);

  return (
    <article className="mx-auto flex max-w-[2400px] flex-col gap-6" data-lesson-page={lesson.id}>
      <header>
        <p className="text-sm text-fg-3">
          <a className="text-accent underline-offset-2 hover:underline" href={href("home")}>
            The Path
          </a>{" "}
          · Level {lesson.level}
          {level ? `: ${level.title}` : ""} · {track?.title ?? lesson.track}
        </p>
        <h1 className="mt-1 text-4xl font-semibold text-fg">{lesson.title}</h1>
        <p className="mt-2 text-lg text-fg-2">{lesson.summary}</p>
      </header>

      {lesson.blocks.map((block, i) => {
        if (block.type === "prose") {
          // Running text keeps a readable line length; the proofs below it use the full width.
          return (
            <div key={i} className="min-w-0">
              <Markdown source={block.markdown} />
            </div>
          );
        }
        if (block.type === "widget") return <RenderWidget key={i} type={block.widget} params={block.params} />;
        const exercise = lesson.exercises.find((e) => e.id === block.id);
        if (!exercise) return null;
        return (
          <ExerciseBlock
            key={block.id}
            lesson={lesson}
            exercise={exercise}
            number={lesson.exercises.indexOf(exercise) + 1}
            solution={solvedOf(solved, lesson.id, exercise.id)?.solution}
            onSolved={(body) => {
              markSolved(lesson.id, exercise.id, body);
              // A solve can clear a concept due for review: the count in the header follows.
              void reloadProgress();
            }}
          />
        );
      })}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="flex items-center gap-2 text-fg-2" data-lesson-progress>
          {progress.complete && <Tick className="text-good" />}
          {progress.complete ? "Lesson complete." : `${progress.done} of ${progress.total} proofs done.`}
        </p>
        <a className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover" href={next ? href("lesson", next.id) : href("home")}>
          {next ? `Next: ${next.title}` : "Back to the Path"}
        </a>
      </footer>
    </article>
  );
}

function ExerciseBlock({ lesson, exercise, number, solution, onSolved }: { lesson: LessonType; exercise: Exercise; number: number; solution?: string; onSolved: (body: string) => void }) {
  // What kind of exercise this is, and so what it is called and how it is
  // drawn, comes from the registry and its table of components.
  const Kind = EXERCISE_COMPONENTS[exercise.kind];
  const touch = useTouch(lesson.id, exercise.id);
  return (
    <section data-exercise={exercise.id} className="flex flex-col gap-3" {...touch}>
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          {EXERCISES[exercise.kind].label} · {number}
          {solution !== undefined && <Tick className="h-4 w-4 text-good" />}
        </div>
        <h3 className="text-xl font-semibold text-fg">{exercise.title}</h3>
      </div>
      <ErrorBoundary label={`exercise ${exercise.id}`}>
        <Kind lessonId={lesson.id} exercise={exercise} onSolved={onSolved} {...(solution !== undefined ? { solution } : {})} />
      </ErrorBoundary>
    </section>
  );
}
