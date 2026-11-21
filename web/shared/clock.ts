// The working time an attempt records (attempts.elapsed_ms): how long the
// exercise had been in front of the learner when they checked it. The
// clock runs while the exercise is on screen and the tab is showing
// (web/src/workclock.ts says when), so reading it before the first click
// counts, and so does sitting idle with it on screen; scrolling it away, or
// hiding the tab, stops it. Two exercises on screen together both run. It
// is per visit: leaving the page and coming back starts again from nothing,
// so a solve's time is that visit's, not the total over every visit. It
// is a measure for the learner's history and the Tutor; nothing grades by it.

/** Longer than any sitting: past it, a clock says nothing. */
export const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

/** A stopwatch that runs while told to. `now` is in ms. */
export class WorkClock {
  private readonly now: () => number;
  private total = 0;
  /** When the current run began; null while stopped. */
  private since: number | null = null;
  private ever = false;

  constructor(now: () => number) {
    this.now = now;
  }

  /** Run (the exercise is on screen and the tab showing) or stop. */
  run(on: boolean): void {
    if (on && this.since === null) {
      this.since = this.now();
      this.ever = true;
    }
    if (!on && this.since !== null) {
      this.total += this.now() - this.since;
      this.since = null;
    }
  }

  /** The time run so far, in whole ms; null if it never ran, or ran past a day. */
  elapsed(): number | null {
    if (!this.ever) return null;
    const ms = Math.round(this.total + (this.since === null ? 0 : this.now() - this.since));
    return ms <= MAX_ELAPSED_MS ? ms : null;
  }
}

/** A working time as the browser sent it, if it is one: whole ms, from 0 to a day. */
export function elapsedFrom(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_ELAPSED_MS ? v : null;
}
