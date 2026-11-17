# Status: what is done and what remains

The requirements are in [`PRD.md`](PRD.md). This file is the record of which
of them exist. Work is tracked with beads (prefix `lii`); every row under
Remaining is one bead.

To keep it current: `bd ready` lists what can be started now, `bd show <id>`
gives a bead's full brief, and the PR that closes a bead moves its row from
Remaining to Done in this file. `.beads/issues.jsonl` is the exported copy of
the beads that git tracks.

Last updated 2026-11-17.

## Done

Landed in the first PR, the foundation slice:

- Repo scaffold in the Fret Not layout: React 19, Vite 8, TypeScript strict,
  Tailwind 4, oxlint, `node --test`, port 38800, AGPL-3.0-only.
- Lean project in `lean/` (Lean 4 v4.36.0, Mathlib v4.36.0) and
  `npm run lean:setup` to fetch the toolchain and the Mathlib build cache.
- A warm Lean checker: the server keeps one `lake serve` process running and
  checks proofs through it behind `/api/check`.
- Content loader for `content/curriculum.yaml` and `content/lessons/<track>/*.md`.
- Level 0 written in full (`lii-dvy.1`): "Evidence is not proof", "Facts and
  a goal", "What Lean checks"; thirteen exercises, all by clicking.
- Level 1 written (`lii-dvy.2`): "If… then", "And", "Or", "Not, and
  contradiction", "If and only if", "For all", "There exists" on the logic
  track and "Reading a goal, and proofs as things" on the Lean track; 45
  exercises. Not yet: truth tables against proofs, and exercise kinds other
  than "prove it" (`lii-dvy.8`).
- Level 2 written (`lii-dvy.3`): "Counting from zero", "Equal things can be
  swapped", "Addition, defined", "Induction", "Adding up", "Even, odd,
  divides", "Leaning on more than one" on the math track and "Theorems have
  names" on the Lean track; 41 exercises, on Mathlib's own natural numbers.
  "Leaning on more than one" is typed only: the board has no strong
  induction. Not yet: the induction dominoes widget (`lii-dvy.9`).
- First verified programs written (`lii-dvy.4`), in Level 2 on the programs
  track: "A first function", "Saying what it should do", "Induction on a
  list", "A test is not a proof"; 18 exercises about `len`, `app`, `total`,
  `rev` and a buggy `badRev`. A lesson or an exercise can carry Lean
  definitions of its own (`given`), placed before the theorem. Not yet: the
  full specification of `rev` (`lii-dvy.10`), and the program stepper.
- Level 3 written (`lii-dvy.5`): "The real numbers", "Identities",
  "Solving equations", "Inequalities", "Chains", "Absolute value and
  distance", "Functions, increasing and bounded", and on the Lean track
  "Which numbers?"; 45 exercises. Board moves `ring`, `linarith`,
  `nlinarith`, `positivity`, `field_simp` and `gcongr`; `have`, `calc`
  with inequalities and `rw … at` are typed. A `ring` that does not finish
  is reported as a refused move (Lean only remarks on it). Not yet: the
  graphs and number lines, which the lessons describe in words
  (`lii-dvy.11`). Levels 4 on are outlined.
