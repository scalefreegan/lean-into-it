import { createContext, useContext } from "react";
import type { TtsModel, TtsVoice } from "../../shared/wire.ts";
import type { NarrateOptions, NarrationHandle } from "./speech.ts";

// Listen mode's shared state: the types, the context and the hooks that read
// it. The provider is ListenProvider.tsx.

/** What the transport shows: nothing being read, fetching the audio, playing, or paused. */
export type TransportState = "idle" | "loading" | "playing" | "paused";

/** The speeds on offer; the transport steps through them. */
export const RATES = [0.75, 1, 1.25, 1.5] as const;

/** A page that reads a run of blocks (a lesson) gives the transport its own
 *  Start, Back and Skip while it is showing. Without one, the transport
 *  works on the last single passage spoken (a Tutor reply). */
export interface ListenSequence {
  /** Start, when nothing is being read: where it was, or the top. */
  start: () => void;
  /** Back, given how far into the current passage playback is. */
  back: (elapsedSeconds: number) => void;
  skip: () => void;
  /** Stop: forget the place; Start then begins from the top. (The provider stops the audio.) */
  stop: () => void;
}

export interface ListenState {
  /** False until the settings have come back from the server. */
  ready: boolean;
  /** Whether Listen mode is turned on. Kept for the learner. */
  on: boolean;
  setOn: (on: boolean) => void;
  /** Null until a voice is chosen; nothing can be read until then. */
  voiceId: string | null;
  setVoiceId: (id: string) => void;
  modelId: string;
  setModelId: (id: string) => void;
  models: TtsModel[];
  /** Whether the server has an ElevenLabs key at all. */
  configured: boolean;
  /** Ask the server again whether it has a key (one can be added while the app runs). */
  recheck: () => void;
  voices: TtsVoice[];
  voicesLoading: boolean;
  voicesError: string | null;
  loadVoices: () => void;
  rate: number;
  setRate: (rate: number) => void;
  /** Speak `text`, first stopping whatever was being read: one passage at a time. Null (and onError) when there is no voice. */
  speak: (text: string, opts?: NarrateOptions) => NarrationHandle | null;
  /** Stop whatever is being read. */
  stop: () => void;
  transport: TransportState;
  /** Whether a page has given the transport a run of blocks to read. */
  hasSequence: boolean;
  registerSequence: (sequence: ListenSequence) => () => void;
  /** Start (idle) or resume (paused). */
  play: () => void;
  pause: () => void;
  seek: (deltaSeconds: number) => void;
  back: () => void;
  skip: () => void;
  /** Stop, and forget the page's place. */
  stopAll: () => void;
  /** The last thing that went wrong, for the transport and the settings. */
  error: string | null;
  clearError: () => void;
}

export const ListenContext = createContext<ListenState | null>(null);

export function useListen(): ListenState {
  const v = useContext(ListenContext);
  if (!v) throw new Error("useListen outside ListenProvider");
  return v;
}

/** The one line being read that is not lesson prose (an exercise's
 *  sentence), and the word sounding in it; the component that shows the
 *  line highlights it. Null when nothing of the kind is being read. */
export const ReadingLineContext = createContext<{ id: string; word: number | null } | null>(null);

export function useReadingLine(id: string): { word: number | null } | null {
  const v = useContext(ReadingLineContext);
  return v && v.id === id ? v : null;
}
