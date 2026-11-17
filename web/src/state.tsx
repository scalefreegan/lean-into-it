import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Content, Lesson } from "../shared/content.ts";
import type { LeanStatus, ProgressReply, SolvedExercise } from "../shared/wire.ts";
import { getContent, getLean, getProgress } from "./api/client.ts";

// What every page needs: the curriculum, what has been solved, and whether
// Lean can run. Loaded once; `markSolved` updates the solved map at once
// when Lean accepts a proof, so the Path is right without a refetch.

interface AppData {
  content: Content;
  solved: ProgressReply["solved"];
  lean: LeanStatus;
  markSolved: (lessonId: string, exerciseId: string, solution: string) => void;
  reloadLean: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** How many of a lesson's exercises are solved. */
export function lessonProgress(lesson: Lesson, solved: ProgressReply["solved"]): { done: number; total: number; complete: boolean } {
  const mine = solved[lesson.id] ?? {};
  const done = lesson.exercises.filter((e) => mine[e.id]).length;
  const total = lesson.exercises.length;
  return { done, total, complete: total > 0 && done === total };
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error: string | null }) => ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [solved, setSolved] = useState<ProgressReply["solved"] | null>(null);
  const [lean, setLean] = useState<LeanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getContent(), getProgress(), getLean()])
      .then(([c, p, l]) => {
        if (!live) return;
        setContent(c);
        setSolved(p.solved);
        setLean(l);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const markSolved = useCallback((lessonId: string, exerciseId: string, solution: string) => {
    setSolved((prev) => {
      if (!prev || prev[lessonId]?.[exerciseId]) return prev;
      const entry: SolvedExercise = { solvedAt: new Date().toISOString(), solution };
      return { ...prev, [lessonId]: { ...prev[lessonId], [exerciseId]: entry } };
    });
  }, []);

  const reloadLean = useCallback(() => {
    getLean().then(setLean, () => {});
  }, []);

  const value = useMemo(
    () => (content && solved && lean ? { content, solved, lean, markSolved, reloadLean } : null),
    [content, solved, lean, markSolved, reloadLean],
  );
  if (!value) return <>{fallback({ error })}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
