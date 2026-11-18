import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Content, Lesson } from "../shared/content.ts";
import type { LeanStatus, ProgressReply, SolvedExercise } from "../shared/wire.ts";
import { solvedOf } from "../shared/progress.ts";
import { getContent, getLean, getProgress, LEAN_TROUBLE, openLevel as askOpenLevel, restartLean as askRestart } from "./api/client.ts";

// What every page needs: the curriculum, what has been solved, and whether
// Lean can run. Loaded once; `markSolved` updates the solved map at once
// when Lean accepts a proof, so the Path is right without a refetch.
// Mastery moves with every check, refused ones too, so the pages that show
// it fetch it again when they open (`reloadProgress`).

interface AppData {
  content: Content;
  solved: ProgressReply["solved"];
  mastery: ProgressReply["mastery"];
  /** Today's review session (its length is the count due). */
  review: ProgressReply["review"];
  /** Fetch mastery and today's review again; resolves to the reply, or null if it failed. */
  reloadProgress: () => Promise<ProgressReply | null>;
  /** Every level: locked, open or done (web/shared/progress.ts levelStatuses). */
  levels: ProgressReply["levels"];
  /** Open a locked level; rejects with the server's reason. */
  openLevel: (level: number) => Promise<void>;
  lean: LeanStatus;
  markSolved: (lessonId: string, exerciseId: string, solution: string) => void;
  reloadLean: () => void;
  /** Stop Lean and start it again; resolves when its new state is known. */
  restartLean: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** How many of a lesson's exercises are solved. */
export function lessonProgress(lesson: Lesson, solved: ProgressReply["solved"]): { done: number; total: number; complete: boolean } {
  // Own properties only: an id such as `constructor` must find nothing.
  const mine = Object.hasOwn(solved, lesson.id) ? solved[lesson.id] : {};
  const done = lesson.exercises.filter((e) => Object.hasOwn(mine, e.id)).length;
  const total = lesson.exercises.length;
  return { done, total, complete: total > 0 && done === total };
}

/** How many progress fetches have been made; only the newest one's reply is applied. */
let progressAsked = 0;

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error: string | null }) => ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [solved, setSolved] = useState<ProgressReply["solved"] | null>(null);
  const [mastery, setMastery] = useState<ProgressReply["mastery"] | null>(null);
  const [review, setReview] = useState<ProgressReply["review"]>([]);
  const [levels, setLevels] = useState<ProgressReply["levels"]>([]);
  const [lean, setLean] = useState<LeanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getContent(), getProgress(), getLean()])
      .then(([c, p, l]) => {
        if (!live) return;
        setContent(c);
        setSolved(p.solved);
        setMastery(p.mastery);
        setReview(p.review);
        setLevels(p.levels);
        setLean(l);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const markSolved = useCallback((lessonId: string, exerciseId: string, solution: string) => {
    setSolved((prev) => {
      if (!prev || solvedOf(prev, lessonId, exerciseId)) return prev;
      const entry: SolvedExercise = { solvedAt: new Date().toISOString(), solution };
      const mine = Object.hasOwn(prev, lessonId) ? prev[lessonId] : {};
      return { ...prev, [lessonId]: { ...mine, [exerciseId]: entry } };
    });
  }, []);

  // The solved map is kept as it is: markSolved may be ahead of a reply in flight.
  // Replies are applied in the order the requests were made: an older one
  // landing late does not undo a newer one.
  const reloadProgress = useCallback(() => {
    const n = ++progressAsked;
    return getProgress().then(
      (p) => {
        if (n === progressAsked) {
          setMastery(p.mastery);
          setReview(p.review);
          setLevels(p.levels);
        }
        return p;
      },
      () => null,
    );
  }, []);

  const openLevel = useCallback(async (level: number) => {
    const p = await askOpenLevel({ level });
    // Applied whatever else is in flight, and it makes any reply asked for
    // before it stale: such a reply may have read the levels before this
    // one was recorded.
    ++progressAsked;
    setMastery(p.mastery);
    setReview(p.review);
    setLevels(p.levels);
  }, []);

  // A day can turn, and work be done in another tab, while this one waits:
  // look again whenever the app comes back into view.
  useEffect(() => {
    const look = () => document.visibilityState === "visible" && void reloadProgress();
    document.addEventListener("visibilitychange", look);
    window.addEventListener("focus", look);
    return () => {
      document.removeEventListener("visibilitychange", look);
      window.removeEventListener("focus", look);
    };
  }, [reloadProgress]);

  const reloadLean = useCallback(() => {
    getLean().then(setLean, () => {});
  }, []);

  const restartLean = useCallback(() => askRestart().then(setLean, () => {}), []);

  // Lean's state is watched while it is anything but ready (it gets there
  // by itself), and looked at again when a check says Lean could not answer.
  const state = lean?.state;
  const installed = lean?.installed;
  useEffect(() => {
    window.addEventListener(LEAN_TROUBLE, reloadLean);
    const timer = state !== undefined && state !== "ready" && installed ? setInterval(reloadLean, 2000) : undefined;
    return () => {
      window.removeEventListener(LEAN_TROUBLE, reloadLean);
      clearInterval(timer);
    };
  }, [state, installed, reloadLean]);

  const value = useMemo(
    () => (content && solved && mastery && lean ? { content, solved, mastery, review, reloadProgress, levels, openLevel, lean, markSolved, reloadLean, restartLean } : null),
    [content, solved, mastery, review, reloadProgress, levels, openLevel, lean, markSolved, reloadLean, restartLean],
  );
  if (!value) return <>{fallback({ error })}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
