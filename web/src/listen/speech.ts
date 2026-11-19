import { wordAt, type SpokenWord } from "../../shared/tts/alignment.ts";
import { seekTarget } from "../../shared/tts/transport.ts";
import { ttsSpeak } from "../api/client.ts";

// Listen mode's player: speaks one passage in the stored voice (the server
// asks ElevenLabs once and keeps the audio) and calls back as each word
// sounds, so the page can move a highlight in step. A plain audio element.
// Ported from Fret Not, plus the speed.

/** loading: fetching the audio; playing; paused; done: ended, failed or stopped (no further callbacks). */
export type NarrationState = "loading" | "playing" | "paused" | "done";

export interface NarrationHandle {
  pause(): void;
  resume(): void;
  /** Stop for good; no further callbacks fire. */
  stop(): void;
  /** Move by `deltaSeconds` within this passage; the highlight follows at once. Ignored until the audio has loaded. */
  seek(deltaSeconds: number): void;
  /** Play faster or slower from now on; the word timings are the audio's own, so the highlight keeps step. */
  setRate(rate: number): void;
  /** Seconds into the passage (0 while loading). */
  readonly currentTime: number;
  readonly state: NarrationState;
}

export interface NarrateOptions {
  /** Called as playback crosses into a new word, with its index in the passage. */
  onWord?: (index: number) => void;
  /** Called once the audio finishes by itself (not after stop()). */
  onEnd?: () => void;
  /** The request failed, or the browser could not play the audio. */
  onError?: (e: Error) => void;
  /** Called on every change of `state`. */
  onState?: (state: NarrationState) => void;
  /** The speed to start at. Default 1. */
  rate?: number;
}

/** Speak `text`. Fetching starts at once; playing begins when the audio and its word timings are back. */
export function narrate(text: string, opts: NarrateOptions = {}): NarrationHandle {
  let audio: HTMLAudioElement | null = null;
  let words: readonly SpokenWord[] = [];
  let lastWord = -1;
  let stopped = false;
  let rate = opts.rate ?? 1;
  let state: NarrationState = "loading";
  const request = new AbortController();
  const setState = (next: NarrationState) => {
    if (state === next) return;
    state = next;
    opts.onState?.(next);
  };

  /** `fresh`: look for the word from the start (after a seek, which can go back). */
  const onTimeUpdate = (fresh: boolean | Event = false) => {
    if (!audio || !words.length) return;
    const i = wordAt(words, audio.currentTime * 1000, fresh === true ? 0 : Math.max(0, lastWord));
    if (i !== lastWord) {
      lastWord = i;
      opts.onWord?.(i);
    }
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    setState("done");
    opts.onEnd?.();
  };
  const fail = (e: unknown) => {
    if (stopped) return;
    stopped = true;
    audio?.pause();
    setState("done");
    opts.onError?.(e instanceof Error ? e : new Error(String(e)));
  };

  const handle: NarrationHandle = {
    pause() {
      if (stopped || !audio) return;
      audio.pause();
      setState("paused");
    },
    resume() {
      if (stopped || !audio) return;
      setState("playing");
      void audio.play().catch(fail);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      request.abort();
      audio?.pause();
      audio?.removeEventListener("timeupdate", onTimeUpdate);
      setState("done");
    },
    seek(deltaSeconds: number) {
      if (stopped || !audio) return;
      audio.currentTime = seekTarget(audio.currentTime, deltaSeconds, audio.duration);
      onTimeUpdate(true);
    },
    setRate(next: number) {
      rate = next;
      if (audio) audio.playbackRate = next;
    },
    get currentTime() {
      return audio ? audio.currentTime : 0;
    },
    get state() {
      return state;
    },
  };

  void ttsSpeak(text, request.signal).then(
    ({ audioUrl, words: w }) => {
      if (stopped) return; // stop() came in before the request finished
      words = w;
      audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", () => fail(new Error("the audio could not be played")));
      setState("playing");
      void audio.play().catch(fail);
    },
    (e: Error) => {
      if (e.name !== "AbortError") fail(e);
    },
  );

  return handle;
}
