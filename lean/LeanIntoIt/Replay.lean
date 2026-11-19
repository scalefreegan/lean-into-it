import Lean.Replay
import Lean.Elab.Command

/-!
# `#lii_replay`: every constant this file added, through the kernel again

`#print axioms` cannot see a theorem a metaprogram added with
`debug.skipKernelTC`: it rests on no axiom, and the kernel never checked it.
After a proof is accepted, the server asks for this command below the
theorem (`web/shared/proof.ts`, `withReplay`). It takes every constant the
current file added (the lesson's `given`, the theorem, and anything the
proof added on the way), renames each one and every reference to them under
`_lii_replay`, and replays the renamed copies with
`Lean.Kernel.Environment.replay`, which sends each declaration to the
kernel and compares constructors and recursors with the ones the kernel
generates (the method of `lean4checker`).

The renaming is what makes this cheap: replaying under the original names
needs an environment without them, that is `import Mathlib` again (about
ten seconds). Under new names the copies go into the current environment,
which is then thrown away; the file's own environment is not changed.

It reports `lii-replay: ok, N constants` as information, or an error naming
the declaration the kernel refused. The server counts a proof solved only
with the first, on the line it asked for it.
-/

namespace LeanIntoIt.Replay
open Lean Elab Command

/-- The prefix the copies are replayed under. -/
def root : Name := `_lii_replay

/-- Rename every reference to a local constant in `e`. -/
partial def renameExpr (isLocal : Name → Bool) (e : Expr) : Expr :=
  e.replace fun
    | .const n ls => if isLocal n then some (.const (root ++ n) ls) else none
    | .proj s i x => if isLocal s then some (.proj (root ++ s) i (renameExpr isLocal x)) else none
    | _ => none

/-- A constant under its new name, with every reference to a local constant renamed. -/
def renameInfo (isLocal : Name → Bool) : ConstantInfo → ConstantInfo
  | .axiomInfo v => .axiomInfo { v with name := r v.name, type := e v.type }
  | .defnInfo v => .defnInfo { v with name := r v.name, type := e v.type, value := e v.value, all := v.all.map r }
  | .thmInfo v => .thmInfo { v with name := r v.name, type := e v.type, value := e v.value, all := v.all.map r }
  | .opaqueInfo v => .opaqueInfo { v with name := r v.name, type := e v.type, value := e v.value, all := v.all.map r }
  | .quotInfo v => .quotInfo { v with name := r v.name, type := e v.type }
  | .inductInfo v => .inductInfo { v with name := r v.name, type := e v.type, all := v.all.map r, ctors := v.ctors.map r }
  | .ctorInfo v => .ctorInfo { v with name := r v.name, type := e v.type, induct := r v.induct }
  | .recInfo v =>
    .recInfo { v with name := r v.name, type := e v.type, all := v.all.map r,
                      rules := v.rules.map fun rl => { rl with ctor := r rl.ctor, rhs := e rl.rhs } }
where
  r (n : Name) : Name := if isLocal n then root ++ n else n
  e (x : Expr) : Expr := renameExpr isLocal x

/-- Replay every constant the current file added, renamed, through the kernel. -/
elab "#lii_replay" : command => do
  let env ← getEnv
  let local_ := env.constants.map₂
  let isLocal (n : Name) : Bool := local_.contains n
  -- Nothing may already sit where a copy goes. Lean's replay skips a theorem
  -- the environment already holds under the same name and type, so a
  -- constant planted under `root` beforehand would stand in for its copy
  -- unchecked. The file has no reason to name anything under `root`.
  if let some n := local_.foldl (fun found n _ => found <|> (if root.isPrefixOf n || env.contains (root ++ n) then some n else none)) none then
    logError m!"lii-replay: the kernel refused this: {n} is in the way of the copies this check makes"
    return
  let copies := local_.foldl (fun (m : Std.HashMap Name ConstantInfo) n ci =>
    m.insert (root ++ n) (renameInfo isLocal ci)) {}
  try
    let _ ← liftM (m := IO) <| env.toKernelEnv.replay copies
    logInfo m!"lii-replay: ok, {copies.size} constants"
  catch ex =>
    logError m!"lii-replay: the kernel refused this: {ex.toMessageData}"

end LeanIntoIt.Replay
