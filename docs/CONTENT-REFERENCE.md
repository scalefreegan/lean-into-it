# Lean Into It: widget, exercise and move reference

Generated from `web/shared/registry.ts` and `web/shared/moves.ts` by `npm run gen:reference`. Do not edit by hand: `npm test` fails when this file and the registry disagree.
The file format these plug into is described in [CONTENT.md](CONTENT.md). The Gallery page of the running app (`#/gallery`) draws every widget example below.

A parameter the entry does not list, a missing required one, or a value of the wrong kind is refused when the lesson loads, and the Path page says which and why.

## Widgets

A widget is a fenced block in a lesson's body: ` ```widget `, then `type:` and the parameters as YAML.

### `proof-state`

A proof state drawn as the proof board draws it: what it is about, the facts in hand on teal cards, the goal on an amber card. For showing a state in the prose where no proof is being asked for.

| Parameter | Value | |
|---|---|---|
| `state` (required) | a proof state as Lean prints it, indented under `state: \|`: facts, then a line starting `⊢` | The state as Lean prints it: one `name : statement` line per fact, then `⊢ goal`. A blank line starts another goal; `case name` may come first. |
| `caption` | one line of text | One line shown under the cards. |

````
```widget
type: proof-state
state: |
  P Q R : Prop
  hPQ : P → Q
  hQR : Q → R
  ⊢ P → R
```
````

````
```widget
type: proof-state
state: |
  case left
  P Q : Prop
  hP : P
  hQ : Q
  ⊢ P

  case right
  P Q : Prop
  hP : P
  hQ : Q
  ⊢ Q
caption: "After constructor on the goal P ∧ Q: two goals, the first one in full."
```
````

### `move-list`

Some of the proof board's moves, each with the sentence that says what it does. For a lesson's summary, or for introducing a move before the exercise that uses it.

| Parameter | Value | |
|---|---|---|
| `moves` (required) | a list of move ids (see Moves below): `[intro, exact]` | The moves to list, by id, in the order to show them. |

````
```widget
type: move-list
moves: [intro, apply, exact]
```
````

````
```widget
type: move-list
moves: [ring, linarith, positivity]
```
````

### `plot`

The graph of one or more functions of x. A point can be moved along the curves to read off values; the view can be dragged, zoomed and reset.

| Parameter | Value | |
|---|---|---|
| `functions` (required) | a list of expressions in x: `["2x + 1", "x^2"]` | The functions to draw, at most 4: `["2x + 1", "x^2"]`. Arithmetic, powers, abs or \|…\|, sqrt, sin, cos, tan, exp, log, pi, e. |
| `x` | two numbers, the smaller first: `[-5, 5]` | The stretch of the x-axis shown at first. Default [-5, 5]. |
| `y` | two numbers, the smaller first: `[-5, 5]` | The stretch of the y-axis shown at first. Default: fitted to the curves. |
| `domain` | two numbers, the smaller first: `[-5, 5]` | Draw the curves only for x between these two numbers, as for a function looked at on an interval. |
| `trace` | a number | Where the movable point starts on the x-axis. Default: the middle of the view. |
| `caption` | one line of text | One line shown under the graph. |

````
```widget
type: plot
functions: ["2x + 1"]
x: [-3, 3]
```
````

````
```widget
type: plot
functions: ["x^2", "|x|"]
x: [-3, 3]
trace: -1
caption: Two functions that come down on the left of 0 and go up on the right.
```
````

````
```widget
type: plot
functions: ["2x + 1", "3"]
x: [-1, 2]
y: [-1, 5]
domain: [0, 1]
caption: "Between x = 0 and x = 1 the line stays under height 3."
```
````

````
```widget
type: plot
functions: ["1/x"]
x: [-4, 4]
y: [-4, 4]
```
````

### `number-line`

A number line with points, intervals and distances marked on it. With `probe`, a point x that can be moved along the line, with a readout of where it is.