- Board moves: `rfl`, `norm_num`, `intro`, `exact`, `apply`, `constructor`,
  `obtain` (writes the pattern and names for the fact's shape), `left`,
  `right`, `exfalso`, `contradiction`, `by_contra`, `use` (the witness is
  typed), `decide`, `rw` and `rw ←` (click an equation), `simp`, `omega`,
  `induction` (click the number or the list; writes `induction' n with n ih`
  or `induction' xs with x xs ih`). `obtain`
  and `use` also work on `Even`, `Odd` and `∣`. A move that Lean accepts but that changes nothing is refused as
  such, and `constructor` is only sent to Lean for an and or an iff, `use` only for a
  there-exists.
- Path page (home): levels, lessons and what has been completed.
- Lesson page.
- Proof board: hypothesis and goal cards, clickable moves, "Lean written so far".
- Typed editor with a live goal panel.
- Playground: a free editor and goal panel, nothing scored.
- "Prove it" exercises graded by Lean; an error or a `sorry` fails. An
  exercise can switch off tactics that would skip the lesson (`forbid`).
- A passing proof must rest only on the three standard axioms (Lean's own
  report, read after every check), and a proof body that runs a program,
  changes Lean's settings or tries to write commands of its own is refused
  with the reason (`lii-1ou.1`).
- A move Lean refuses is explained in plain words, with Lean's own message
  one click away (covers the refusals the written lessons can produce; any
  other message is shown as Lean wrote it).
- Symbol shortcuts in the editor (`\to` then a space gives `→`).
- Attempts and exercise and lesson completion stored in Postgres
  (`lean_into_it`, one implicit learner, no login) and shown on the Path.
- The API refuses any request that is not same-origin from this machine.
- A check that runs past two minutes restarts Lean, and a check that was
  waiting behind it moves to the new server (the rest of `lii-1ou.2`
  remains).
- Tests: 121, including every reference solution checked by the real Lean,
  the grading refusals (`sorry`, a wrong move, a switched-off tactic, an
  error dressed up as a linter remark, an added axiom, a command smuggled
  into a proof, Lean stopped before its axiom report), the origin guard on
  every mounted route, and the Lean client's stop, restart, eviction and
  timeout paths.
- Docs: PRD, this file, `CONTENT.md` (the lesson format as built; the
  generated reference remains, `lii-2zf.1`), the hero-image prompt, README
  with four screenshots, `CLAUDE.md`.

Not yet there, and waiting on Aaron: `docs/hero.png`, generated from
`docs/hero-image-prompt.md` (`lii-2zf.5`). The README shows a broken image
until it is added.

## Remaining

46 beads in 11 areas. P1 is next, P3 can wait. "Needs" lists beads that must
land first.

### Lean engine (epic `lii-1ou`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-1ou.4` | Re-check a passing proof in a fresh kernel | 2 | |
| `lii-1ou.5` | Adversarial review of exercise grading (the PR 2 review did not complete it) | 1 | |
| `lii-1ou.2` | Lean checker timeouts and a restart path | 1 | |
| `lii-1ou.3` | Structured goals through the Lean RPC interactive-goals API | 2 | |

### Proof board (epic `lii-8wq`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-8wq.1` | Ladder fading: the move palette fades into typed Lean | 2 | |
| `lii-8wq.2` | Live proof map | 2 | `lii-1ou.3` |
| `lii-8wq.3` | Lean editor: syntax colouring, completion and inline error marks | 2 | |
| `lii-8wq.4` | Plain-word explanations for every move the curriculum introduces | 2 | |
| `lii-8wq.5` | Typed proofs: show the goals still open when none is at the cursor | 2 | |
| `lii-8wq.6` | obtain on a fact that is not an and, or, iff or exists | 3 | |

### Widgets (epic `lii-53v`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-53v.1` | Widget and exercise registry, lesson widget blocks, and a Gallery page | 1 | |
| `lii-53v.2` | Function and limit explorers | 2 | `lii-53v.1` |
| `lii-53v.3` | Informal beside formal widget | 2 | `lii-53v.1` |
| `lii-53v.4` | Program stepper | 3 | `lii-53v.1` |
| `lii-53v.5` | Small widgets: truth table, number line, induction dominoes | 2 | `lii-53v.1` |

### Exercises (epic `lii-6xv`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-6xv.1` | Exercise kind: Fill the gap | 1 | `lii-53v.1` |
| `lii-6xv.2` | Exercise kind: Predict and read | 2 | `lii-53v.1` |
| `lii-6xv.3` | Exercise kind: True or false | 2 | `lii-53v.1` |

### Progress (epic `lii-zjf`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-zjf.1` | Mastery per concept and per tactic | 1 | |
| `lii-zjf.2` | Spaced review and the Review page | 1 | `lii-zjf.1` |
| `lii-zjf.3` | Level unlocks | 2 | `lii-zjf.1` |
| `lii-zjf.4` | Placement check | 2 | `lii-zjf.1`, `lii-zjf.3` |
| `lii-zjf.5` | Database backup script | 3 | `lii-2zf.3` |
| `lii-zjf.6` | Record a board move that changed nothing as an attempt | 3 | |

### Tutor (epic `lii-2zo`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-2zo.1` | Tutor drawer: explain and hint, with the hint ladder and assisted marking | 1 | |
| `lii-2zo.2` | Tutor lesson authoring with a Lean compile gate and worktree commits | 2 | `lii-2zo.1`, `lii-2zf.1`, `lii-2zf.2` |
| `lii-2zo.3` | Tutor as proof partner in the Playground | 2 | `lii-2zo.1`, `lii-1ou.2` |
| `lii-2zo.4` | Tutor research maps for current results | 3 | `lii-2zo.1` |
| `lii-2zo.5` | Tutor read-only access to attempt history | 2 | `lii-2zo.1`, `lii-zjf.1` |

### Listen (epic `lii-1gs`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-1gs.1` | Listen mode: ElevenLabs read-aloud with word highlighting | 2 | |
| `lii-1gs.2` | Listen mode: spoken forms for maths, skip Lean code | 2 | `lii-1gs.1` |

### Curriculum (epic `lii-dvy`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-dvy.8` | Level 1: truth tables against proofs; True-or-false and Fill-the-gap exercises | 2 | `lii-53v.5` |
| `lii-dvy.9` | Level 2: the induction dominoes widget in the Induction lesson | 2 | `lii-53v.5` |
| `lii-dvy.10` | Verified programs: the full specification of `rev` (reverse twice, reverse of a join), with lemmas about `app` | 2 | |
| `lii-dvy.11` | Level 3: graphs and number lines in the lessons | 2 | `lii-53v.2` |
| `lii-oip` | A calc chain that proves ≤ where < is wanted leaves an unexplained goal like c < c | 3 | |
| `lii-dvy.6` | Outlines for Levels 4–8 as content | 3 | |
| `lii-dvy.7` | Proof-craft lessons | 2 | `lii-6xv.3`, `lii-53v.3` |

### Lab (epic `lii-kqz`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-kqz.1` | Lab page | 2 | `lii-53v.1` |
| `lii-kqz.2` | Famous Proofs gallery | 2 | `lii-kqz.1`, `lii-53v.3`, `lii-8wq.2` |

### Dock app (epic `lii-nnr`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-nnr.1` | Dock app (Lean Into It.app) | 2 | |

### Docs and content tooling (epic `lii-2zf`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-2zf.1` | `docs/CONTENT.md` and generated `CONTENT-REFERENCE.md` | 1 | `lii-53v.1` |
| `lii-2zf.2` | `check:content` script | 1 | |
| `lii-2zf.3` | `docs/DATA.md` | 3 | |
| `lii-2zf.4` | README screenshots | 2 | |
| `lii-2zf.5` | Generate `docs/hero.png` from the prompt (Aaron) | 2 | |
