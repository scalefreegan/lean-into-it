import { createContext, useContext, useEffect, useMemo } from "react";
import type { Goal } from "../../shared/goals.ts";
import type { TutorContext } from "../../shared/wire.ts";

// What the Tutor knows of the page: the route, the exercise last worked on,
// and that exercise's state (its proof so far, Lean's goals and last error).
// Exercises report their state with `useTutorWork`; it is kept in a ref, read
// only when a message is sent, so typing never re-renders the drawer. The
// exercise in view becomes "active" when it is clicked or focused. The
// provider is TutorProvider.tsx.

export interface Work {
  body: string;
  goals: Goal[] | null;
  error: string | null;
}

export interface TutorStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The exercise the learner last touched, on this page. */
  active: { lessonId: string; exerciseId: string } | null;
  touch: (lessonId: string, exerciseId: string) => void;
  report: (key: string, work: Work) => void;
  /** The context for a message, as of now. */
  snapshot: () => TutorContext;
}

export const TutorCtx = createContext<TutorStore | null>(null);

export function useTutor(): TutorStore {
  const v = useContext(TutorCtx);
  if (!v) throw new Error("useTutor outside TutorProvider");
  return v;
}

export const workKey = (lessonId: string, exerciseId: string) => `${lessonId}\u0000${exerciseId}`;
export const PLAYGROUND_KEY = "playground";
export const LAB_KEY = "lab";

/** An exercise's state, for the Tutor. Cheap: a ref write per change. */
export function useTutorWork(lessonId: string, exerciseId: string, w: Work): void {
  const store = useContext(TutorCtx);
  const goals = JSON.stringify(w.goals);
  useEffect(() => {
    store?.report(workKey(lessonId, exerciseId), { body: w.body, goals: JSON.parse(goals) as Goal[] | null, error: w.error });
  }, [store, lessonId, exerciseId, w.body, goals, w.error]);
}

/** Handlers that make an exercise the one the Tutor is asked about. */
export function useTouch(lessonId: string, exerciseId: string): { onPointerDownCapture: () => void; onFocusCapture: () => void } {
  const store = useContext(TutorCtx);
  const touch = store?.touch;
  return useMemo(() => {
    const go = () => touch?.(lessonId, exerciseId);
    return { onPointerDownCapture: go, onFocusCapture: go };
  }, [touch, lessonId, exerciseId]);
}

/** A free Lean file, for the Tutor: the Playground's, or the example open in the Lab (`key`). Forgotten when the page that holds it goes. */
export function useTutorSource(source: string, key = PLAYGROUND_KEY): void {
  const store = useContext(TutorCtx);
  useEffect(() => {
    store?.report(key, { body: source, goals: null, error: null });
    return () => store?.report(key, { body: "", goals: null, error: null });
  }, [store, source, key]);
}
