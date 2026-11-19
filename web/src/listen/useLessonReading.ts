import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lesson } from "../../shared/content.ts";
import { speakableText } from "../../shared/tts/speakable.ts";
import { backTarget, nextStop, skipTarget, type StopKind } from "../../shared/tts/transport.ts";
import { useListen } from "./data.ts";
import type { NarrationHandle } from "./speech.ts";

// A lesson read aloud, block by block, in the order of the file. Prose is
// read and the reading goes on; an exercise's title and claim are read and
// then the reading waits, as it does at a widget, until Play or Skip: the
// learner has something to do there. Nothing starts by itself: the
// transport's Play does. Which block comes next is transport.ts's answer.

export interface LessonReading {
  /** Whether this lesson can be read now (Listen mode on, a voice chosen). */
  enabled: boolean;
  /** The block being read and the word sounding in it (an index into what is spoken of that block). */
  active: { block: number; word: number | null } | null;
  /** The block the reading waits at. */
  waitingAt: number | null;
}

function ended(text: string): string {
  return /[.?!:]$/.test(text) ? text : `${text}.`;
}

/** What is said for an exercise: its title, then its claim. `titleWords` is how many of the words are the title's. */
export function exerciseSpeech(title: string, says: string): { text: string; titleWords: number } {
  const t = speakableText(title).text;
  const s = speakableText(says).text;
  return { text: [t && ended(t), s].filter(Boolean).join(" "), titleWords: t ? t.split(/\s+/).length : 0 };
}

export function useLessonReading(lesson: Lesson | undefined, allowed: boolean): LessonReading {
  const { on, voiceId, speak, registerSequence } = useListen();
  const enabled = Boolean(lesson) && allowed && on && voiceId !== null;
  const [active, setActive] = useState<LessonReading["active"]>(null);
  const [waitingAt, setWaitingAt] = useState<number | null>(null);
  /** The block last read or waited at, and whether the reading is waiting there. */
  const place = useRef<number | null>(null);
  const waiting = useRef(false);
  /** The passage of this lesson being read. Only it is ever stopped from here: a Tutor reply is not this page's to stop. */
  const mine = useRef<NarrationHandle | null>(null);
  const stopMine = useCallback(() => {
    mine.current?.stop();
    mine.current = null;
  }, []);

  const spoken = useMemo(
    () =>
      (lesson?.blocks ?? []).map((b) => {
        if (b.type === "prose") return speakableText(b.markdown).text;
        if (b.type === "widget") return "";
        const exercise = lesson!.exercises.find((e) => e.id === b.id);
        return exercise ? exerciseSpeech(exercise.title, exercise.says).text : "";
      }),
    [lesson],
  );
  const kinds = useMemo<StopKind[]>(() => (lesson?.blocks ?? []).map((b, i) => (b.type === "widget" ? "widget" : spoken[i] ? "text" : "empty")), [lesson, spoken]);

  const clear = useCallback(() => {
    place.current = null;
    waiting.current = false;
    setActive(null);
    setWaitingAt(null);
  }, []);

  // The reading going on by itself calls the newest goTo, through a ref.
  const next = useRef<(from: number | null) => void>(() => {});
  const goTo = useCallback(
    (from: number | null) => {
      const idx = from === null ? null : nextStop(kinds, from);
      if (idx === null || !lesson) {
        stopMine();
        clear();
        return;
      }
      place.current = idx;
      const block = lesson.blocks[idx];
      const wait = () => {
        waiting.current = true;
        setWaitingAt(idx);
        setActive(null);
      };
      if (block.type === "widget") {
        stopMine();
        wait();
        return;
      }
      waiting.current = false;
      setWaitingAt(null);
      // No longer read (stopped for something else, or failed): unmark it. The
      // place is kept, so Play reads this block again.
      const unmark = () => setActive((a) => (a?.block === idx ? null : a));
      const handle = speak(spoken[idx], {
        onWord: (word) => setActive({ block: idx, word }),
        onEnd: () => (block.type === "exercise" ? wait() : next.current(idx + 1)),
        onError: unmark, // the transport says what went wrong
        onStop: unmark,
      });
      mine.current = handle;
      if (handle) setActive({ block: idx, word: null });
    },
    [lesson, kinds, spoken, speak, stopMine, clear],
  );

  useEffect(() => {
    next.current = goTo;
  }, [goTo]);
  useEffect(() => {
    if (!enabled) return;
    const unregister = registerSequence({
      start: () => goTo(place.current === null ? 0 : waiting.current ? place.current + 1 : place.current),
      // Waiting after an exercise's claim, Back reads the claim again.
      back: (elapsed) => goTo(backTarget(kinds, place.current, waiting.current && place.current !== null && kinds[place.current] === "text" ? Infinity : elapsed)),
      skip: () => goTo(skipTarget(kinds, place.current)),
      stop: clear,
    });
    return () => {
      unregister();
      stopMine();
      clear();
    };
  }, [enabled, goTo, kinds, registerSequence, stopMine, clear]);

  // Keep what is being read in view.
  const at = active?.block ?? waitingAt;
  useEffect(() => {
    if (at === null) return;
    document.querySelector(`[data-reading-block="${at}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [at]);

  return { enabled, active, waitingAt };
}