| Parameter | Value | |
|---|---|---|
| `range` | two numbers, the smaller first: `[-5, 5]` | The stretch of the line shown. Default [-5, 5]. |
| `points` | a list of numbers on a line, each optionally labelled: `[0, "1/2", "sqrt(2): √2"]` | Points to mark: a number, or text giving a number and the label to write above it, as in `[0, 1, "1/2", "sqrt(2): √2"]`. |
| `intervals` | a list of intervals: `["(2, 4)", "[0, inf)"]` | Stretches to shade, in interval notation: `["(2, 4)", "[0, 1]", "(-inf, 3]"]`. A round bracket leaves the end out, a square one includes it. |
| `distance` | two numbers, the smaller first: `[-5, 5]` | Two numbers a and b: draws the distance between them and labels it \|a − b\|. |
| `via` | a number | With `distance`: a third point b. Also draws the distances from a to b and from b to c, the detour of the triangle inequality. |
| `near` | a list of numbers: `[1, 2]` | A centre c and a radius r, as `[3, 1]`: shades the points within r of c, the window \|x − c\| < r. |
| `probe` | a number | Where a movable point x starts. The readout says where x is, which intervals it is in, and how far it is from the centre of `near`. |
| `caption` | one line of text | One line shown under the line. |

````
```widget
type: number-line
range: [-3, 4]
points: [0, 1, "1/2", "sqrt(2): √2", "pi: π", "-7/3"]
```
````

````
```widget
type: number-line
range: [0, 6]
distance: [2, 5]
points: ["2: a", "5: b"]
caption: "The distance from 2 to 5 is 3, whichever way you subtract."
```
````

````
```widget
type: number-line
range: [0, 8]
distance: [1, 3]
via: 6
points: ["1: a", "3: c", "6: b"]
caption: "From a to c directly, and by way of b."
```
````

````
```widget
type: number-line
range: [0, 6]
near: [3, 1]
probe: 3.4
caption: The points within 1 of 3.
```
````

````
```widget
type: number-line
range: [-5, 5]
intervals: ["(-inf, -1]", "(2, 4)"]
probe: 0
```
````

### `truth-table`

The truth table of a formula built from letters with and, or, not, implies and iff: one row for every way of making the letters true or false. With `fill`, the learner fills in the formula's column and checks it. A table checks every case, one by one; a proof argues once for all of them.

| Parameter | Value | |
|---|---|---|
| `formula` (required) | one line of text | The formula: one-letter propositions (not T or F) with `∧ ∨ ¬ → ↔`, or `/\ \/ ~ -> <->`, `True`, `False` and brackets, as in `(p → q) ∧ ¬q → ¬p`. At least one connective, at most five letters. As in Lean, a chain of ↔ needs brackets. |
| `steps` | `true` or `false` | Show a column for each part of the formula, innermost first, before the whole. Default true. |
| `fill` | `true` or `false` | The learner fills in the formula's own column (each cell T or F), then checks it against the table. Default false: the table is shown complete. |
| `caption` | one line of text | One line shown under the table. |

````
```widget
type: truth-table
formula: "p → q"
steps: false
caption: "An implication is false in one row only: true, then false."
```
````

````
```widget
type: truth-table
formula: "(p → q) ∧ ¬q → ¬p"
caption: "True in every row: modus tollens holds whatever p and q are."
```
````

````
```widget
type: truth-table
formula: "¬(p ∧ q) ↔ ¬p ∨ ¬q"
fill: true
```
````

### `informal-formal`

A proof as a mathematician writes it, sentence by sentence, beside the Lean proof of one of the lesson's exercises (its reference solution, which Lean accepts). Selecting a sentence lights the lines that say it in Lean, and selecting a line lights its sentences and shows the proof state after it. A line no sentence covers is marked: Lean needed a step the prose left unsaid.

| Parameter | Value | |
|---|---|---|
| `exercise` (required) | one line of text | The id of a `prove` exercise in this lesson. Its statement and `solution` are the Lean side. |
| `steps` (required) | a list of text: `[a, b]` | The sentences, in order, each `<lines>: <sentence>` with the solution's lines counted from 1: `"2-3: To show R, it is enough to show Q."`. Lines may be `2`, `2-4` or `1, 3`; a line may be in more than one sentence. |
| `lesson` | one line of text | Gallery and Lab only: the lesson the exercise is in. In a lesson it is always the lesson's own, and the loader refuses this. |
| `caption` | one line of text | One line shown under the two sides. |

