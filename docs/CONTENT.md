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
| `kind` | `prove` (the default, and the only kind so far). Every exercise has `id`, `kind`, `title` and `concept`; the other fields below are the parameters of `prove` in the registry. A field the kind does not take is refused, so a misspelt `forbid` cannot pass unnoticed. |
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
| `number-line` | Points, shaded intervals and a distance on a line, and optionally a point x that can be moved, with a sentence saying where it is. | `range`. `points`: numbers, or `"sqrt(2): √2"` for a number and its label. `intervals`: `["(2, 4)", "[0, inf)"]`. `distance`: two numbers. `near`: a centre and a radius, the window \|x − c\| < r. `probe`: where x starts. `caption`. |
| `square-of-sum` | A square of side a + b in four pieces, with sliders: the picture behind (a + b)² = a² + 2ab + b². | `a`, `b`: the lengths at the start. |

The Gallery (`#/gallery`) has the full list of parameters, drawn examples
and the block that produces each.

An expression is written as on paper: `2x + 1`, `x^2`, `(x^2 + x)/x`,
`|x - 3|` or `abs(x - 3)`, `sqrt(x)`, `sin`, `cos`, `tan`, `exp`, `log`
(the natural logarithm), `pi`, `e`. Quote it in YAML. It is read by a small
parser of its own (`web/shared/expr.ts`) and never run as code; anything
the parser does not know is refused when the lesson loads.

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

That is all a widget needs. An exercise kind needs more, because only its
parameters and its component go through the registry so far. The `Exercise`
type (`web/shared/content.ts`), the object the loader builds
(`parseExercise`) and the checking route (`web/server/check.ts`) are still
shaped for `prove`: a statement, a proof body, Lean's verdict. The first
kind that is not a proof (`lii-6xv.1`) has to widen those three.

A widget parameter may not be called `type`, and an exercise kind's
parameter may not be called `id`, `kind`, `title` or `concept`: those
belong to the block.

## Writing a lesson

- Say the argument the way a mathematician would before showing the Lean.
- One new move at a time, each used straight away in an exercise.
- Board exercises first; a typed exercise once the moves are familiar.
- A lesson is ten minutes or less.
- Check it: `npm test` (every solution against Lean) and open the lesson in
  the app.
