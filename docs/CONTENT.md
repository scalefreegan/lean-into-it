# Content format

How the curriculum is written, as the loader (`web/server/loader.ts`) reads
it today. A file that breaks a rule here is not served; the Path page lists
it with the reason. What a widget or an exercise kind takes is declared in
one place, `web/shared/registry.ts`, and the loader checks lessons against
it; the Gallery page of the running app (`#/gallery`) draws every widget
and lists every parameter, and [CONTENT-REFERENCE.md](CONTENT-REFERENCE.md)
is generated from the registry: every widget, exercise kind and move, each
parameter, and examples that are checked. This file describes the format
around them. More widgets and exercise kinds are tracked in
`docs/STATUS.md`.

## Layout

```
content/
  curriculum.yaml             tracks and levels
  lessons/<track>/<name>.md   one lesson per file
  gallery.yaml                the Lab's Famous Proofs
```

A lesson file must sit in the folder of the track it names. File names are
free; `<level>-<order>-<slug>.md` keeps a folder in path order. Only the
`.md` files directly in `lessons/<track>/` are read: a folder inside one is
ignored, with no message.

## curriculum.yaml

```yaml
tracks:
  - id: logic                 # lowercase letters, digits, hyphens
    title: Logic and proof
    summary: One sentence.
levels:
  - id: 1                     # a whole number; levels are shown in order
    title: Logic you can see
    summary: One sentence.
    status: outline           # optional; omit once the level is written
    moves: [intro, apply]     # optional; the tactics the level introduces
    ladder: 1                 # optional, 1-4; how its proofs are entered (below)
    topics:                   # optional; what is still to be written
      - "And: proving both parts, using either part"
    concepts:                 # optional; the plan: what it will teach
      - { id: sets, title: "Sets, membership and subset", needs: [forall, implication] }
    planned:                  # optional; the level's lessons, in the Path's order
      - id: math-4-sets       # the id the lesson will have
        track: math
        title: What a set is
        summary: One sentence, shown on the Path.
        concepts: [sets]
        widgets: [partition, proof-state]
    new_widgets:              # optional; widgets a plan needs that do not exist yet
      - { id: partition, does: "A set cut into the classes of a relation." }
```

A track needs an `id` and a `title`; a level needs a whole-number `id`, used
once, and a `title`. `summary` is optional for both. Any `status` other than
`outline` means the level is written. A level's `moves` are shown on the
Path as written and are not checked against the board's moves, so they may
name tactics the board has no button for (`calc`, `have`). A topic
containing a colon needs quotes, as above: without them YAML reads it as
something else and the topic is dropped, with no message.

A level's plan says what is still to write, for the Tutor and the author;
the outlined levels (4 to 8) have one. A `concept` needs an id, used once
in the file, and a title; its `needs` are the concepts it builds on, each
declared in some level's `concepts` (at that level or an earlier one) or
listed by a lesson, and never round in a circle. A concept declared for a
level is first taught there: a lesson or planned lesson at an earlier
level may not list it (a later one may come back to it).
Each entry takes only the fields shown, and `needs`, `concepts` and
`widgets` are lists. A `planned` lesson needs an id, a title and a known track; its
`concepts` are declared or taught; each of its `widgets` is a registered
one or is listed under some level's `new_widgets` (whose ids must not be
registered already). A level's lessons are shown in the order of its
plan, across tracks, so an entry stays once its lesson is written. A
lesson the plan does not list (a proof-craft one, say) is placed by its
track's `order`s: after the last lesson of its track with an `order` no
greater than its own; failing that, just before the first lesson of its
track; failing that (none of its track is in the level yet), last in the
level. So within a track, planned lessons' `order`s must rise in plan order;
the loader refuses a plan where they do not. The Path lists a planned lesson as one to write until a lesson file
has its id; that lesson must then be in the level and track it was planned
for. A titled entry containing a comma or a colon needs quotes in the
`{ … }` form, as above. An outline level's `moves` are its plan as well:
they are shown on the Path, but the Moves page, the Lab and mastery count
only a written level's. `npm run check:content -- --gaps` lists the planned
lessons not yet written. A level marked `status: outline` never opens,
lessons or not. Before that line goes, each of the level's moves needs a
sentence and a Lab example in `web/shared/lab.ts` (the loader refuses a
written level without them). docs/PRD.md's Curriculum section says each
outlined level in prose, and a test keeps its titles and moves the same as
this file's.

