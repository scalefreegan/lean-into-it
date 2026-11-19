import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { goalsText } from "../../shared/goals.ts";
import type { TutorContext } from "../../shared/wire.ts";
import { useRoute } from "../router.ts";
import { LAB_KEY, PLAYGROUND_KEY, TutorCtx, workKey, type Work } from "./store.ts";

// Holds what the Tutor knows of the page (store.ts).

const PAGE: Record<string, TutorContext["page"]> = { home: "path", lesson: "lesson", review: "review", placement: "review", moves: "moves", playground: "playground", lab: "lab" };

export function TutorProvider({ children }: { children: ReactNode }) {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const work = useRef(new Map<string, Work>());
  // The exercise touched, and on which page: a new page starts with nothing touched.
  const where = `${route.name}/${route.arg ?? ""}`;
  const [touched, setTouched] = useState<{ where: string; lessonId: string; exerciseId: string } | null>(null);
  const active = useMemo(() => (touched && touched.where === where ? { lessonId: touched.lessonId, exerciseId: touched.exerciseId } : null), [touched, where]);

  const touch = useCallback(
    (lessonId: string, exerciseId: string) => {
      setTouched((a) => (a?.where === where && a.lessonId === lessonId && a.exerciseId === exerciseId ? a : { where, lessonId, exerciseId }));
    },
    [where],
  );
  const report = useCallback((key: string, w: Work) => {
    work.current.set(key, w);
  }, []);

  const snapshot = useCallback((): TutorContext => {
    const page = PAGE[route.name] ?? "path";
    const ctx: TutorContext = { page };
    if (page === "lesson" && route.arg) ctx.lessonId = route.arg;
    if (active && (page === "lesson" || page === "review")) {
      const w = work.current.get(workKey(active.lessonId, active.exerciseId));
      Object.assign(ctx, { lessonId: active.lessonId, exerciseId: active.exerciseId, body: w?.body ?? "", goals: goalsText(w?.goals ?? null), error: w?.error ?? "" });
    }
    if (page === "playground") ctx.source = work.current.get(PLAYGROUND_KEY)?.body ?? "";
    if (page === "lab") ctx.source = work.current.get(LAB_KEY)?.body ?? "";
    return ctx;
  }, [route.name, route.arg, active]);

  const value = useMemo(() => ({ open, setOpen, active, touch, report, snapshot }), [open, active, touch, report, snapshot]);
  return <TutorCtx.Provider value={value}>{children}</TutorCtx.Provider>;
}

