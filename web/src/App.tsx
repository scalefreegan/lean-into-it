import { useState, useSyncExternalStore } from "react";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Gallery } from "./pages/Gallery.tsx";
import { Home } from "./pages/Home.tsx";
import { Lesson } from "./pages/Lesson.tsx";
import { Moves } from "./pages/Moves.tsx";
import { Review } from "./pages/Review.tsx";
import { Placement } from "./pages/Placement.tsx";
import { Lab } from "./pages/Lab.tsx";
import { Playground } from "./pages/Playground.tsx";
import { FieldNotes } from "./pages/FieldNotes.tsx";
import { href, useRoute } from "./router.ts";
import { AppProvider, useApp } from "./state.tsx";
import { TutorDrawer } from "./tutor/Drawer.tsx";
import { TutorProvider } from "./tutor/TutorProvider.tsx";
import { useTutor } from "./tutor/store.ts";
import { Button, cx, Notice } from "./ui.tsx";
import { ListenProvider } from "./listen/ListenProvider.tsx";
import { ListenToggle } from "./listen/ListenToggle.tsx";
import { ListenTransport } from "./listen/ListenTransport.tsx";

export function App() {
  return (
    <AppProvider
      fallback={({ error }) => (
        <div className="mx-auto max-w-xl p-10">{error ? <Notice tone="bad">{error}</Notice> : <p className="text-fg-3">Loading…</p>}</div>
      )}
    >
      <TutorProvider>
        <ListenProvider>
          <Shell />
        </ListenProvider>
      </TutorProvider>
    </AppProvider>
  );
}

/** Tailwind's md breakpoint (48rem): from here the header is one row. */
const WIDE = "(min-width: 48rem)";
const subscribeWide = (change: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);

function Shell() {
  const route = useRoute();
  const { review } = useApp();
  const { open } = useTutor();
  const wide = useWide();
  const tabs = [
    { name: "home", label: "Path", active: route.name === "home" || route.name === "lesson" || route.name === "level" },
    { name: "review", label: "Review", active: route.name === "review" },
    { name: "moves", label: "Moves", active: route.name === "moves" },
    { name: "lab", label: "Lab", active: route.name === "lab" },
    { name: "playground", label: "Playground", active: route.name === "playground" },
    { name: "notes", label: "Field notes", active: route.name === "notes" },
  ];
  return (
    <div className={cx("flex min-h-dvh flex-col", open && "lg:pr-[28rem]")}>
      <header className="sticky top-0 z-10 border-b border-line bg-panel/95 px-4 backdrop-blur sm:px-6">
        {/* Below md the sections take a row of their own under the name and
            Listen, and scroll within it if they must: the page never does.
            The nav's padding (taken back by its negative margin) is room for
            the 4 px focus ring, which the scrolling box would clip. The nav
            and Listen swap places in the page itself, not only on screen, so
            Tab goes in the order the eye reads at either width; being keyed,
            Listen keeps its state when they swap. */}
        <div className="mx-auto flex max-w-[2400px] flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <a href={href("home")} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-mono text-lg font-bold text-accent-ink">⊢</span>
            <span className="font-display text-xl font-semibold text-fg">Lean Into It</span>
          </a>
          {!wide && <ListenToggle key="listen" />}
          <nav key="sections" className="-m-1 flex w-[calc(100%+0.5rem)] gap-1 overflow-x-auto p-1 md:m-0 md:w-auto md:overflow-visible md:p-0" aria-label="Sections">
            {tabs.map((t) => (
              <a
                key={t.name}
                href={href(t.name)}
                aria-current={t.active ? "page" : undefined}
                className={cx("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", t.active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised")}
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
          {wide && <ListenToggle key="listen" />}
        </div>
      </header>
      <main className="flex-1 px-4 py-8 sm:px-6">
        <LeanBanner />
        <ErrorBoundary label={route.name} key={`${route.name}/${route.arg ?? ""}/${route.sub ?? ""}`}>
          {route.name === "lesson" && route.arg ? (
            <Lesson id={route.arg} />
          ) : route.name === "review" ? (
            <Review />
          ) : route.name === "placement" ? (
            <Placement />
          ) : route.name === "moves" ? (
            <Moves />
          ) : route.name === "lab" ? (
            <Lab {...(route.arg ? { tool: route.arg } : {})} {...(route.sub ? { sub: route.sub } : {})} />
          ) : route.name === "playground" ? (
            <Playground />
          ) : route.name === "notes" ? (
            <FieldNotes {...(route.arg && /^\d+$/.test(route.arg) ? { id: Number(route.arg) } : {})} />
          ) : route.name === "gallery" ? (
            <Gallery {...(route.arg ? { only: route.arg } : {})} />
          ) : route.name === "level" && route.arg ? (
            <Home focus={Number(route.arg)} />
          ) : (
            <Home />
          )}
        </ErrorBoundary>
      </main>
      <ListenTransport />
      <TutorDrawer />
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
