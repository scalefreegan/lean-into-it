import type { ReactNode } from "react";
import { cx } from "../ui.tsx";
import { RATES, useListen } from "./data.ts";

// Listen mode's play controls, at the foot of the page while it is on and
// a voice is chosen: Back, −5 s, Play/Pause, +5 s, Skip, Stop, and the
// speed. Buttons only, no keyboard shortcuts: Space and the arrow keys
// belong to the editor and the widgets. Nothing is read until Play is
// pressed. What each does is in ListenProvider.tsx and, for a lesson's
// blocks, web/shared/tts/transport.ts.

const STATE_LABEL = { idle: "Ready", loading: "Loading…", playing: "Reading", paused: "Paused" } as const;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

const ICONS = {
  back: (
    <Glyph>
      <rect x="3" y="4" width="2.2" height="12" rx="0.8" />
      <path d="M17 4.6v10.8a.7.7 0 0 1-1.07.6L7.4 10.6a.7.7 0 0 1 0-1.2l8.53-5.4A.7.7 0 0 1 17 4.6z" />
    </Glyph>
  ),
  skip: (
    <Glyph>
      <rect x="14.8" y="4" width="2.2" height="12" rx="0.8" />
      <path d="M3 4.6v10.8a.7.7 0 0 0 1.07.6l8.53-5.4a.7.7 0 0 0 0-1.2L4.07 4A.7.7 0 0 0 3 4.6z" />
    </Glyph>
  ),
  play: (
    <Glyph>
      <path d="M6 3.6v12.8a.7.7 0 0 0 1.07.6l10-6.4a.7.7 0 0 0 0-1.2l-10-6.4A.7.7 0 0 0 6 3.6z" />
    </Glyph>
  ),
  pause: (
    <Glyph>
      <rect x="5" y="4" width="3.4" height="12" rx="1" />
      <rect x="11.6" y="4" width="3.4" height="12" rx="1" />
    </Glyph>
  ),
  stop: (
    <Glyph>
      <rect x="4.5" y="4.5" width="11" height="11" rx="1.6" />
    </Glyph>
  ),
};

const plain = "flex min-h-10 min-w-10 items-center justify-center rounded-lg text-fg hover:bg-raised disabled:opacity-40";

export function ListenTransport() {
  const listen = useListen();
  const { transport, rate } = listen;
  if (!listen.on || !listen.voiceId) return null;
  const live = transport === "playing" || transport === "paused";
  const busy = transport === "playing" || transport === "loading";
  const canStart = listen.hasSequence || live;
  const nextRate = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
  const seekButton = (delta: number) => (
    <button type="button" aria-label={delta < 0 ? `Back ${-delta} seconds` : `Forward ${delta} seconds`} disabled={!live} onClick={() => listen.seek(delta)} className={cx(plain, "font-mono text-xs tabular-nums")}>
      {delta < 0 ? `−${-delta}s` : `+${delta}s`}
    </button>
  );
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-panel/95 px-2 py-1 backdrop-blur" data-listen-transport={transport}>
      <div role="toolbar" aria-label="Listen mode controls" className="flex items-center justify-center gap-0.5 sm:gap-1">
        <span role="status" className="mr-1 hidden w-20 text-sm font-semibold text-fg-3 sm:inline">
          {STATE_LABEL[transport]}
        </span>
        <button type="button" className={plain} aria-label="Back: the passage before, or the start of this one" title="Back" disabled={!canStart} onClick={listen.back}>
          {ICONS.back}
        </button>
        {seekButton(-5)}
        <button
          type="button"
          aria-label={busy ? "Pause" : transport === "paused" ? "Resume" : "Start reading"}
          title={busy ? "Pause" : transport === "paused" ? "Resume" : "Start reading"}
          disabled={transport === "loading" || !canStart}
          onClick={transport === "playing" ? listen.pause : listen.play}
          className="mx-1 flex min-h-10 min-w-12 items-center justify-center rounded-lg bg-accent text-accent-ink hover:bg-accent-hover disabled:opacity-50"
          data-listen-play
        >
          {busy ? ICONS.pause : ICONS.play}
        </button>
        {seekButton(5)}
        <button type="button" className={plain} aria-label="Skip to the next passage" title="Skip" disabled={!canStart} onClick={listen.skip}>
          {ICONS.skip}
        </button>
        <button type="button" className={cx(plain, "ml-1")} aria-label="Stop reading" title="Stop" disabled={transport === "idle"} onClick={listen.stopAll}>
          {ICONS.stop}
        </button>
        <button type="button" className={cx(plain, "ml-1 px-2 font-mono text-xs tabular-nums")} aria-label={`Speed ${rate}×. Change to ${nextRate}×`} title="Speed" onClick={() => listen.setRate(nextRate)} data-listen-rate={rate}>
          {rate}×
        </button>
      </div>
      {!canStart && !listen.error && <p className="pb-1 text-center text-xs text-fg-3">Open a lesson to have it read, or ask the Tutor something.</p>}
      {listen.error && (
        <p role="alert" className="flex items-center justify-center gap-2 pb-1 text-sm text-fg">
          <span className="min-w-0">{listen.error}</span>
          <button type="button" className="shrink-0 px-1 font-semibold text-accent underline" onClick={listen.clearError}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
