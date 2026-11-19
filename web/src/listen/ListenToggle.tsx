import { useEffect, useRef, useState } from "react";
import { cx } from "../ui.tsx";
import { useListen } from "./data.ts";

// The header's Listen control: a button that opens a small panel with the
// switch, the voice and the quality (ElevenLabs). With no key on the server
// the panel says how to add one, and nothing else in the app changes. What
// is read, and when, is the pages' business (Lesson, the Tutor's drawer);
// the play controls are ListenTransport.

const selectClass = "min-w-0 rounded-lg border border-line-strong bg-panel px-2 py-1 text-sm text-fg disabled:opacity-60";

export function ListenToggle() {
  const listen = useListen();
  const { voices, voicesLoading, voicesError, loadVoices, configured, recheck } = listen;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Opening the panel asks again whether there is a key: one can be added while the app runs.
  useEffect(() => {
    if (open) recheck();
  }, [open, recheck]);
  useEffect(() => {
    if (open && configured && voices.length === 0 && !voicesLoading && !voicesError) loadVoices();
  }, [open, configured, voices.length, voicesLoading, voicesError, loadVoices]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!listen.ready) return null;
  return (
    <div ref={box} className="relative ml-auto" data-listen={listen.on ? "on" : "off"}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", listen.on ? "bg-accent text-accent-ink hover:bg-accent-hover" : "border border-line-strong text-fg-2 hover:bg-raised")}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8v4h3l4 3.5v-11L6 8H3z" fill="currentColor" />
          <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.8 5a7 7 0 0 1 0 10" />
        </svg>
        {/* The word gives way on a phone, where the header is already full; the name stays for a screen reader. */}
        <span className="sr-only sm:not-sr-only">Listen</span>
        <span className="sr-only">{listen.on ? " (on)" : " (off)"}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Listen mode" className="absolute top-full right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line-strong bg-panel p-4 shadow-lg" data-listen-panel>
          <p className="text-sm font-semibold text-fg">Listen mode</p>
          <p className="mt-1 text-sm text-fg-3">Hear a lesson's text, each exercise's claim and the Tutor's replies read aloud, with the word being read marked.</p>
          {!configured && (
            <div className="mt-3 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-fg" data-listen-no-key>
              <p>
                Reading aloud uses ElevenLabs, and needs a key of yours. Add this line to the file <code className="font-mono text-xs">.env.local</code> in the repo's root (git does not track it):
              </p>
              <pre className="mt-1.5 overflow-x-auto font-mono text-xs">ELEVENLABS_API_KEY=your-key</pre>
              <p className="mt-1.5">No restart is needed. Everything else works without it.</p>
              <button type="button" className="mt-2 font-semibold text-accent underline" onClick={recheck}>
                I have added it: check again
              </button>
            </div>
          )}
          {(configured || listen.on) && (
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-fg">
                <input type="checkbox" className="h-4 w-4 accent-(--accent)" checked={listen.on} onChange={(e) => listen.setOn(e.target.checked)} />
                Read aloud
              </label>
              {configured && (
                <>
                  <label className="flex flex-col gap-1 text-sm text-fg-2">
                    Voice
                    {voicesError ? (
                      <span className="text-sm text-fg" role="alert">
                        {voicesError}{" "}
                        <button type="button" className="font-semibold text-accent underline" onClick={loadVoices}>
                          Try again
                        </button>
                      </span>
                    ) : (
                      <select className={selectClass} value={listen.voiceId ?? ""} disabled={voicesLoading} onChange={(e) => listen.setVoiceId(e.target.value)}>
                        <option value="" disabled>
                          {voicesLoading ? "Loading…" : "Choose a voice…"}
                        </option>
                        {/* The stored voice, while the list is on its way (or if the account no longer has it). */}
                        {listen.voiceId && !voices.some((v) => v.id === listen.voiceId) && <option value={listen.voiceId}>{voicesLoading ? "Loading…" : "The voice chosen before"}</option>}
                        {voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-fg-2">
                    Quality
                    <select className={selectClass} value={listen.modelId} onChange={(e) => listen.setModelId(e.target.value)}>
                      {listen.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.note})
                        </option>
                      ))}
                    </select>
                  </label>
                  {!listen.voiceId && <p className="text-sm text-fg-3">Choose a voice, and the play controls appear at the foot of the page.</p>}
                  <p className="text-xs text-fg-3">The text read is sent to ElevenLabs the first time it is heard; after that the audio is kept on this machine.</p>
                </>
              )}
            </div>
          )}
          {listen.error && (
            <p role="alert" className="mt-3 text-sm text-fg">
              {listen.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
