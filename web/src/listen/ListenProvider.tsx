import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ListenSettings, ListenSettingsPatch, TtsVoice } from "../../shared/wire.ts";
import { listenSettings, putListenSettings, ttsVoices } from "../api/client.ts";
import { ListenContext, RATES, type ListenSequence, type ListenState, type SpeakOptions, type TransportState } from "./data.ts";
import { narrate, type NarrationHandle } from "./speech.ts";

// Listen mode's state and its one voice: only one passage is read at a
// time, whoever asked. The settings are the learner's (the server keeps
// them); the speed is this browser's. Ported from Fret Not.

const RATE_KEY = "lean-into-it:listen-rate";

function storedRate(): number {
  try {
    const kept = Number(localStorage.getItem(RATE_KEY));
    return (RATES as readonly number[]).includes(kept) ? kept : 1;
  } catch {
    return 1;
  }
}

export function ListenProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ListenSettings | null>(null);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [rate, setRateState] = useState(storedRate);
  const [transport, setTransport] = useState<TransportState>("idle");
  const [hasSequence, setHasSequence] = useState(false);
  // A setting that could not be saved stays until the next setting or a
  // dismiss; a passage that could not be read, until the next passage.
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const current = useRef<NarrationHandle | null>(null);
  /** Whether what is being read is an aside (a Tutor reply), not the page's run of blocks. */
  const aside = useRef(false);
  /** The last single passage spoken, for Start and Back when no page has a run of blocks. */
  const last = useRef<string | null>(null);
  const sequence = useRef<ListenSequence | null>(null);
  const rateRef = useRef(rate);
  const voiceId = settings?.voiceId ?? null;

  const recheck = useCallback(() => {
    listenSettings().then(setSettings, () => {
      /* Listen mode stays as it is; nothing else on the page depends on it */
    });
  }, []);
  useEffect(recheck, [recheck]);

  // Stopping a passage, here or by its own handle, tells whoever asked for
  // it (onStop), so no page is left showing a word as being read.
  const stop = useCallback(() => {
    last.current = null;
    current.current?.stop();
    current.current = null;
    setTransport("idle");
  }, []);

  /** Show the change at once, save it, and go back if the server would not keep it. */
  const save = useCallback((patch: ListenSettingsPatch, what: string) => {
    setSettingsError(null);
    setSettings((s) => (s ? { ...s, ...patch } : s));
    putListenSettings(patch).then(setSettings, (e: Error) => {
      setSettingsError(`Could not save ${what}: ${e.message}`);
      listenSettings().then(setSettings, () => {});
    });
  }, []);
  const setOn = useCallback(
    (on: boolean) => {
      if (!on) {
        stop();
        sequence.current?.stop();
      }
      save({ on }, "Listen mode");
    },
    [save, stop],
  );
  const setVoiceId = useCallback(
    (id: string) => {
      stop();
      save({ voiceId: id }, "the voice");
    },
    [save, stop],
  );
  const setModelId = useCallback(
    (id: string) => {
      stop();
      save({ modelId: id }, "the quality");
    },
    [save, stop],
  );

  const loadVoices = useCallback(() => {
    setVoicesLoading(true);
    setVoicesError(null);
    ttsVoices().then(
      (r) => {
        setVoices(r.voices);
        setVoicesLoading(false);
      },
      (e: Error) => {
        setVoicesError(e.message);
        setVoicesLoading(false);
      },
    );
  }, []);

  const setRate = useCallback((next: number) => {
    rateRef.current = next;
    setRateState(next);
    current.current?.setRate(next);
    try {
      localStorage.setItem(RATE_KEY, String(next));
    } catch {
      /* not kept: 1× next time */
    }
  }, []);

  const speak = useCallback(
    (text: string, opts: SpeakOptions = {}): NarrationHandle | null => {
      current.current?.stop();
      current.current = null;
      aside.current = false;
      if (!voiceId) {
        const e = new Error("Choose a voice first: the Listen button in the header has the list.");
        setSpeechError(e.message);
        setTransport("idle");
        opts.onError?.(e);
        return null;
      }
      last.current = text;
      setSpeechError(null);
      // Ended, failed, or stopped: back to idle, so Start works again.
      const done = () => {
        if (current.current !== made) return false;
        current.current = null;
        setTransport("idle");
        return true;
      };
      const made = narrate(text, {
        rate: rateRef.current,
        ...(opts.onWord ? { onWord: opts.onWord } : {}),
        onState: (s) => {
          if (current.current !== made) return;
          if (s !== "done") setTransport(s);
        },
        onEnd: () => {
          if (done()) opts.onEnd?.();
        },
        onError: (e) => {
          // Shown in the transport whatever the page does: the page that asked may have gone.
          if (!done()) return;
          setSpeechError(`Could not read this aloud. ${e.message}`);
          opts.onError?.(e);
        },
        onStop: () => {
          done();
          opts.onStop?.();
        },
      });
      current.current = made;
      aside.current = opts.aside === true;
      setTransport("loading");
      return made;
    },
    [voiceId],
  );

  useEffect(() => stop, [stop]); // the app going away: stop any voice

  const registerSequence = useCallback((s: ListenSequence) => {
    sequence.current = s;
    last.current = null;
    setHasSequence(true);
    return () => {
      if (sequence.current !== s) return;
      sequence.current = null;
      last.current = null;
      setHasSequence(false);
    };
  }, []);
  const play = useCallback(() => {
    const h = current.current;
    if (h && h.state === "paused") return h.resume();
    if (h && h.state !== "done") return;
    if (sequence.current) sequence.current.start();
    else if (last.current) speak(last.current);
  }, [speak]);
  const pause = useCallback(() => current.current?.pause(), []);
  const seek = useCallback((d: number) => current.current?.seek(d), []);
  // While an aside is read, Back is its start and Skip is its end; the lesson's place is left alone.
  const back = useCallback(() => {
    if (current.current && aside.current) current.current.seek(-Infinity);
    else if (sequence.current) sequence.current.back(current.current?.currentTime ?? 0);
    else if (last.current) speak(last.current);
  }, [speak]);
  const skip = useCallback(() => {
    if (current.current && aside.current) stop();
    else if (sequence.current) sequence.current.skip();
    else stop();
  }, [stop]);
  const stopAll = useCallback(() => {
    stop();
    sequence.current?.stop();
  }, [stop]);
  const clearError = useCallback(() => {
    setSettingsError(null);
    setSpeechError(null);
  }, []);

  const error = settingsError ?? speechError;
  const value = useMemo<ListenState>(
    () => ({
      ready: settings !== null,
      on: settings?.on ?? false,
      setOn,
      voiceId,
      setVoiceId,
      modelId: settings?.modelId ?? "",
      setModelId,
      models: settings?.models ?? [],
      configured: settings?.configured ?? false,
      recheck,
      voices,
      voicesLoading,
      voicesError,
      loadVoices,
      rate,
      setRate,
      speak,
      stop,
      transport,
      hasSequence,
      registerSequence,
      play,
      pause,
      seek,
      back,
      skip,
      stopAll,
      error,
      clearError,
    }),
    [settings, setOn, voiceId, setVoiceId, setModelId, recheck, voices, voicesLoading, voicesError, loadVoices, rate, setRate, speak, stop, transport, hasSequence, registerSequence, play, pause, seek, back, skip, stopAll, error, clearError],
  );
  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}
