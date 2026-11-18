import type { Content } from "../../shared/content.ts";
import type { CheckReply, CheckRequest, ErrorReply, LeanStatus, PlaygroundReply, PlaygroundRequest, ProgressReply, TutorHistoryReply, TutorLadderReply, TutorReply, TutorRequest } from "../../shared/wire.ts";

// The one fetch. Every call to the server goes through here, so an error is
// always an ApiError carrying the server's own sentence.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

/** Fired on `window` when a request failed because Lean could not answer. */
export const LEAN_TROUBLE = "lean-into-it:lean-trouble";

async function api<T>(path: string, body?: unknown, signal?: AbortSignal, method?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "The app's server is not answering. Is `npm run dev` still running?");
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ErrorReply>) | null;
  // Lean could not answer: whoever shows its state should look again.
  if (data?.code === "lean_unavailable" || data?.code === "lean_timeout") window.dispatchEvent(new Event(LEAN_TROUBLE));
  if (!res.ok || data === null) throw new ApiError(res.status, data?.error || `The server answered ${res.status}.`, data?.code);
  return data;
}

export const getContent = () => api<Content>("/api/content");
export const getProgress = () => api<ProgressReply>("/api/progress");
export const getLean = () => api<LeanStatus>("/api/lean");
export const restartLean = () => api<LeanStatus>("/api/lean/restart", {});
export const check = (req: CheckRequest, signal?: AbortSignal) => api<CheckReply>("/api/check", req, signal);
export const playground = (req: PlaygroundRequest, signal?: AbortSignal) => api<PlaygroundReply>("/api/playground", req, signal);
export const askTutor = (req: TutorRequest, signal?: AbortSignal) => api<TutorReply>("/api/tutor", req, signal);
export const tutorHistory = () => api<TutorHistoryReply>("/api/tutor/history");
export const clearTutor = () => api<{ ok: boolean }>("/api/tutor/history", undefined, undefined, "DELETE");
export const tutorLadder = (lessonId: string, exerciseId: string) => api<TutorLadderReply>(`/api/tutor/ladder?lesson=${encodeURIComponent(lessonId)}&exercise=${encodeURIComponent(exerciseId)}`);
