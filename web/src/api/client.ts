import type { Content } from "../../shared/content.ts";
import type { CheckReply, CheckRequest, ErrorReply, LeanStatus, PlaygroundReply, PlaygroundRequest, ProgressReply } from "../../shared/wire.ts";

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

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "The app's server is not answering. Is `npm run dev` still running?");
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ErrorReply>) | null;
  if (!res.ok || data === null) throw new ApiError(res.status, data?.error || `The server answered ${res.status}.`, data?.code);
  return data;
}

export const getContent = () => api<Content>("/api/content");
export const getProgress = () => api<ProgressReply>("/api/progress");
export const getLean = () => api<LeanStatus>("/api/lean");
export const check = (req: CheckRequest, signal?: AbortSignal) => api<CheckReply>("/api/check", req, signal);
export const playground = (req: PlaygroundRequest, signal?: AbortSignal) => api<PlaygroundReply>("/api/playground", req, signal);
