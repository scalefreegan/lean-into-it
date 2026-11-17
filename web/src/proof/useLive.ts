import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client.ts";

// Ask Lean a little after the typing stops, and keep only the newest answer:
// a reply to text that has since changed is dropped, and its request aborted.

export interface Live<T> {
  reply: T | null;
  /** True from a change until its answer arrives. */
  checking: boolean;
  /** The server could not answer (Lean missing, server down). */
  trouble: string | null;
}

export function useLive<K, T>(key: K, ask: (key: K, signal: AbortSignal) => Promise<T>, delayMs = 350): Live<T> {
  // `answered` is the key the stored reply (or trouble) belongs to; while it
  // differs from the current key, a check is on its way.
  const [state, setState] = useState<{ reply: T | null; trouble: string | null; answered: string | null }>({ reply: null, trouble: null, answered: null });
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });
  const serial = JSON.stringify(key);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      askRef.current(JSON.parse(serial) as K, abort.signal).then(
        (reply) => !abort.signal.aborted && setState({ reply, trouble: null, answered: serial }),
        (e: Error) => {
          if (abort.signal.aborted || e.name === "AbortError") return;
          setState((s) => ({ reply: s.reply, trouble: e instanceof ApiError ? e.message : String(e), answered: serial }));
        },
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [serial, delayMs]);
  return { reply: state.reply, checking: state.answered !== serial, trouble: state.trouble };
}
