// Lean's error messages, said the way a tutor would say them. Only the
// messages the written lessons can produce are covered; anything else is
// shown as Lean wrote it. The original message is always available beside
// the explanation: reading Lean's own words is part of what is being learned.

/** What the board reports, in place of a Lean message, for a move that Lean
 *  accepts but that changes nothing (`norm_num` on a goal it cannot touch). */
export const UNCHANGED = "The move ran without error, and the proof state after it is the same as before it.";

/** What the board reports for `constructor` on a goal that is not an "and"
 *  or an "if and only if". Lean would accept the move on many such goals and
 *  do something the learner has not been taught (on "there exists" it leaves
 *  the witness to be filled in later), so the board does not send it. */
export const NOT_SPLITTABLE = "The goal is not of the form A ∧ B or A ↔ B, so the board did not send this move to Lean.";

/** A plain sentence for a Lean error, or null when there is none for it. */
export function explain(message: string): string | null {
  const first = message.split("\n")[0];
  let m: RegExpExecArray | null;
  if ((m = /^Tactic `apply` failed: could not unify the conclusion of `([^`]+)`\n\s*(.+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} ends in “${m[2].trim()}”, but the goal is “${m[3].trim()}”. apply needs a fact whose conclusion is the goal.`;
  }
  if ((m = /^Tactic `apply` failed: could not unify the type of `([^`]+)`\n\s*(.+ ↔ .+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} says “${m[2].trim()}”, an “if and only if”, which is not the goal “${m[3].trim()}”. Take it apart with obtain first, then apply the direction you need.`;
  }
  if ((m = /^Tactic `apply` failed: could not unify the type of `([^`]+)`\n\s*(.+)\nwith the goal\n\s*(.+)/.exec(message))) {
    return `${m[1]} says “${m[2].trim()}”, which is not the goal “${m[3].trim()}”.`;
  }
  if ((m = /^Type mismatch\n\s*(.+)\nhas type\n\s*(.+)\nof sort `Prop` but is expected to have type\n\s*(.+)\nof sort `Type/.exec(message))) {
    return `${m[1].trim()} is a fact (it says “${m[2].trim()}”), but what is wanted here is a thing of the kind ${m[3].trim()}, such as a number.`;
  }
  if ((m = /^failed to synthesize instance of type class\n\s*(Neg|OfScientific) (\S+)/.exec(message))) {
    return m[1] === "Neg" ? `What is wanted here is one of ${m[2]}, and ${m[2]} has no negative numbers.` : `What is wanted here is one of ${m[2]}, and ${m[2]} has no numbers with a decimal point.`;
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
    return "There is nothing to assume here: intro only works when the goal is an “if… then”, a “not” or a “for all”.";
  }
  if (/^Tactic `constructor` failed/.test(first) || message === NOT_SPLITTABLE) {
    return "constructor splits a goal of the form “A and B” or “A if and only if B” into its two parts. This goal is not one of those.";
  }
  if ((m = /^Tactic `(left|right)` failed/.exec(first))) {
    return `${m[1]} chooses a side of a goal of the form “A or B”. This goal is not an “or”.`;
  }
  if ((m = /^Tactic `rcases` failed: `(\S+) : (.+)` is not an inductive datatype/.exec(first))) {
    return `${m[1]} says “${m[2]}”, which has no parts to take apart. obtain works on an “and”, an “or”, an “if and only if” or a “there exists”.`;
  }
  if (/^Tactic `contradiction` failed/.test(first)) {
    return "Lean cannot see two facts here that flatly contradict each other, such as A and not A.";
  }
  if (/^numerals are data in Lean, but the expected type is a proposition/.test(first)) {
    return "A number was given where Lean expected a proof of a statement. use gives the thing for a “there exists” goal, and this goal is not asking for a thing. If you have already given one and it was the wrong one, Undo takes it back.";
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