````
```widget
type: informal-formal
lesson: logic-1-if-then
exercise: chain
steps: ["1: Suppose P; we show R.", "2: Since Q implies R, it is enough to show Q.", "3: Since P implies Q, it is enough to show P.", "4: And P is what we supposed."]
caption: "Each sentence is one line of Lean here; often one sentence is several."
```
````

### `epsilon-delta`

The definition of a limit, to play with: the learner sets ε (a band around the limit L) and δ (a strip around a), and the box turns green when every x in the strip, except a itself, has f(x) inside the band. Decided by sampling the strip finely: a picture of the definition, not a proof.

| Parameter | Value | |
|---|---|---|
| `function` (required) | one line of text | f, an expression in x: `x^2`, `sin(x)/x`. |
| `at` (required) | a number | a, where the limit is taken. |
| `limit` | a number | L, the limit. Default f(a), which must then exist; give it for a hole like sin(x)/x at 0. |
| `epsilon` | a number | Where the ε slider starts. Default 0.5. Must be at least 0.001. |
| `delta` | a number | Where the δ slider starts. Default 1. Must be at least 0.001. |
| `x` | two numbers, the smaller first: `[-5, 5]` | The stretch of x shown. Default a − 3 to a + 3. |
| `y` | two numbers, the smaller first: `[-5, 5]` | The stretch of y shown. Default L − 3 to L + 3. |
| `caption` | one line of text | One line under the picture. |

````
```widget
type: epsilon-delta
function: "x^2"
at: 2
epsilon: 1
delta: 0.5
caption: "Shrink δ until the box turns green. The smaller ε, the smaller δ must be."
```
````

````
```widget
type: epsilon-delta
function: "sin(x)/x"
at: 0
limit: 1
epsilon: 0.2
delta: 2
x: [-4, 4]
y: [-0.5, 1.5]
caption: "No value at 0, and still a limit: the hole is left out."
```
````

### `secant-tangent`

A secant through (a, f(a)) and (a + h, f(a + h)), with a slider for h: as h shrinks toward 0 from either side, the secant turns into the tangent and its slope settles. The slope (f(a + h) − f(a))/h is shown as it changes.

| Parameter | Value | |
|---|---|---|
| `function` (required) | one line of text | f, an expression in x. |
| `at` (required) | a number | a, where the tangent touches; f(a) must exist. |
| `h` | a number | Where the h slider starts, not 0. Default 1. |
| `x` | two numbers, the smaller first: `[-5, 5]` | The stretch of x shown. Default a − 3 to a + 3. |
| `y` | two numbers, the smaller first: `[-5, 5]` | The stretch of y shown. Default fitted to the curve. |
| `caption` | one line of text | One line under the picture. |

````
```widget
type: secant-tangent
function: "x^2"
at: 1
h: 1.5
caption: "The slope is 2 + h: as h goes to 0 it goes to 2, the derivative of x² at 1."
```
````

### `riemann-sum`

Rectangles under a curve from a to b, as tall as the function at each one's left end, right end or middle, with a slider for how many. Their total area is shown beside the area itself (to a few places, from a thousand thin rectangles): more rectangles, closer.

| Parameter | Value | |
|---|---|---|
| `function` (required) | one line of text | f, an expression in x, defined on all of [from, to]. |
| `from` (required) | a number | a, where the area starts. |
| `to` (required) | a number | b, where it ends; more than `from`. |
| `n` | a number | How many rectangles at the start. Default 4. Must be a whole number, 1 to 100. |
| `rule` | one of `left`, `right`, `midpoint` | Where each rectangle meets the curve. Default left; the learner can change it. |
| `caption` | one line of text | One line under the picture. |

````
```widget
type: riemann-sum
function: "x^2"
from: 0
to: 2
n: 4
caption: "The area under x² from 0 to 2 is 8/3. Watch the sum close in on it."
```
````

### `sequence-limit`

