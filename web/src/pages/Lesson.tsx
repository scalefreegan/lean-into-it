import type { Exercise, Lesson as LessonType } from "../../shared/content.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";
import { Markdown, SpokenMarkdown } from "../markdown.tsx";
import { ReadingLineContext } from "../listen/data.ts";
import { exerciseSpeech, useLessonReading } from "../listen/useLessonReading.ts";
import { EXERCISES } from "../../shared/registry.ts";
import { EXERCISE_COMPONENTS } from "../exercises/registry.ts";
import { href } from "../router.ts";
import { solvedOf } from "../../shared/progress.ts";
import { LevelLock } from "./LevelLock.tsx";
import { lessonProgress, useApp } from "../state.tsx";
import { Notice, Tick } from "../ui.tsx";
import { RenderWidget } from "../widgets/RenderWidget.tsx";
import { useTouch } from "../tutor/store.ts";

// A lesson: prose, widgets and exercises in the order the file gives them. Lean
// checks each exercise; a solved one is remembered (state.tsx markSolved,
// and the server has already stored it). With Listen mode on, the
// transport's Play reads it aloud from the top (listen/useLessonReading.ts).

export function Lesson({ id }: { id: string }) {
  const { content, solved, levels, markSolved, reloadProgress } = useApp();
  const index = content.lessons.findIndex((l) => l.id === id);
  const lesson: LessonType | undefined = content.lessons[index];
  // A lesson in a locked level shows what opens it instead of its exercises, and is not read.
  const status = lesson ? levels.find((s) => s.level === lesson.level) : undefined;
  const lockedBy = status?.state === "locked" ? status : null;
  const reading = useLessonReading(lesson, !lockedBy);
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
  /** Under a widget or an exercise the reading has stopped at: how to go on. */
  const waitNote = (i: number) =>
    reading.waitingAt === i && (
      <p role="status" data-reading-waiting className="mt-2 rounded-lg bg-accent-soft px-3 py-1.5 text-sm text-fg">
        The reading waits here. Press Play at the foot of the page to go on.
      </p>
    );

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

      {lockedBy ? (
        <section data-lesson-locked className="rounded-2xl border border-line bg-panel p-5">
          <p className="font-semibold text-fg">Level {lesson.level} is not open yet.</p>
          <LevelLock status={lockedBy} />
        </section>
      ) : (
        lesson.blocks.map((block, i) => {
        if (block.type === "prose") {
          // Running text keeps a readable line length; the proofs below it use the full width.
          return (
            <div key={i} className="min-w-0 scroll-my-24" data-reading-block={i}>
              {reading.active?.block === i ? <SpokenMarkdown source={block.markdown} activeWord={reading.active.word} /> : <Markdown source={block.markdown} />}
            </div>
          );
        }
        if (block.type === "widget") {
          return (
            <div key={i} className="min-w-0 scroll-my-24" data-reading-block={i}>
              <RenderWidget type={block.widget} params={block.params} />
              {waitNote(i)}
            </div>
          );
        }
        const exercise = lesson.exercises.find((e) => e.id === block.id);
        if (!exercise) return null;
        // The claim's words come after the title's in what is spoken.
        const word = reading.active?.block === i && reading.active.word !== null ? reading.active.word - exerciseSpeech(exercise.title, exercise.says).titleWords : null;
        return (
          <ReadingLineContext.Provider key={block.id} value={reading.active?.block === i ? { id: exercise.id, word: word !== null && word >= 0 ? word : null } : null}>
          <div className="min-w-0 scroll-my-24" data-reading-block={i}>
          <ExerciseBlock
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
          {waitNote(i)}
          </div>
          </ReadingLineContext.Provider>
        );
        })
      )}

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
