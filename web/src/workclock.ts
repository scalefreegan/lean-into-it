import { useCallback, useEffect, useRef } from "react";
import { WorkClock } from "../shared/clock.ts";

// One working-time clock (web/shared/clock.ts) per exercise on the page,
// kept while the exercise is shown. It runs while the exercise is on screen
// (some of it inside the middle of the window) and the tab is showing.
// useTouch hands its `ref` to every place an exercise is drawn, and
// api/client.ts `check` sends its reading with every check that is an attempt.

type Entry = { clock: WorkClock; shown: number; onScreen: Set<Element> };
const clocks = new Map<string, Entry>();
const keyOf = (lessonId: string, exerciseId: string) => `${lessonId}\u0000${exerciseId}`;
const tabShowing = () => typeof document === "undefined" || document.visibilityState === "visible";
const update = (e: Entry) => e.clock.run(e.onScreen.size > 0 && tabShowing());

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    for (const e of clocks.values()) update(e);
  });
}

/** A clock for the exercise while it is shown (it goes, and starts again from
 *  nothing, when the exercise does), and the ref for the element it is drawn in. */
export function useWorkClock(lessonId: string, exerciseId: string): (el: Element | null) => void {
  const key = keyOf(lessonId, exerciseId);
  useEffect(() => {
    const had = clocks.get(key);
    if (had) had.shown++;
    else clocks.set(key, { clock: new WorkClock(() => performance.now()), shown: 1, onScreen: new Set() });
    return () => {
      const e = clocks.get(key);
      if (e && --e.shown === 0) {
        e.clock.run(false);
        clocks.delete(key);
      }
    };
  }, [key]);
  const watching = useRef<{ el: Element; io: IntersectionObserver } | null>(null);
  return useCallback(
    (el: Element | null) => {
      const was = watching.current;
      if (was) {
        was.io.disconnect();
        const e = clocks.get(key);
        if (e) {
          e.onScreen.delete(was.el);
          update(e);
        }
        watching.current = null;
      }
      if (!el || typeof IntersectionObserver === "undefined") return;
      // On screen: some of it inside the window's middle 80%, so a sliver at an edge does not count.
      const io = new IntersectionObserver(
        (seen) => {
          const e = clocks.get(key);
          if (!e) return;
          for (const s of seen) {
            if (s.isIntersecting) e.onScreen.add(s.target);
            else e.onScreen.delete(s.target);
          }
          update(e);
        },
        { rootMargin: "-10% 0px -10% 0px" },
      );
      io.observe(el);
      watching.current = { el, io };
    },
    [key],
  );
}

/** The working time on the exercise so far, in ms; null if it is not shown, has not been on screen, or ran past a day. */
export function workedOn(lessonId: string, exerciseId: string): number | null {
  return clocks.get(keyOf(lessonId, exerciseId))?.clock.elapsed() ?? null;
}
