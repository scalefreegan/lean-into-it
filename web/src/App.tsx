import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Gallery } from "./pages/Gallery.tsx";
import { Home } from "./pages/Home.tsx";
import { Lesson } from "./pages/Lesson.tsx";
import { Moves } from "./pages/Moves.tsx";
import { Review } from "./pages/Review.tsx";
import { Playground } from "./pages/Playground.tsx";
import { href, useRoute } from "./router.ts";
import { AppProvider, useApp } from "./state.tsx";
import { Button, cx, Notice } from "./ui.tsx";

export function App() {
  return (
    <AppProvider
      fallback={({ error }) => (
        <div className="mx-auto max-w-xl p-10">{error ? <Notice tone="bad">{error}</Notice> : <p className="text-fg-3">Loading…</p>}</div>
      )}
    >
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { review } = useApp();
  const tabs = [
    { name: "home", label: "Path", active: route.name === "home" || route.name === "lesson" },
    { name: "review", label: "Review", active: route.name === "review" },
    { name: "moves", label: "Moves", active: route.name === "moves" },
    { name: "playground", label: "Playground", active: route.name === "playground" },
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-panel/95 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[2400px] items-center gap-6 py-3">
          <a href={href("home")} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-mono text-lg font-bold text-accent-ink">⊢</span>
            <span className="font-display text-xl font-semibold text-fg">Lean Into It</span>
          </a>
          <nav className="flex gap-1" aria-label="Sections">
            {tabs.map((t) => (
              <a
                key={t.name}
                href={href(t.name)}
                aria-current={t.active ? "page" : undefined}
                className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", t.active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised")}
              >
                {t.label}
                {t.name === "review" && review.length > 0 && (
                  <span data-review-due={review.length} className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 font-mono text-xs text-accent-ink">
                    {review.length}
                    <span className="sr-only"> due today</span>
                  </span>
                )}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-6">
        <LeanBanner />
        <ErrorBoundary label={route.name} key={`${route.name}/${route.arg ?? ""}`}>
          {route.name === "lesson" && route.arg ? (
            <Lesson id={route.arg} />
          ) : route.name === "review" ? (
            <Review />
          ) : route.name === "moves" ? (
            <Moves />
          ) : route.name === "playground" ? (
            <Playground />
          ) : route.name === "gallery" ? (
            <Gallery {...(route.arg ? { only: route.arg } : {})} />
          ) : (
            <Home />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

/** What Lean is doing when it cannot check a proof yet, and the way to
 *  start it again when it has stopped. Nothing when it is ready. */
function LeanBanner() {
  const { lean, restartLean } = useApp();
  const [asking, setAsking] = useState(false);
  if (lean.state === "ready") return null;
  // The sentence is announced (at once when Lean has stopped); the button
  // sits beside it, outside the announced region.
  return (
    <div className="mx-auto mb-6 max-w-[2400px]" data-lean-state={lean.state}>
      {!lean.installed ? (
        <Notice tone="warn">
          <span role="status">
            <strong>Lean is not set up yet.</strong> {lean.problem} Lessons can be read, but proofs cannot be checked until then.
          </span>
        </Notice>
      ) : lean.state === "down" ? (
        <Notice tone="bad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span role="alert">
              <strong>Lean has stopped.</strong> {lean.problem} Lessons can be read, but proofs cannot be checked until it is running again.
            </span>
            <Button
              disabled={asking}
              onClick={() => {
                setAsking(true);
                void restartLean().finally(() => setAsking(false));
              }}
            >
              {asking ? "Restarting…" : "Restart Lean"}
            </Button>
          </div>
        </Notice>
      ) : (
        <Notice tone="warn">
          <span role="status">
            <strong>{lean.state === "starting" ? "Lean is starting." : "Lean is restarting."}</strong> It is loading its library of mathematics, which can take a minute. Proofs will be checked as soon as it is
            ready; lessons can be read meanwhile.
          </span>
        </Notice>
      )}
    </div>
  );
}
