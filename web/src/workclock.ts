import { useEffect } from "react";
import { WorkClock } from "../shared/clock.ts";

// One working-time clock (web/shared/clock.ts) per exercise on the page,
// kept while the exercise is shown. useTouch starts it (the learner's first
// click or keystroke in the exercise), and api/client.ts `check` sends its
// reading with every check that is an attempt.

const clocks = new Map<string, { clock: WorkClock; shown: number }>();
const keyOf = (lessonId: string, exerciseId: string) => `${lessonId}\u0000${exerciseId}`;
const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    for (const { clock } of clocks.values()) clock.visible(visible());
  });
}

/** Keep a clock for the exercise while it is shown; it goes, and starts again from nothing, when the exercise does. */
export function useWorkClock(lessonId: string, exerciseId: string): void {
  useEffect(() => {
    const key = keyOf(lessonId, exerciseId);
    const had = clocks.get(key);
    if (had) had.shown++;
    else clocks.set(key, { clock: new WorkClock(() => performance.now()), shown: 1 });
    return () => {
      const c = clocks.get(key);
      if (c && --c.shown === 0) clocks.delete(key);
    };
  }, [lessonId, exerciseId]);
}

/** The learner touched the exercise: its clock starts, if it has not. */
export function startWorkClock(lessonId: string, exerciseId: string): void {
  clocks.get(keyOf(lessonId, exerciseId))?.clock.start(visible());
}

/** The working time on the exercise so far, in ms; null if it is not shown or not touched yet. */
export function workedOn(lessonId: string, exerciseId: string): number | null {
  return clocks.get(keyOf(lessonId, exerciseId))?.clock.elapsed() ?? null;
}
