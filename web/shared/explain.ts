// Lean's error messages, said the way a tutor would say them. Only the
// messages the written lessons can produce are covered; anything else is
// shown as Lean wrote it. The original message is always available beside
// the explanation: reading Lean's own words is part of what is being learned.

/** What the board reports, in place of a Lean message, for a move that Lean
 *  accepts but that changes nothing (`norm_num` on a goal it cannot touch). */
export const UNCHANGED = "The move ran without error, and the proof state after it is the same as before it.";

/** A plain sentence for a Lean error, or null when there is none for it. */
export function explain(message: string): string | null {
  const first = message.split("\n")[0];
  let m: RegExpExecArray | null;
  if ((m = /^Tactic `apply` failed: could not unify the conclusion of `([^`]+)`\n\s*(.+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} ends in “${m[2].trim()}”, but the goal is “${m[3].trim()}”. apply needs a fact whose conclusion is the goal.`;
  }
  if ((m = /^Tactic `apply` failed: could not unify the type of `([^`]+)`\n\s*(.+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} says “${m[2].trim()}”, which is not the goal “${m[3].trim()}”.`;
  }
  if ((m = /^Type mismatch\n\s*(.+)\nhas type\n\s*(.+)\nbut is expected to have type\n\s*(.+)/i.exec(message))) {
    return `${m[1].trim()} says “${m[2].trim()}”, but the goal is “${m[3].trim()}”. exact needs a fact that says exactly what the goal says.`;
  }
  if ((m = /^Tactic `rfl` failed: The left-hand side\n\s*(.+)\nis not definitionally equal to the right-hand side\n\s*(.+)/.exec(message))) {
    return `Lean cannot work “${m[1].trim()}” and “${m[2].trim()}” out to the same thing. rfl only finishes an equation whose two sides compute to something identical.`;
  }
  if (/^Tactic `rfl` failed: Expected the goal to be a binary relation/.test(first)) {
    return "rfl finishes a goal of the form A = B. This goal is not an equation.";
  }
  if (message === UNCHANGED) {
    return "Lean accepted it, but it left the facts and the goal exactly as they were.";
  }
  if (/^Tactic `introN?` failed: There are no additional binders/.test(first)) {
    return "There is nothing to assume here: intro only works when the goal is an “if… then” or a “for all”.";
  }
  if ((m = /^Unknown identifier `([^`]+)`/.exec(first))) {
    return `There is no fact or object called ${m[1]} here. Check the names on the cards.`;
  }
  if (/^No goals to be solved/i.test(first)) {
    return "The proof was already finished before this line. Delete it.";
  }
  if (/^unsolved goals/.test(first)) {
    return "Every line is fine so far, but there is still something left to show.";
  }
  if (/^unexpected token '#print'/.test(first) || /^unexpected token '\)'; expected/.test(first)) {
    return "This line is not finished: a bracket is still open, or something is missing at the end.";
  }
  if (/^unknown tactic/i.test(first) || /^unexpected token/.test(first)) {
    return "Lean could not read this line. Check the spelling of the move, and that there is one move per line.";
  }
  return null;
}
