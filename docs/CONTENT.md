# Content format

How the curriculum is written, as the loader (`web/server/loader.ts`) reads
it today. A file that breaks a rule here is not served; the Path page lists
it with the reason. What a widget or an exercise kind takes is declared in
one place, `web/shared/registry.ts`, and the loader checks lessons against
it; the Gallery page of the running app (`#/gallery`) draws every widget
and lists every parameter. This file describes the format around them. More
widgets, more exercise kinds and a generated reference are tracked in
`docs/STATUS.md`.

## Layout

```
content/
  curriculum.yaml             tracks and levels
  lessons/<track>/<name>.md   one lesson per file
```

A lesson file must sit in the folder of the track it names. File names are
free; `<level>-<order>-<slug>.md` keeps a folder in path order.

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
    status: outline           # optional; omit once the level has lessons
    moves: [intro, apply]     # optional; the tactics the level introduces
    topics:                   # optional; what is still to be written
      - "And: proving both parts, using either part"
```

A topic containing a colon needs quotes, as above.

## A lesson

Frontmatter between `---` lines, then the body.

```yaml
---
id: logic-1-if-then           # never change once live: progress is keyed on it
title: If… then
track: logic
level: 1
order: 1                      # position within the track and level
concepts: [implication]
summary: One or two sentences, shown on the Path.
exercises:
  - id: use-it                # unique in the lesson; never change once live
    title: Use an if-then
    mode: board               # board (click moves) or typed (an editor)
    says: Suppose P is true, and suppose that if P then Q. Then Q is true.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    moves: [apply, exact]     # board mode: ids from web/shared/moves.ts
    forbid: [tauto]           # optional: tactics switched off for this exercise
    solution: |
      apply hPQ
      exact hP
---
```

### Exercise fields

| Field | Meaning |
|---|---|
| `id` | Lowercase letters, digits and hyphens. Unique within the lesson. |
| `kind` | `prove` (the default) or `fill` (below). Every exercise has `id`, `kind`, `title` and `concept`; the other fields in this table are the parameters of `prove` in the registry. A field the kind does not take is refused, so a misspelt `forbid` cannot pass unnoticed. |
| `mode` | `board` or `typed`. Default `board`. |
| `title` | A short heading. |
| `says` | The claim in plain English, as a mathematician would say it, on one line. Shown above the exercise. |
| `statement` | The Lean statement after the keyword: binders, a colon, the claim. The server wraps it as `theorem lii_exercise <statement> := by`, with the learner's lines in brackets under it. It must not contain `:=` or `sorry`. Quote it: it contains colons. |
| `moves` | Board mode only, required there: the moves on offer. Every line of the `solution` must be a line one of them writes (`rw [h]`, `induction' n with n ih`, `obtain ⟨r, hr⟩ := h`); `npm test` replays it. |
| `forbid` | Tactic names that may not appear in an answer. For exercises where one automatic tactic would skip the point. An exercise that forbids anything also forbids `try?`, which would run the forbidden tactics itself. |
| `given` | Optional. Lean definitions the statement is about (the functions of a verified-programs lesson, or a theorem proved earlier), placed between the import and the theorem. A lesson can also have a `given` in its frontmatter: it goes in front of every exercise's own. No `sorry`, no `axiom`. Mark a function `@[simp]` if `simp` should unfold it. The lesson page shows it folded under "The definitions this is about". |
| `solution` | A proof body, one tactic per line, that Lean accepts. Required. `npm test` checks every solution against the real Lean. |
| `concept` | The concept the exercise tests. Defaults to the lesson's first concept. |

Name hypotheses in the statement the way Lean users do: `hP` for a proof of
`P`, `hPQ` for a proof of `P → Q`. The board shows those names on the cards.

### Fill the gap

`kind: fill` is a proof that is written out except for one step. It takes
`says`, `statement`, `given` and `forbid` as above, and:

| Field | Meaning |
|---|---|
| `proof` | The proof body with `<gap>` exactly once, where the missing step goes: a whole line, or part of one (`rw [<gap>] at h`). No `sorry`. |
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

Exercises not placed in the body follow at the end, in declared order.

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
   parameter with its kind and a one-line `doc`, and for a widget at least
   one set of example parameters.
2. TypeScript now refuses to build until the component exists in
   `web/src/widgets/registry.ts` or `web/src/exercises/registry.ts`.
3. `npm test` checks that the examples pass the entry's own checks, and
   `#/gallery` draws them.

That is all a widget needs. An exercise kind needs more. Its parameters and
its component go through the registry, but the `Exercise` type
(`web/shared/content.ts`), the object the loader builds (`parseExercise`)
and the checking route (`checkExercise` in `web/server/check.ts`) are
written by hand for each kind. Both kinds so far are a statement and an
answer that Lean judges, and `checkExercise` turns the answer into the
proof body to check; `fill` shows how. A kind that Lean does not judge
would need a route of its own.

A widget parameter may not be called `type`, and an exercise kind's
parameter may not be called `id`, `kind`, `title` or `concept`: those
belong to the block.

## Writing a lesson

- Say the argument the way a mathematician would before showing the Lean.
- One new move at a time, each used straight away in an exercise.
- Board exercises first; a typed exercise once the moves are familiar.
- A lesson is ten minutes or less.
- Check it: `npm run check:content -- --lesson <id>` and open the lesson in
  the app.

## Checking content

`npm run check:content` reads `content/` as the app does and prints what the
loader refuses. Then it starts a Lean of its own and, lesson by lesson:

- gives every exercise's `solution` to Lean the way the app gives it a
  learner's answer, and reports Lean's message, a goal left over, or a
  forbidden tactic if it is not accepted;
- gives every other `options` entry of a fill exercise to Lean, and reports
  one that Lean accepts;
- compiles the lesson's ` ```lean ` blocks that are whole declarations (the
  first line starts with `def`, `theorem`, `example`, `#eval` and the
  like). They are compiled in order in one file after the lesson's `given`,
  so a block may use what an earlier block or the `given` defines, and may
  show a definition that the `given` also has. A `theorem` shown as a
  statement with no `:=` is checked as a statement;
- looks up the name in a one-line block of the form
  `abs_lt : |a| < b ↔ -b < a ∧ a < b` (a name with a `_` or a `.` in it).
  Only the name is checked: the statement is written with variables the
  lesson leaves unsaid.

Any other ` ```lean ` block is a fragment and is not compiled: a proof
state, a few tactic lines, a term, an outline with `…` in it. The summary
line counts them. Each problem is printed as file, exercise or line, and
reason, and the command exits 1 if there is any.

| Option | |
|---|---|
| `--no-lean` | Structure only. Fast; nothing is checked against Lean. |
| `--lean` | Fail where Lean is not installed. Without it the Lean pass is skipped there, with a line saying nothing was checked. |
| `--lesson <id>` | The Lean pass for that lesson only. May be repeated. |
| `--gaps` | Also list concepts no exercise tests, moves a level introduces that no exercise uses, levels with no lesson, and topics still to write. Never a failure. |

`npm test` checks the same solutions and more (that each board solution is
what the board's clicks write); `check:content` is the quicker one to run
while writing, and the one that reads the lesson's prose.