The terms of a sequence as dots, with a band of width ε around its limit and a slider for ε. The widget finds the first N from which every term shown stays in the band; past the last term shown it claims nothing, which is what a proof is for.

| Parameter | Value | |
|---|---|---|
| `term` (required) | one line of text | The n-th term, an expression in n: `1/n`, `(-1)^n/n`, `(n+1)/n`. |
| `limit` (required) | a number | L, the limit the band is drawn around. |
| `epsilon` | a number | Where the ε slider starts. Default 0.2. Must be at least 0.001. |
| `start` | a number | The first n. Default 1. Must be a whole number, 0 to 10. |
| `count` | a number | How many terms are drawn. Default 40. Must be a whole number, 10 to 200. |
| `caption` | one line of text | One line under the picture. |

````
```widget
type: sequence-limit
term: "(-1)^n/n"
limit: 0
epsilon: 0.2
caption: "The terms swing either side of 0 and close in. Make ε smaller: N grows, but there always is one."
```
````

````
```widget
type: sequence-limit
term: "(n+1)/n"
limit: 1
epsilon: 0.1
count: 30
```
````

### `induction-dominoes`

Induction as a row of dominoes. The base case knocks over the first; the step is the rule that if domino n falls, so does domino n + 1. The learner can take either away and push again: without the base nothing falls, without the step only the first does.

| Parameter | Value | |
|---|---|---|
| `count` | a number | How many dominoes are drawn (the row stands for all of ℕ). Default 8. Must be a whole number, 4 to 12. |
| `claim` | one line of text | What P(n) says, shown with the dominoes: `2⁰ + … + 2ⁿ = 2ⁿ⁺¹ − 1`. |
| `start` | a number | The number on the first domino, where the base case is. Default 0. Must be a whole number, 0 to 5. |
| `gap` | a number | Leave the step out at this domino only: the one numbered `gap` falls but does not knock the next. For a proof whose step fails at one n. Must be a whole number, 0 to 16. |
| `caption` | one line of text | One line shown under the dominoes. |

````
```widget
type: induction-dominoes
claim: "0 + 1 + … + n = n(n + 1)/2"
caption: "Push the first. Then take away the base case, or the step, and push again."
```
````

````
```widget
type: induction-dominoes
count: 6
start: 1
gap: 2
caption: "A step that holds everywhere but from 2 to 3: the chain stops at 2."
```
````

### `square-of-sum`

A square of side a + b cut into a square of side a, a square of side b and two a-by-b rectangles, with sliders for a and b: the picture behind (a + b)² = a² + 2ab + b².

| Parameter | Value | |
|---|---|---|
| `a` | a number | The first length at the start. Default 3. Must be 0.5 to 10. |
| `b` | a number | The second length at the start. Default 2. Must be 0.5 to 10. |

````
```widget
type: square-of-sum
```
````

````
```widget
type: square-of-sum
a: 1
b: 4
```
````

## Exercise kinds

An exercise is an entry under `exercises:` in a lesson's frontmatter. Every exercise takes `id` (required; lowercase letters, digits and hyphens; unique in its lesson; never changed once live), `kind` (default `prove`), `title` (required) and `concept` (default: the lesson's first concept; required when the lesson lists none), and then the parameters of its kind.

### `prove` (shown as “Prove it”)

A statement to prove. Lean decides whether it is solved. In `board` mode the learner clicks moves on the proof board and each click writes one line of Lean; in `typed` mode they write the Lean in an editor with the goals beside it.

| Parameter | Value | |
|---|---|---|
| `mode` | one of `board`, `typed` | How the proof is entered. Default board. |
| `says` (required) | one line of text | The claim in plain English, as a mathematician would say it. Shown above the exercise. |
| `statement` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The Lean statement after the keyword: binders, a colon, the claim. Quote it: it contains colons. |
| `given` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`. |
| `moves` | a list of move ids (see Moves below): `[intro, exact]` | Board mode, required there: the moves on offer. Every line of the solution must be one of them. |
| `forbid` | a list of text: `[a, b]` | Tactic and theorem names that may not appear in an answer. Forbidding anything also forbids `try?`. |
| `solution` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | A proof body, one tactic per line, that Lean accepts. `npm test` checks it against the real Lean. |

```yaml
exercises:
  - id: prove-example-1
    kind: prove
    title: An example
    mode: board
    says: "Suppose P is true, and suppose that if P then Q. Then Q is true."
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    moves: [apply, exact]
    solution: |
      apply hPQ
      exact hP