A level's `ladder` is the rung its proofs default to, from clicking to
typing (default 1):

| Rung | The learner sees |
|---|---|
| 1 | The proof board, with only the exercise's own `moves`. |
| 2 | The proof board, with every move learned so far: the `moves` of this level (all of them, from its first lesson) and those before it, and the exercise's own. |
| 3 | The editor, with those moves behind "Show moves"; a click writes the board's line at the caret, with a `?` selected where the move needs something only the learner can say (`rw [?]`, `exact ?`). |
| 4 | The editor alone. |

A board exercise (its solution is lines the board writes) takes the level's
rung, so in a typing level it is typed, with its moves to hand. A typed
exercise takes at least 3. An exercise can set its own (`ladder`, below).
The learner can step down a rung for one exercise (a board exercise as far
as its own moves on the board; a typed one to the moves to hand) and back
up, keeping the proof so far between the two board rungs and the two
editor rungs; that is not help, and is not marked assisted, but each attempt records
the rung it was made at (`attempts.input_rung`). The Lean a click writes is
always shown: under the board, or in the editor.

## A lesson

Frontmatter between `---` lines, then the body.

```yaml
---
id: logic-1-if-then           # never change once live: progress is keyed on it
title: If… then
track: logic
level: 1
order: 1                      # position within the track and level; a level's plan orders the lessons it lists, but must agree
concepts: [implication]
summary: One or two sentences, shown on the Path.
exercises:
  - id: use-it                # unique in the lesson; never change once live
    title: Use an if-then
    mode: board               # board (can be clicked) or typed (needs the editor)
    says: Suppose P is true, and suppose that if P then Q. Then Q is true.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    moves: [apply, exact]     # board mode: ids from web/shared/moves.ts
    forbid: [tauto]           # optional: tactics switched off for this exercise
    solution: |
      apply hPQ
      exact hP
---
```

### Lesson fields

| Field | Meaning |
|---|---|
| `id` | Required. Lowercase letters, digits and hyphens; no other lesson may have it. Quote one that is all digits (`id: "2024"`): YAML reads a bare one as a number, which is refused. |
| `title` | Required. |
| `track`, `level` | Required. A track id and a level id from `curriculum.yaml`. |
| `order` | A number (`4.5` is one): the position within the track and level. Where the level's plan in `curriculum.yaml` lists the lesson, the plan sets its place, and its `order` must still rise with the plan's among its track's planned lessons: a lesson the plan does not list is placed by them. Default 0, and anything that is not a finite number (a quoted `"8"`, `.nan`) counts as 0. |
| `concepts` | A list of concept names. The first is the default `concept` of the lesson's exercises. |
| `summary` | Shown on the Path. |
| `craft` | Optional, `true` or `false`. A proof-craft lesson: how mathematicians work (try small cases, work backwards, look for a counterexample…), built round one worked problem and ending in exercises that use the habit. Marked "Proof craft" on the Path and on its page. Give it a fractional `order` (`4.5`) to place it after the lesson it needs. |
| `given` | Optional text (`given: \|`): Lean definitions that go in front of every exercise of the lesson, before the exercise's own `given`. No `sorry`, `admit` or `axiom`. |
| `exercises` | The list of exercises, below. |

The frontmatter must start on the file's first line. A key not in this
table is ignored, with no message, so a misspelt `sumary` or `order` goes
unnoticed here; inside an exercise a key the kind does not take is refused.

### Exercise fields

