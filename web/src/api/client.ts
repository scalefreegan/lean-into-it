import type { Content } from "../../shared/content.ts";
import type { CheckReply, CheckRequest, ErrorReply, GalleryRequest, LeanStatus, OpenLevelRequest, PlacementRequest, PlaygroundReply, PlaygroundRequest, ProgressReply, TutorHistoryReply, TutorLadderReply, TutorReply, TutorRequest, ListenSettings, ListenSettingsPatch, TtsSpeakReply, TtsSpeakRequest, TtsVoicesReply } from "../../shared/wire.ts";
import { workedOn } from "../workclock.ts";

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
export const openLevel = (req: OpenLevelRequest) => api<ProgressReply>("/api/progress/open", req);
export const placeAt = (req: PlacementRequest) => api<ProgressReply>("/api/progress/placement", req);
export const getLean = () => api<LeanStatus>("/api/lean");
export const restartLean = () => api<LeanStatus>("/api/lean/restart", {});
/** A check that is an attempt carries the working time on its exercise (web/src/workclock.ts). */
export const check = (req: CheckRequest, signal?: AbortSignal) => {
  const elapsed = req.record && req.elapsedMs === undefined ? workedOn(req.lessonId, req.exerciseId) : null;
  return api<CheckReply>("/api/check", elapsed === null ? req : { ...req, elapsedMs: elapsed }, signal);
};
export const galleryCheck = (req: GalleryRequest, signal?: AbortSignal) => api<CheckReply>("/api/gallery", req, signal);
export const playground = (req: PlaygroundRequest, signal?: AbortSignal) => api<PlaygroundReply>("/api/playground", req, signal);
export const askTutor = (req: TutorRequest, signal?: AbortSignal) => api<TutorReply>("/api/tutor", req, signal);
export const tutorHistory = () => api<TutorHistoryReply>("/api/tutor/history");
export const clearTutor = () => api<{ ok: boolean }>("/api/tutor/history", undefined, undefined, "DELETE");
export const tutorLadder = (lessonId: string, exerciseId: string) => api<TutorLadderReply>(`/api/tutor/ladder?lesson=${encodeURIComponent(lessonId)}&exercise=${encodeURIComponent(exerciseId)}`);
// Listen mode (web/server/tts.ts). The ElevenLabs key stays on the server.
export const listenSettings = () => api<ListenSettings>("/api/tts/settings");
export const putListenSettings = (patch: ListenSettingsPatch) => api<ListenSettings>("/api/tts/settings", patch, undefined, "PUT");
export const ttsVoices = () => api<TtsVoicesReply>("/api/tts/voices");
export const ttsSpeak = (text: string, signal?: AbortSignal) => api<TtsSpeakReply>("/api/tts/speak", { text } satisfies TtsSpeakRequest, signal);