```

```yaml
exercises:
  - id: prove-example-2
    kind: prove
    title: An example
    mode: typed
    says: "For every natural number n, double n = 2 * n."
    statement: "(n : ℕ) : double n = 2 * n"
    given: |
      def double (n : ℕ) : ℕ := n + n
    forbid: [simp, grind]
    solution: |
      unfold double
      omega
```

### `fill` (shown as “Fill the gap”)

A proof that is written out except for one step, marked `<gap>`. The learner supplies the step: by typing one line, or, when `options` are given, by choosing one of them. Lean checks the completed proof either way; a choice is not compared with a stored answer.

| Parameter | Value | |
|---|---|---|
| `says` (required) | one line of text | The claim in plain English. Shown above the exercise. |
| `statement` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The Lean statement after the keyword: binders, a colon, the claim. Quote it: it contains colons. |
| `given` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`. |
| `proof` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The proof body with `<gap>` exactly once, where the missing step goes: a whole line, or part of one. |
| `solution` (required) | one line of text | What goes in the gap: one line. `npm test` checks the completed proof against the real Lean. |
| `options` | a list of text: `[a, b]` | The choice form: two to five fills to choose from, the solution among them. `npm test` checks that Lean accepts the solution and refuses every other option. |
| `forbid` | a list of text: `[a, b]` | Names that may not appear in what is typed into the gap (the proof around it may use them). |

```yaml
exercises:
  - id: fill-example-1
    kind: fill
    title: An example
    says: "For any real number x, |x + 1| ≤ |x| + 1."
    statement: "(x : ℝ) : |x + 1| ≤ |x| + 1"
    proof: |
      calc |x + 1| ≤ |x| + |1| := <gap>
        _ = |x| + 1 := by rw [abs_one]
    forbid: [grind, simp, gcongr]
    solution: "abs_add_le x 1"
```

```yaml
exercises:
  - id: fill-example-2
    kind: fill
    title: An example
    says: "Suppose a ≤ b and b ≤ c. Then a ≤ c."
    statement: "(a b c : ℝ) (h1 : a ≤ b) (h2 : b ≤ c) : a ≤ c"
    proof: |
      calc a ≤ b := h1
        _ ≤ c := <gap>
    options: [h1, h2, "le_refl c"]
    solution: h2
```

### `truefalse` (shown as “True or false”)