| Field | Meaning |
|---|---|
| `id` | Lowercase letters, digits and hyphens. Unique within the lesson. |
| `kind` | `prove` (the default) or `fill` (below). Every exercise has `id`, `kind`, `title` and `concept`; the other fields in this table are the parameters of `prove` in the registry. A field the kind does not take is refused, so a misspelt `forbid` cannot pass unnoticed. |
| `mode` | `board` or `typed`. Default `board` (or `typed` for a `ladder` of 3 or 4). `board` says the exercise can be done on the board: whether it is depends on its rung. |
| `ladder` | 1 to 4: the rung on the ladder (above, under curriculum.yaml). Default the level's, and at least 3 for a typed exercise. 1 or 2 on a typed exercise is refused. |
| `title` | Required. A short heading. |
| `says` | Required. The claim in plain English, as a mathematician would say it, on one line. Shown above the exercise. |
| `statement` | Required. The Lean statement after the keyword: binders, a colon, the claim. The server wraps it as `theorem lii_exercise <statement> := by`, with the learner's lines in brackets under it. It must not contain `:=` or `sorry`. Quote it: it contains colons. |
| `moves` | Required in board mode: the moves this proof needs, all that rung 1 offers. Every line of the `solution` must be a line one of them writes (`rw [h]`, `induction' n with n ih`, `obtain ⟨r, hr⟩ := h`); `npm test` replays it. A typed exercise may list some too: they join the moves its rung 3 has to hand. |
| `forbid` | Tactic names that may not appear in an answer. For exercises where one automatic tactic would skip the point. An exercise that forbids anything also forbids `try?`, which would run the forbidden tactics itself. |
| `given` | Optional. Lean definitions the statement is about (the functions of a verified-programs lesson, or a theorem proved earlier), placed between the import and the theorem. A lesson can also have a `given` in its frontmatter: it goes in front of every exercise's own. The words `sorry`, `admit` and `axiom` may not appear in it anywhere, a comment included. Mark a function `@[simp]` if `simp` should unfold it. The lesson page shows it folded under "The definitions this is about". |
| `solution` | A proof body, one tactic per line, that Lean accepts. Required. `npm test` checks every solution against the real Lean. |
| `concept` | The concept the exercise tests. Defaults to the lesson's first concept. |

Name hypotheses in the statement the way Lean users do: `hP` for a proof of
`P`, `hPQ` for a proof of `P → Q`. The board shows those names on the cards.

### What Lean is given

The browser sends only the learner's lines. The server builds the file Lean
checks (`assemble` in `web/shared/proof.ts`) from the exercise's own
`statement` and `given`:

```lean
import Mathlib

<the lesson's given, then the exercise's given, when there are any>

theorem lii_exercise <statement> := by
  (
    <the learner's lines>
  )

#print axioms lii_exercise
```

The exercise is solved when Lean reports no error and no `sorry` for that
theorem, the proof names nothing in `forbid`, the learner's lines stay
inside their brackets, and the axiom report arrives listing only Lean's
three standard axioms. Lines that could run a program or change how Lean
checks are refused before Lean sees them: `set_option`, a `#` command,
`run_tac` and its relatives, `unsafe`, `+native`, anything in the `Lean`
namespace, a name in `«»`, and the theorem's own name `lii_exercise`
(`escapesIn` in `web/shared/proof.ts` has the list). That holds for a
reference `solution` too: one that needs `set_option … in` cannot pass. So a `statement` must make sense after
`theorem lii_exercise`, and a `given` must compile after `import Mathlib`
with nothing else open.

### Fill the gap

`kind: fill` is a proof that is written out except for one step. It takes
`says`, `statement`, `given` and `forbid` as above, and:

| Field | Meaning |
|---|---|
| `proof` | The proof body with `<gap>` exactly once, where the missing step goes: a whole line, or part of one (`rw [<gap>] at h`). Not inside a comment or a string. No `sorry` or `admit`, and none of the lines refused in an answer (above). |
| `solution` | What goes in the gap: one line. `npm test` checks the completed proof against the real Lean. |
| `options` | Optional. Two to five fills to choose from, the solution among them. With it the learner chooses and does not type. `npm test` checks that Lean refuses every option but the solution. |

```yaml
  - id: add-one
    kind: fill
    title: The reason for a link
    says: For any real number x, |x + 1| ≤ |x| + 1.
    statement: "(x : ℝ) : |x + 1| ≤ |x| + 1"
    proof: |
      calc |x + 1| ≤ |x| + |1| := <gap>
        _ = |x| + 1 := by rw [abs_one]
    solution: abs_add_le x 1
```

Lean checks the proof with the learner's fill in place, in both forms: a
choice is not compared with `solution`, and a typed fill other than the
`solution` is accepted if the proof goes through with it. A fill is one line,
with its own brackets and strings closed and no comment, which keeps an
ordinary answer inside its gap; grading does not rest on that, since Lean
checks the whole completed proof. `forbid` applies to the fill only; the
proof around it may use anything. Beside the proof the learner sees what
the missing step has to show: Lean's goals where the gap starts, or at the
start of its line when the gap is part of a term. Put the gap where a
wrong answer fails on the gap's own line, not on a later one. The loader checks the shape; whether the solution compiles and
the other options fail is checked by `npm test`, as for every solution.

### True or false

