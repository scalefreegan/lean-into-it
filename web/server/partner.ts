// The Tutor as proof partner: Lean, asked on the Tutor's behalf.
//
//   POST /api/tutor/lean  {token, lean, goalsAfterLine?} → PartnerReply
//
// The route is for the Tutor's own tool (scripts/lean-mcp.mjs), which a
// Playground turn starts with a token made for that turn; it answers only
// while that turn runs. The scratch Lean is searched first for anything
// that runs a program (web/shared/partner.ts scratchProblems) and then
// checked in a document of its own (`tutor`), never the learner's
// Playground file nor the exercises' document. Nothing is recorded.
//
// The same check labels the Lean blocks of a Playground reply
// (`labelReply`): what the learner reads under a snippet is what Lean said
// of it, not what the Tutor says.

import type { PartnerMessage, PartnerReply } from "../shared/wire.ts";
import { SCRATCH_OFFSET, labelled, leanBlocks, scratchProblems, scratchSource, standsAlone, type BlockVerdict } from "../shared/partner.ts";
import { leanError } from "./check.ts";
import type { LeanServer } from "./lean/lsp.ts";
import { HttpError } from "./sse.ts";

/** The Tutor's scratch document: its own, so the learner's file and the
 *  exercises never wait behind it or see it. */
export const TUTOR_DOCUMENT = "tutor";

const MAX_MESSAGES = 30;
const MAX_MESSAGE = 1_500;
/** Blocks of one reply that Lean is asked about; a reply has one or two.
 *  A fragment, or one refused unread, costs Lean nothing and is not counted. */
export const MAX_LABELLED = 4;

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Ask Lean about scratch Lean. `goalsAfterLine` (1-based, in the scratch
 * text) also asks for the goals at the end of that line: after its tactic
 * has run. Throws only what `leanError` makes of a Lean that is down or
 * too slow.
 */
export async function tryLean(lean: LeanServer, text: string, goalsAfterLine?: number): Promise<PartnerReply> {
  const problems = scratchProblems(text);
  if (problems.length) return { ran: false, refused: problems.map((p) => `line ${p.line}: ${p.message}`), accepted: false, sorry: false, messages: [], goals: null };
  const source = scratchSource(text);
  const lines = source.split("\n");
  const at = goalsAfterLine !== undefined && goalsAfterLine >= 1 && goalsAfterLine + SCRATCH_OFFSET < lines.length ? goalsAfterLine + SCRATCH_OFFSET - 1 : null;
  let result;
  try {
    result = await lean.check(TUTOR_DOCUMENT, source, at === null ? [] : [{ line: at, character: lines[at].length }]);
  } catch (e) {
    throw leanError(e);
  }
  const messages: PartnerMessage[] = result.diagnostics
    .map((d) => ({ severity: d.severity, line: Math.max(1, d.start.line - SCRATCH_OFFSET + 1), message: cut(d.message, MAX_MESSAGE) }))
    .sort((a, b) => a.line - b.line);
  const errors = messages.filter((m) => m.severity === "error");
  return {
    ran: true,
    refused: [],
    accepted: errors.length === 0,
    sorry: messages.some((m) => m.severity === "warning" && /\bsorry\b/.test(m.message)),
    messages: messages.slice(0, MAX_MESSAGES),
    ...(messages.length > MAX_MESSAGES ? { more: messages.length - MAX_MESSAGES } : {}),
    goals: at === null ? null : (result.goals[0] ?? null),
  };
}

/** What Lean says of one block of a reply. */
export async function blockVerdict(lean: LeanServer, code: string): Promise<BlockVerdict> {
  if (!standsAlone(code)) return { kind: "fragment" };
  try {
    const r = await tryLean(lean, code);
    if (!r.ran) return { kind: "not-run", why: r.refused[0]?.replace(/^line \d+: /, "") ?? "it may not be run" };
    const error = r.messages.find((m) => m.severity === "error");
    return error ? { kind: "refused", error: error.message } : r.sorry ? { kind: "open" } : { kind: "accepted" };
  } catch (e) {
    return { kind: "unasked", why: e instanceof HttpError ? e.message : "Lean stopped" };
  }
}

/** A Playground reply with Lean's verdict under each of its Lean blocks
 *  (the first MAX_LABELLED; the rest say they were not checked). */
export async function labelReply(lean: LeanServer, reply: string, signal?: AbortSignal): Promise<string> {
  const blocks = leanBlocks(reply);
  const verdicts: BlockVerdict[] = [];
  let asked = 0;
  for (const b of blocks) {
    if (signal?.aborted) break;
    const forLean = standsAlone(b.code) && scratchProblems(b.code).length === 0;
    if (forLean && asked >= MAX_LABELLED) verdicts.push({ kind: "not-run", why: `only the first ${MAX_LABELLED} snippets of a reply are checked` });
    else {
      if (forLean) asked++;
      verdicts.push(await blockVerdict(lean, b.code));
    }
  }
  return labelled(reply, verdicts);
}
