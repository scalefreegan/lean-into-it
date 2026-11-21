// The working time an attempt records (attempts.elapsed_ms): how long the
// learner had been at the exercise when they checked it. It starts at their
// first click or keystroke in the exercise, not when the page opened (a
// lesson shows all its exercises at once), and it stops while the tab is
// hidden. It is per visit: leaving the page and coming back starts again.
// It is a measure for the learner's history and the Tutor; nothing grades by it.

/** Longer than any sitting: a number past it is not a working time. */
export const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

/** A stopwatch of working time on one exercise. `now` is in ms. */
export class WorkClock {
  private readonly now: () => number;
  private total = 0;
  /** When the current visible stretch began; null while hidden or not started. */
  private since: number | null = null;
  private started = false;

  constructor(now: () => number) {
    this.now = now;
  }

  /** The learner touched the exercise. Only the first touch starts the clock. */
  start(visible: boolean): void {
    if (this.started) return;
    this.started = true;
    if (visible) this.since = this.now();
  }

  /** The tab was shown or hidden. */
  visible(shown: boolean): void {
    if (!this.started) return;
    if (shown && this.since === null) this.since = this.now();
    if (!shown && this.since !== null) {
      this.total += this.now() - this.since;
      this.since = null;
    }
  }

  /** The working time so far, in whole ms; null before the first touch. */
  elapsed(): number | null {
    if (!this.started) return null;
    return Math.min(MAX_ELAPSED_MS, Math.round(this.total + (this.since === null ? 0 : this.now() - this.since)));
  }
}

/** A working time as the browser sent it, if it is one: whole ms, from 0 to a day. */
export function elapsedFrom(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_ELAPSED_MS ? v : null;
}