`kind: truefalse` is a claim to decide. The learner says whether it holds,
then backs that up: a proof when it is true, a counterexample when it is
false. It takes `says`, `statement`, `given` and `forbid` as above, and:

| Field | Meaning |
|---|---|
| `truth` | `true` or `false`: which side the reference answer backs up. |
| `why` | Said at once to a learner who picks the other side: why the claim is true, or where it fails. |
| `solution` | A true claim: its proof. A false claim with `witness: proof`: the lines that prove `False` from `hc`, the claim at the counterexample's values. |
| `counterexample` | A false claim: a value for each `( )` variable of the statement, in order, separated by commas (`1` or `2, 3`). Numbers only. |
| `witness` | `values` (default): the learner gives only the values, and `close` shows the claim fails there. `proof`: they also write that proof. |
| `close` | With `witness: values`: the tactic that shows the claim fails at the values. Default `norm_num`; `decide` for small cases. |

```yaml
  - id: squares-and-doubles
    kind: truefalse
    title: Squares and doubles
    says: For every natural number n, n² is at least 2n.
    statement: "(n : ℕ) : n ^ 2 ≥ 2 * n"
    truth: false
    why: At n = 1, n² is 1 and 2n is 2. (From n = 2 on it does hold.)
    counterexample: "1"
```