A claim to decide. The learner says whether it is true or false, then backs that up: a proof when it is true, a counterexample when it is false (a value for each variable of the statement, which Lean checks by proving the claim's negation). Picking the side Lean has not backed up is answered at once with `why`. Lean decides either way.

| Parameter | Value | |
|---|---|---|
| `says` (required) | one line of text | The claim in plain English, as a mathematician would say it. Shown above the exercise. |
| `statement` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The claim in Lean: binder groups, a colon, the claim. A false claim's conditions go in the claim (`n > 0 → …`), not in binders: a counterexample gives a value for every `( )` binder. |
| `given` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`. |
| `truth` (required) | `true` or `false` | Whether the claim holds. `npm test` checks the reference answer on that side against the real Lean. |
| `why` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Said to a learner who picks the other side: why the claim is true, or where it fails, in a sentence or two. |
| `solution` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The reference proof: required when `truth` is true (a proof of the statement), and with `witness: proof` (a proof of False from hc, the claim at the counterexample's values). |
| `counterexample` | one line of text | Required when `truth` is false: a value for each variable, in order, separated by commas, like `1` or `2, 3`. Numbers only. |
| `close` | one line of text | With `witness: values`: the tactic that shows the claim fails at the values given. Default norm_num; decide for small cases. |
| `witness` | one of `values`, `proof` | What a counterexample takes from the learner: only the values (default; `close` does the rest), or the values and the proof that they work. |
| `forbid` | a list of text: `[a, b]` | Names that may not appear in what the learner writes. |

```yaml
exercises:
  - id: truefalse-example-1
    kind: truefalse
    title: An example
    says: "For every natural number n, n² is at least 2n."
    statement: "(n : ℕ) : n ^ 2 ≥ 2 * n"
    truth: false
    why: |
      At n = 1, n² is 1 and 2n is 2. (From n = 2 on it does hold.)
    counterexample: "1"
```

```yaml
exercises:
  - id: truefalse-example-2
    kind: truefalse
    title: An example
    says: "For every natural number n, n² + n is even."
    statement: "(n : ℕ) : Even (n ^ 2 + n)"
    truth: true
    why: |
      n² + n = n(n + 1), and one of two numbers in a row is even.
    solution: |
      have h : n ^ 2 + n = n * (n + 1) := by ring
      rw [h]
      exact Nat.even_mul_succ_self n
```

```yaml
exercises:
  - id: truefalse-example-3
    kind: truefalse
    title: An example
    says: "For all whole numbers a and b, (a + b)² = a² + b²."
    statement: "(a b : ℤ) : (a + b) ^ 2 = a ^ 2 + b ^ 2"
    truth: false
    why: |
      (a + b)² = a² + 2ab + b², so it fails whenever ab is not 0: at a = b = 1 the left side is 4 and the right side 2.
    counterexample: "1, 1"
    witness: proof
    solution: |
      norm_num at hc
```

### `predict` (shown as “Predict the goal”)

Before a move runs, say what the goal becomes. The learner sees the state, the move, and states to choose from; Lean decides, by running the move and comparing the state it leaves with the one chosen. `npm test` holds the `solution` to Lean: it must be the state Lean leaves, and no other option may be.

| Parameter | Value | |
|---|---|---|
| `says` (required) | one line of text | What the proof is about, in plain English. Shown above the exercise. |
| `statement` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The Lean statement after the keyword: binders, a colon, the claim. |
| `given` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`. |
| `before` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Proof lines that run first, to reach the state shown. Default: none, so the state is the statement's own. |
| `move` (required) | one line of text | The one tactic line whose effect is predicted, like `intro h` or `apply hpq`. |
| `options` (required) | a list of text: `[a, b]` | Two to five states, each as Lean prints it (facts, then a line starting ⊢; several goals one after another), or `no goals`. Write the misreadings learners make. |
| `solution` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The option Lean leaves. Facts may be in any order and spacing does not matter, but names and types must be as Lean prints them. |

```yaml
exercises:
  - id: predict-example-1
    kind: predict
    title: An example
    says: Using an implication to change what is left to prove.
    statement: "(p q : Prop) (hp : p) (hpq : p → q) : q"
    move: apply hpq
    options: ["p q : Prop\nhp : p\nhpq : p → q\n⊢ p", "p q : Prop\nhp : p\nhpq : p → q\n⊢ q", "p q : Prop\nhp : p\nhpq : p → q\n⊢ p → q"]
    solution: |
      p q : Prop
      hp : p
      hpq : p → q
      ⊢ p
```

```yaml
exercises:
  - id: predict-example-2
    kind: predict
    title: An example
    says: Taking a conjunction apart.
    statement: "(P Q : Prop) : P ∧ Q → Q ∧ P"
    before: |
      intro h
    move: "obtain ⟨hp, hq⟩ := h"
    options: ["P Q : Prop\nhp : P\nhq : Q\n⊢ Q ∧ P", "P Q : Prop\nh : P ∧ Q\nhp : P\nhq : Q\n⊢ Q ∧ P", "P Q : Prop\nhp : P\nhq : Q\n⊢ Q\n\nP Q : Prop\nhp : P\nhq : Q\n⊢ P"]
    solution: |
      P Q : Prop
      hp : P
      hq : Q
      ⊢ Q ∧ P
```

### `read` (shown as “Read the Lean”)

A Lean statement and sentences that say what it might claim; the learner chooses the one that says what it does. A fixed answer: marked against `solution`. Lean checks that the statement is one it can read.

| Parameter | Value | |
|---|---|---|
| `statement` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | The Lean statement to read: binders, a colon, the claim. |
| `given` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Lean definitions the statement is about, placed before it. No `sorry`, no `axiom`. |
| `options` (required) | a list of text: `[a, b]` | Two to five sentences, one of them right. Write the misreadings learners make: a quantifier order swapped, an implication reversed. |
| `solution` (required) | one line of text | The sentence that says what the statement claims. |
| `why` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Shown after the answer, right or wrong: how to read the statement. |

```yaml
exercises:
  - id: read-example-1
    kind: read
    title: An example
    statement: "(f : ℕ → ℕ) : ∀ n, ∃ m, f m > n"
    options: ["Whatever number you name, f takes a value above it somewhere.", There is one place where f is larger than every number., f is increasing.]
    solution: "Whatever number you name, f takes a value above it somewhere."
    why: |
      ∀ n, ∃ m: the m may depend on n. With ∃ m, ∀ n one m would have to beat every n at once.
```

### `flaw` (shown as “Spot the flaw”)

A plausible argument with one wrong step; the learner says which. A fixed answer: marked against `flaw`, and `why` is shown once the right step is found. For an argument written in words, where Lean has nothing to check.

| Parameter | Value | |
|---|---|---|
| `says` (required) | one line of text | What the argument claims to show. Shown above it. |
| `steps` (required) | a list of text: `[a, b]` | The argument, two to eight steps in order, each a sentence or two. Exactly one is wrong. |
| `flaw` (required) | a number | The number of the wrong step, counting from 1. Must be a whole number, 1 to 8. |
| `why` (required) | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | What is wrong with that step, shown once the learner finds it (after a wrong pick they are only told that step holds up). |

```yaml
exercises:
  - id: flaw-example-1
    kind: flaw
    title: An example
    says: "A proof that 2 = 1."
    steps: ["Let a and b be numbers with a = b.", "Multiply both sides by a: a² = ab.", "Subtract b² from both sides: a² − b² = ab − b².", "Factor both sides: (a + b)(a − b) = b(a − b).", "Divide both sides by a − b: a + b = b.", "Since a = b, that says 2b = b, and dividing by b gives 2 = 1."]
    flaw: 5
    why: |
      Since a = b, a − b is 0, and dividing by 0 is not allowed: it turns the true 0 = 0 into the false a + b = b. (Step 6 divides by b, which is fine as long as b is not 0; the trouble is already there.)
```

### `match` (shown as “Match them up”)

Sentences and Lean statements to pair up, each sentence with the statement that says it. A fixed answer: the pairs as written are the right ones, and the Lean is shown in another order. Lean checks that every statement is one it can read.

| Parameter | Value | |
|---|---|---|
| `says` (required) | one line of text | What to look for, in a sentence. Shown above the pairs. |
| `english` (required) | a list of text: `[a, b]` | Two to six sentences, in order. |
| `lean` (required) | a list of text: `[a, b]` | The Lean proposition for each sentence, in the same order: `∀ n : ℕ, ∃ m, m > n`. Lean checks each can be read, as a theorem's statement after `given`. |
| `given` | text; when it runs over several lines, write `\|` after the colon and indent the lines under it | Lean definitions the statements are about. No `sorry`, no `axiom`. |

```yaml
exercises:
  - id: match-example-1
    kind: match
    title: An example
    says: Quantifier order changes what is claimed.
    english: [Every natural number has a larger one., Some natural number is at least every natural number., Every natural number is at least 0.]
    lean: ["∀ n : ℕ, ∃ m, m > n", "∃ m : ℕ, ∀ n, n ≤ m", "∀ n : ℕ, 0 ≤ n"]
```

## Moves

The ids a board exercise's `moves` and a `move-list` widget may name. Each click on the proof board writes one line of Lean, and every line of a board exercise's `solution` must be a line one of its moves writes (`npm test` replays it against Lean's goals).

| Move | It needs | The line it writes | What it does |
|---|---|---|---|
| `rfl` | nothing | `rfl` | Finish an equation whose two sides are the same thing once worked out, like 2 + 2 = 4. |
| `norm_num` | nothing | `norm_num` | Calculate. Settles a claim about particular numbers, such as an equation or whether a number is prime, by working it out. |
| `intro` | nothing (it picks a name) | `intro h` (the board chooses the name) | To prove “if A then B”, assume A. To prove “not A”, assume A. To prove “for all x”, take an arbitrary x. What was assumed or taken joins your facts. |
| `exact` | a fact, clicked | `exact h` | Finish the goal with a fact that says exactly what the goal says. |
| `apply` | a fact, clicked | `apply h` | Use a fact of the form “if A then B” on the goal B. The goal becomes A: it is now enough to prove A. Also uses a “for all” fact on a particular case, and a “not A” fact on the goal False. |
| `constructor` | nothing | `constructor` | Split a goal “A and B” (or “A if and only if B”) into its two parts, to be proved one after the other. |
| `obtain` | a fact, clicked | `obtain ⟨…⟩ := h` (the board names the parts) | Take a fact apart. “A and B” gives two facts. “A or B” gives two cases. “There exists an x such that…” gives the x and the fact about it. |
| `left` | nothing | `left` | To prove “A or B”, choose to prove A. |
| `right` | nothing | `right` | To prove “A or B”, choose to prove B. |
| `exfalso` | nothing | `exfalso` | Replace the goal by False. Useful when your facts contradict each other: from a contradiction anything follows. |
| `contradiction` | nothing | `contradiction` | Finish any goal when two of your facts flatly contradict each other, such as A and not A. |
| `by_contra` | nothing (it picks a name) | `by_contra h` (the board chooses the name) | Argue by contradiction: assume the goal is false, and aim for False. |
| `use` | something typed | `use …what was typed` | To prove “there exists an x such that…”, say which x. What remains is to show it works. |
| `decide` | nothing | `decide` | Settle a claim about particular numbers by checking it, the way you would check 7 < 10 or that 3 does not divide 10. It cannot handle a claim with a letter in it. |
| `rw` | a fact, clicked | `rw [h]` | Rewrite with an equation. With a fact “a = b”, every a in the goal becomes b. If that leaves both sides identical, the goal is finished. |
| `rw_back` | a fact, clicked | `rw [← h]` | Rewrite with an equation, backwards. With a fact “a = b”, every b in the goal becomes a. |
| `simp` | nothing | `simp` | Simplify the goal using a large library of facts already proved, such as 0 + n = n. Often that finishes it. |
| `omega` | nothing | `omega` | Finish a goal about whole numbers that needs only adding, comparing and multiplying by particular numbers. It uses the facts on the board. |
| `induction` | one of the statement's objects, clicked | `induction' n with n ih` | Prove a claim about every natural number n in two steps: first for 0, then for n + 1, where you may use the claim for n. For a list: first for the empty list, then for a list with one more element in front. |
| `ring` | nothing | `ring` | Finish an equation that holds by the rules of algebra alone, whatever the letters stand for, such as (a + b)² = a² + 2ab + b². It does not use the facts on the board. |
| `linarith` | nothing | `linarith` | Finish an equation or inequality that follows from the facts on the board by adding them up and multiplying them by particular numbers. It does not multiply two letters together. |
| `nlinarith` | nothing | `nlinarith` | Like linarith, but it first multiplies pairs of facts together, which sometimes gets a goal with products or squares in it. |
| `positivity` | nothing | `positivity` | Finish a goal of the form 0 < A, 0 ≤ A or A ≠ 0 when A is plainly so from the way it is built: a square, a sum of things that are not negative, a product of positive things. |
| `field_simp` | nothing | `field_simp` | Clear the fractions from an equation by multiplying through. It needs to know that each thing divided by is not zero: from a fact on the board, or because it is a number. |
| `gcongr` | nothing | `gcongr` | Prove an inequality whose two sides are built the same way, by comparing them part by part: A + C ≤ B + D from A ≤ B and C ≤ D. It looks for the smaller comparisons among the facts, and leaves as goals the ones it cannot find. |