A counterexample is checked by proving the claim's negation, which the
server writes from the statement: `¬ (∀ (n : ℕ), n ^ 2 ≥ 2 * n)`, proved
by `intro hall`, `have hc := hall (1)`, then `revert hc` and `close` (or
the learner's lines). So a false claim's conditions go in the claim
(`n > 0 → …`), not in binders, since every `( )` binder takes a value
(a hypothesis `(h : 0 < n)` would be asked for one), and a false claim has
no instance binders (`[Fact p.Prime]`). Values are numbers; for an ℕ or ℤ
variable a fraction or a decimal is refused (in Lean `1/2 : ℕ` is 0), and
for ℕ a negative one. After `have hc` the server clears `hall`, so a
counterexample's proof can use the claim only at the values given.
Lean has accepted the reference answer on its side (`npm test`), so the
other side cannot be backed up: picking it is answered at once with `why`
and kept as an attempt that failed, and the learner can switch. Nothing is
solved except by Lean. The true side is a typed proof (no board). The
second form of this kind in docs/PRD.md, finding the flawed step in an
argument, is its own kind, `flaw` (below).

### Predict, read, match and flaw

Four kinds about reading rather than writing: three read Lean, and `flaw`
reads an argument in words.

`kind: predict` shows the state before a move, the move, and states to
choose from; the learner picks the state the move leaves. It takes `says`,
`statement` and `given` as above, and:

| Field | Meaning |
|---|---|
| `before` | Optional. Proof lines that run first, to reach the state shown. |
| `move` | The one tactic line whose effect is predicted. |
| `options` | Two to five states, each as Lean prints it (facts, then a line starting `⊢`; several goals one after another, a blank line between) or `no goals`. Write the misreadings learners make. |
| `solution` | The option Lean leaves. |

```yaml
  - id: apply-backwards
    kind: predict
    title: Working backwards
    says: Using an implication to change what is left to prove.
    statement: "(p q : Prop) (hp : p) (hpq : p → q) : q"
    move: apply hpq
    options:
      - "p q : Prop\nhp : p\nhpq : p → q\n⊢ p"
      - "p q : Prop\nhp : p\nhpq : p → q\n⊢ q"
    solution: "p q : Prop\nhp : p\nhpq : p → q\n⊢ p"
```

Lean decides: the server runs the move and compares the state Lean leaves
with the one chosen, facts in any order and spacing aside, but names and
types as Lean prints them. `solution` is not what the learner is marked
against; it is what `npm test` and `check:content` hold Lean to. They
refuse the exercise when Lean's state is not the solution, or is also
another option. Copy the states from Lean (the Playground shows them).

`kind: read` shows a Lean `statement` (and `given`); the learner chooses
which of the `options`, sentences, says what it claims. `solution` is the
right sentence and `why` (optional) is shown after an answer. `kind: match`
has `says`, `english` (two to six sentences) and `lean` (the proposition
for each, in the same order); the learner pairs them, and the Lean is shown
in another order. These two, and `flaw` below, are fixed answers, marked
against what the author wrote, not by Lean: the one exception to "Lean
decides", for recognising what a statement or an argument says. Lean still checks that every statement
they show is one it can read (`npm test`, `check:content`).

`kind: flaw` is a plausible argument in words with one wrong step; the
learner says which. It has `says` (what the argument claims to show),
`steps` (two to eight, in order), `flaw` (the wrong step's number, from 1)
and `why` (what is wrong with it, shown once the learner finds it; after a
wrong pick they are told only that the step holds up). A fixed answer, like
`read`, but with no Lean in it at all, so nothing checks the answer key
but the author (and a lesson the Tutor writes gets no Lean check of it).

```yaml
  - id: two-equals-one
    kind: flaw
    title: Where it breaks
    says: A proof that 2 = 1.
    steps:
      - Let a and b be numbers with a = b.
      - "Multiply both sides by a: a² = ab."
      - "Factor after subtracting b²: (a + b)(a − b) = b(a − b)."
      - "Divide both sides by a − b: a + b = b."
      - Since a = b, that says 2b = b, so 2 = 1.
    flaw: 4
    why: a − b is 0, and dividing by 0 is not allowed.
```

### The body

A small markdown subset: `##` and `###` headings, paragraphs, `**bold**`,
`*italic*`, `` `code` ``, bulleted and numbered lists, fenced code blocks,
and `>` block quotes, which are drawn as a "key idea" box.

An exercise is placed with a fence that names it:

````
```exercise
id: use-it
```
````

Exercises not placed in the body follow at the end, in declared order. A
fence that names an exercise the lesson does not have, or places one a
second time, is refused.

### Widgets

A widget is embedded with a fence that names it with `type:` and gives its
parameters as YAML:

````
```widget
type: proof-state
state: |
  P Q : Prop
  hP : P
  hPQ : P → Q
  ⊢ Q
caption: Where the proof starts.
```
````

| Widget | What it shows | Parameters |
|---|---|---|
| `proof-state` | A proof state as the board draws it: the objects, the facts on teal cards, the goal on an amber card. | `state` (required): the state as Lean prints it, one `name : statement` line per fact and then `⊢ goal`; a blank line starts another goal. `caption`: one line under the cards. |
| `move-list` | Some of the board's moves, each with the sentence that says what it does. | `moves` (required): move ids, like `[intro, exact]`. |
| `plot` | Graphs of up to four functions of x, with a point that can be moved along them and a view that can be dragged and zoomed. | `functions` (required): expressions in x, like `["2x + 1", "x^2"]`. `x`, `y`: the stretch of each axis shown, like `[-3, 3]`. `domain`: draw only between two values of x. `trace`: where the point starts. `caption`. |
| `number-line` | Points, shaded intervals and a distance on a line, and optionally a point x that can be moved, with a sentence saying where it is. | `range`. `points`: numbers, or `"sqrt(2): √2"` for a number and its label. `intervals`: `["(2, 4)", "[0, inf)"]`. `distance`: two numbers; `via`: a third, for the detour through it. `near`: a centre and a radius, the window \|x − c\| < r. `probe`: where x starts. `caption`. |
| `square-of-sum` | A square of side a + b in four pieces, with sliders: the picture behind (a + b)² = a² + 2ab + b². | `a`, `b`: the lengths at the start. |
| `truth-table` | Every row of a formula's truth table, a column for each part, and optionally a last column for the learner to fill in and check. | `formula` (required): one-letter propositions with `∧ ∨ ¬ → ↔`, as in `(P → Q) ∧ ¬Q → ¬P`; a chain of ↔ needs brackets, as in Lean. `steps`: a column per part (default true). `fill`: the learner fills the last column. `caption`. |
| `informal-formal` | A proof in sentences beside the Lean of one of the lesson's exercises; selecting a sentence lights its lines, selecting a line shows the state after it. Waits until that exercise is solved. | `exercise` (required): a `prove` exercise of this lesson; its `solution` is the Lean side. `steps` (required): `"<lines>: <sentence>"`, lines counted from 1 in the solution (`2`, `2-4`, `1, 3`); one sentence may cover several lines and a line several sentences, and a line no sentence covers is marked unsaid. Pair a solution written one tactic per line: the state shown is Lean's at the end of the line, which for a line ending inside a nested `by` or a term is not "after it". `caption`. |
| `epsilon-delta` | The definition of a limit: sliders for ε (a band around L) and δ (a strip around a); the box turns green when every x in the strip but a has f(x) in the band. | `function` (required), `at` (required), `limit` (default f(a)), `epsilon`, `delta`, `x`, `y`, `caption`. |
| `secant-tangent` | A secant through a and a + h turning into the tangent as h goes to 0, with its slope. | `function`, `at` (required), `h`, `x`, `y`, `caption`. |
| `riemann-sum` | Rectangles under a curve, left, right or midpoint, with a slider for how many, beside the area. | `function`, `from`, `to` (required), `n`, `rule`, `caption`. |
| `sequence-limit` | A sequence's terms with an ε band around its limit, and the first N from which every term drawn is inside. | `term` (an expression in n) and `limit` (required), `epsilon`, `start`, `count`, `caption`. |
| `induction-dominoes` | A row of dominoes to push; taking away the base case or the step stops the chain. | `count`, `start` (the first domino's number), `claim` (what P(n) says), `gap` (the step fails from this n to the next), `caption`. |
| `set-diagram` | The regions of two or three sets that a formula names; beside a second formula, whether the two name the same regions; or for the learner to shade and check. | `formula` (required): set names with `∪ ∩ \ ᶜ ∅`, a mix of them bracketed. `against`, `sets`, `empty` (a formula whose regions hold nothing: `'A \ B'` draws A ⊆ B), `fill`, `caption`. |
| `function-arrows` | A function between two small sets as arrows the learner can re-aim, judged injective or surjective; or where a set goes, or what lands in one. | `from`, `to`, `arrows` (required), like `["1 -> a"]`. `show`: both, injective or surjective. `edit`, `image`, `preimage` (a set, not both), `caption`. |

The Gallery (`#/gallery`) has the full list of parameters, drawn examples
and the block that produces each.

An expression is written much as on paper: `2x + 1`, `x^2`, `(x^2 + x)/x`,
`|x - 3|` or `abs(x - 3)`, `sqrt(x)`, `sin`, `cos`, `tan`, `exp`, `log`
(the natural logarithm), `pi`, `e`. Quote it in YAML. It is read by a small
parser of its own (`web/shared/expr.ts`) and never run as code; anything
the parser does not know is refused when the lesson loads. So is what
could be read two ways: write `(1/2)x` or `1/(2x)`, not `1/2x`, and
`0.001` or `10^-3`, not `1e-3`.

A block with no `type`, an unknown widget, a missing or misspelt parameter,
or a value of the wrong kind is refused, and the Path page says which block
(`widget block 2 (move-list): …`) and why. So is a block that is never
closed, and a fence that is nearly ` ```widget ` or ` ```exercise ` but not
exactly (indented, capitalised, with a space, or with tildes): it would
otherwise be shown to the learner as a box of YAML.

A code block ends at a line of at least as many backticks as opened it. To
show a widget block in the prose without embedding it, put it inside a
fence of four backticks.

A `proof-state` is drawn as written. Nothing checks it against Lean, so
copy the state from the app or the Playground.

### Adding a widget or an exercise kind

1. Add the entry to `WIDGETS` or `EXERCISES` in `web/shared/registry.ts`,
   and its name to `WidgetType` or `ExerciseKind`: what it is, each
   parameter with its kind and a one-line `doc`, and at least one example:
   a set of parameters for a widget, a whole exercise for a kind.
2. TypeScript now refuses to build until the component exists in
   `web/src/widgets/registry.ts` or `web/src/exercises/registry.ts`.
3. Run `npm run gen:reference` and commit `docs/CONTENT-REFERENCE.md`. The
   same after changing a parameter, an example or a move: `npm test` fails
   while the file is stale.
4. `npm test` checks that the examples pass the entry's own checks, that an
   exercise example loads and Lean accepts it, and `#/gallery` draws the
   widget examples.

That is all a widget needs. An exercise kind needs more. Its parameters and
its component go through the registry, but the `Exercise` type
(`web/shared/content.ts`), the object the loader builds (`parseExercise`)
and the checking route (`checkExercise` in `web/server/check.ts`) are
written by hand for each kind. For most kinds `checkExercise` turns the
answer into a proof body for Lean to judge; `fill` and `truefalse` show
how, and `predict` compares Lean's state instead. A fixed-answer kind
(`read`, `match`, `flaw`; `isFixed` in `web/shared/recognize.ts`) is marked in `checkFixed` without Lean, and its Lean is
checked for readability in `checkSolution` (`web/server/contentcheck.ts`).

A widget parameter may not be called `type`, and an exercise kind's
parameter may not be called `id`, `kind`, `title` or `concept`: those
belong to the block.

## A complete lesson

A whole file, as it would sit at `content/lessons/logic/1-08-chains-of-reasons.md`:

`````
---
id: logic-1-chains-of-reasons
title: Chains of reasons
track: logic
level: 1
order: 8
concepts: [implication]
summary: Two if-thens in a row make a third.
exercises:
  - id: two-steps
    title: Two steps
    mode: board
    says: Suppose P is true, that if P then Q, and that if Q then R. Then R is true.
    statement: "(P Q R : Prop) (hP : P) (hPQ : P → Q) (hQR : Q → R) : R"
    moves: [apply, exact]
    solution: |
      apply hQR
      apply hPQ
      exact hP
  - id: which-fact
    kind: fill
    title: Which fact finishes it
    says: Suppose P is true, and that if P then Q. Then Q is true.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    proof: |
      apply hPQ
      exact <gap>
    options: [hP, hPQ]
    solution: hP
---

If P gives Q, and Q gives R, then P gives R: follow one reason with the next.

```widget
type: proof-state
state: |
  P Q R : Prop
  hP : P
  hPQ : P → Q
  hQR : Q → R
  ⊢ R
caption: Where the first exercise starts.
```

> Work backwards from the goal: R would follow from Q, and Q from P.

```exercise
id: two-steps
```

The same idea with one step left for you:

```exercise
id: which-fact
```

## What you used

```widget
type: move-list
moves: [apply, exact]
```
`````

`npm test` loads this very example and gives its solutions to Lean.

## Spoken forms

Listen mode reads a lesson aloud. Running text is read as written, with
symbols said as words (a² is "a squared", ≤ is "is at most"). Lean and
formulas need more care, and there are two things an author can write.

**A code span's spoken form.** Put `{say: …}` straight after the closing
backtick. It is said in place of the code and never shown; the code is
marked as one unit while it is said.

```text
Lean prints that as `∀ m < n, P m`{say: for every m less than n, P of m}.
```

Without one, the span is said from the tables in `web/shared/tts/say.ts`:
names by their pieces (`Nat.add_comm` is "nat add comm", `rfl` is "refl",
`h1` is "h 1"), tactic lines as typed (`rw [h] at h2` is "rewrite h at h
2"), simple formulas in words (`A ∧ B` is "A and B", `n : ℕ` is "n, a
natural number"). The tables say whether they are sure. A span they are not
sure of is still said as well as they can, and `npm run check:content --
--gaps` lists it with what is said now, so write a form for it. `{say:}`
with nothing in it says nothing: the span is passed over. A form cannot
contain `}`. Forms are for lesson text only: an exercise's `title` and
`says` are shown as written, so reword those instead.

What the tables do with brackets: round a single thing or a function's
argument they are not said (`f (g x)` is "f g x"); round anything with an
operator in it they are, since they change the meaning (`(a + b) + c` is
"open bracket a plus b close bracket plus c"). Where that is clumsy, write
a form.

**A code block's summary.** A fenced block is shown and not read. To have
something said in its place, put `say: …` at the end of the opening line;
the block is marked while it is said.

````text
```lean say: A calc with two links. a equals b plus 1, by h 1. And that equals 2 times c plus 1, by rewriting with h 2.
calc a = b + 1 := h1
  _ = 2 * c + 1 := by rw [h2]
```
````

Say what the code does, in the words you would use reading it to someone,
and write names the way the tables say them ("h 1", "x's", "I H"). The
block is still checked by Lean as before: only the first word of the
opening line decides that. A block with no summary is passed over in
silence, which suits a block the prose around it already describes. Only
code blocks take a summary: an ` ```exercise ` or ` ```widget ` line must
be written exactly, with nothing after it.

A new name or symbol that is said badly everywhere belongs in the tables
(`NAMES`, `SYMBOLS` in `say.ts`), not in a form on every use.

## Writing a lesson

- Say the argument the way a mathematician would before showing the Lean.
- One new move at a time, each used straight away in an exercise.
- Board exercises first; a typed exercise once the moves are familiar.
- A lesson is ten minutes or less.
- Check it: `npm run check:content -- --lesson <id>` and open the lesson in
  the app.

## The Famous Proofs gallery

`content/gallery.yaml` holds the classic proofs shown in the Lab
(`#/lab/famous`), each in words beside a Lean proof, with its proof map.
It is a list under `entries:`; each entry has these fields, all required
but `formal` and `mathlib`:

| Field | What it is |
|---|---|
| `id` | Lowercase with hyphens; the page's address is `#/lab/famous/<id>`. |
| `title`, `says` | The theorem's name, and the claim in plain words. |
| `who`, `why` | Who proved it and when; why it matters. A sentence or two each. |
| `level` | The level whose moves are enough to follow the Lean. The entry links to it on the Path. |
| `statement`, `solution` | The Lean statement and proof, written as an exercise's are (see "What Lean is given"). |
| `steps` | The proof in words, one sentence a step, each tied to lines of `solution` as in the `informal-formal` widget: `"2-3: To show R, it is enough to show Q."` |
| `formal` | How the Lean statement says the theorem, where it says less or says it differently. |
| `mathlib` | Mathlib's name for the theorem, when it has one: linked to Mathlib's documentation. |

Lean checks every `solution` as it checks an exercise's, in `npm test` and
in `npm run check:content`. Where the theorem's full proof is long, prove
the heart of it (the square root of 2 is irrational is proved for whole
numbers p and q) and say so in `formal`, with Mathlib's name for the whole.

## Checking content

`npm run check:content` reads `content/` as the app does and prints what the
loader refuses. Then it starts a Lean of its own and, lesson by lesson:

- gives every exercise's `solution`, and every Famous Proofs entry's, to
  Lean the way the app gives it a learner's answer, and reports Lean's message, a goal left over, or a
  forbidden tactic if it is not accepted;
- gives every other `options` entry of a fill exercise to Lean, and reports
  one that Lean accepts;
- compiles the lesson's ` ```lean ` blocks (` ```lean4 ` too) that are
  whole declarations or commands: the first line of code, after any
  comment, starts with `def`, `theorem`, `example`, `@[…]`, `#eval` and the
  like. They are compiled in order in one file, laid out as a learner's own
  file would be: the lesson's `given` at the top, then the blocks. So a
  block may use what an earlier block or the `given` defines, a name used
  twice is refused, and so is a name the library already has. A `theorem`,
  `lemma` or `example` shown as a statement with no `:=` is checked as a
  statement;
- compares a definition that a block shows with the lesson's `given` when
  both declare the same name: they must be the same apart from comments,
  attributes and spacing, since the `given` is what the exercises use;
- looks up the name in a one-line block of the form
  `abs_lt : |a| < b ↔ -b < a ∧ a < b`. A name with a `_` or a `.` in it is
  taken for a library name, unless it looks like a hypothesis (`h_pos`,
  `hx_pos`). Only the name is checked: the statement beside it is written
  with variables the lesson leaves unsaid, and a wrong one is not caught.

Any other ` ```lean ` block is a fragment and is not compiled: a proof
state, a few tactic lines, a term, an outline with `…` in it. The summary
line counts them. Each problem is printed as file, exercise or line, and
reason, and the command exits 1 if there is any. If Lean runs out of time
or crashes on one item, that is that item's problem and the run goes on.

What it does not check, so the author must:

- The result of an `#eval` written in the prose, and anything in a fragment.
- A `sorry` in a block: Lean only warns, and warnings are not problems.
- Definitions in one exercise's own `given`: blocks see the lesson's `given`
  only.
- The blocks of a lesson are compiled together under one 20-second limit.

To show Lean that is meant to fail, or that the check misreads, use a fence
with another name (` ```text `): the page draws every fence alike, and only
` ```lean ` blocks are checked.

`#eval` in a block is run, with this user's permissions, like anything else
given to Lean. Read a lesson from elsewhere before checking it.

| Option | |
|---|---|
| `--no-lean` | Structure only. Fast; nothing is checked against Lean. |
| `--lean` | Fail where Lean is not installed. Without it the Lean pass is skipped there, with a line saying nothing was checked. |
| `--lesson <id>` | The Lean pass for that lesson only. May be repeated. |
| `--gaps` | Also list concepts no exercise tests, moves a level introduces that no exercise uses, levels with no lesson, topics still to write, and formulas Listen mode is not sure how to say (see "Spoken forms"). Never a failure. |

`npm test` checks the same solutions and more (that each board solution is
what the board's clicks write); `check:content` is the quicker one to run
while writing, and the one that reads the lesson's prose.
