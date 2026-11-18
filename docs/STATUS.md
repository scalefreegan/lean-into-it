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
  list", "A test is not a proof", "The whole of rev"; 23 exercises about
  `len`, `app`, `total`, `rev` and a buggy `badRev`. A lesson or an exercise
  can carry Lean definitions of its own (`given`), placed before the
  theorem; an exercise's `given` also carries the lemmas proved before it.
  "The whole of rev" (`lii-dvy.10`) proves `app` associative, the two
  statements that specify reverse (one element, the reverse of a join),
  reversing twice as a consequence, and that any function meeting the two
  is `rev`. Not yet: the program stepper.
- Level 3 written (`lii-dvy.5`): "The real numbers", "Identities",
  "Solving equations", "Inequalities", "Chains", "Absolute value and
  distance", "Functions, increasing and bounded", and on the Lean track
  "Which numbers?"; 45 exercises. Board moves `ring`, `linarith`,
  `nlinarith`, `positivity`, `field_simp` and `gcongr`; `have`, `calc`
  with inequalities and `rw … at` are typed. A `ring` that does not finish
  is reported as a refused move (Lean only remarks on it). The graphs and number lines came later (see below). Levels 4 on are outlined.
- The registry (`lii-53v.1`): `web/shared/registry.ts` is the one list of
  widgets and exercise kinds, with the parameters each takes. The loader
  checks every exercise and every ` ```widget ` block in a lesson against
  it and refuses the lesson, naming the file, the block and the reason.
  `#/gallery` draws every widget from its example parameters and lists
  what each widget and exercise kind takes. Two widgets so far, both
  built from what the proof board already had: `proof-state` (a state as
  cards, used in "Reading a goal, and proofs as things") and `move-list`.
  "Prove it" is the registered kind `prove`, with the board and the editor
  as its two modes.
- Fill the gap (`lii-6xv.1`): the exercise kind `fill`, a proof with one
  step marked `<gap>`. The learner types the step or, where the exercise
  gives `options`, chooses it; Lean checks the proof with it in place, and
  no answer is stored to compare with. Beside the proof is what the
  missing step has to show. Two are in the lessons: a choice in "Chains",
  a typed one in "Absolute value and distance".
- Pictures for Level 3 (`lii-dvy.11`): three more widgets. `plot` graphs
  functions of x from a small expression parser of its own
  (`web/shared/expr.ts`, never `eval`), with a point to move along the
  curves and a view that drags and zooms. `number-line` marks points,
  intervals and a distance, and can carry a movable x with a sentence
  saying where it is. `square-of-sum` is the square of side a + b in four
  pieces. They are in "The real numbers", "Identities", "Inequalities",
  "Absolute value and distance" and "Functions, increasing and bounded".
  This is the plotter and number-line part of `lii-53v.2` and `lii-53v.5`;
  the limit explorers, truth table and dominoes are still to build.
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
- Lean that cannot wedge the app (`lii-1ou.2`). A check gets 20 seconds;
  one that runs past it is given up on with a sentence saying so, and only
  its document is closed, so the rest of Lean stays warm (copies of the same
  check waiting behind it are refused with it). Loading a library is a step
  of its own with two minutes, whenever a document is new or its import
  lines change, wherever in the file they sit. A file that crashes its Lean
  worker is reported and not run again. If Lean itself dies it is started
  again, reloads what it had open, and the check it held is retried; if it
  dies twice in a row it stays stopped, the app says so and offers a
  Restart button. `GET /api/lean` reports starting, ready, restarting or
  down and the toolchain; `POST /api/lean/restart` restarts it. The app
  shows "Lean is starting" while Mathlib loads. Left for `lii-1ou.6`:
  cancelling a superseded check, and a memory limit.
- An adversarial pass on grading (`lii-1ou.5`): about 34 proof bodies
  tried against a false statement, through the app and through Lean with
  the pre-checks off. None was graded solved. Where Lean alone would
  accept an unsound result (a program that adds a theorem the kernel never
  checked), the word list stops it. A `{` inside a string is now refused:
  in an interpolated string it opens code the checks would have read as
  text. `native :=` is refused as `+native` is, and characters outside
  Unicode's basic plane (𝓝, 𝔽) no longer shift the lexer's lines.
- `npm run check:content` (`lii-2zf.2`): the structure check the app does,
  then every reference solution and every wrong option judged by the real
  Lean exactly as a learner's answer is, and every ```lean block that is
  whole declarations compiled after the lesson's `given` (a definition
  shown must match the one given). A library fact quoted by name is looked
  up by its name; its quoted statement is not checked, nor are fragments
  (proof states, tactic lines, outlines) or `#eval` results in the prose.
  Reports the file, the exercise or line, and Lean's message; exits 1 on any
  problem. `--no-lean`, `--lean`, `--lesson <id>`, and `--gaps` for what the
  curriculum promises and does not yet have.
- Mastery per concept and per move (`lii-zjf.1`): `web/shared/progress.ts`
  works it out from the attempt rows (Fret Not's model: the last 12
  answers, newest weighing most, mastered at 80% over at least 4). Every
  check is an answer for its exercise's concept, a repeat of the one before
  it excepted; an accepted proof counts for each move in it, and a refused
  board move against that move. A refused typed proof counts against its
  concept only. "Mastered" is recomputed, not kept; once a concept enters
  review it stays mastered (below), and an opened level is recorded.
  Nothing but the attempts is stored, so the score cannot drift from them.
  The Path shows a bar per lesson tried; `#/moves` lists every move the
  levels teach with its score. An assisted check (the Tutor gave the line)
  counts as seen only.
- Spaced review (`lii-zjf.2`): the same replay of the attempt rows. A
  mastered concept enters box 1, due the next calendar day; a review
  passed moves it up a box (1, 3, 7, 14, 30, 60, 120 days), a miss drops
  two boxes and brings it back tomorrow, an assisted check keeps the box
  and brings it back tomorrow. An exercise solved with the Tutor's line is
  in the next day's session until it is solved unaided.
  In review it stays mastered. `#/review` offers each due concept's least
  recently checked exercise, at most 8, and the Review tab shows how many.
  Moves are scored and kept mastered the same way but not scheduled: an
  exercise can be solved without the move it was offered for. Checks now
  say whether they are attempts: re-checking a stored solution as an
  exercise opens is not, so opening a lesson never passes a review. A live
  or board solve is kept once a day, a submitted one always (the replay
  counts a repeat of the row before it once), so a solve on a later day is
  on record as the review. More than 8 due: the next batch is offered when
  one is done. Variants (`lii-zjf.8`): every concept has 4 to 8 exercises,
  and a review offers one never checked before any already seen, so the
  same proof comes round again only after the others have.
- Tutor drawer (`lii-2zo.1`): "Ask the Tutor" on every page opens a
  drawer that sends each question with the page, the exercise last
  touched, its proof so far, Lean's goals and its last error (the lesson
  and exercise are looked up on the server, not taken from the page). It
  is a headless `claude -p` on the Claude Code login (`scripts/claude.mjs`,
  after Fret Not's), read-only: Read, Glob and Grep, nothing else, no MCP
  servers, no settings files; one turn at a time. On an exercise, the hint
  ladder: a nudge, the name of the move, the line, each its own request
  and only in order, per local day. Lean checks rung 3's line first, after
  the part of the proof it accepts (it must raise no error, change the
  goals or finish, and on the board be a line an offered move writes); one
  retry, and a line Lean refuses is never shown. Hints given are recorded
  in `hints`, apart from the chat, so clearing the chat takes nothing back;
  every check of the exercise that day carries the day's rung
  (`attempts.rung`), and rung 3 makes them `assisted`. The chat is kept in
  Postgres (`chat_messages`, the newest 400 rows). Migration `0001_tutor`.
  Not enforced: an ordinary question is asked not to hand over the line,
  but only the prompt holds the Tutor to that. Not yet: streaming (the
  reply arrives whole), a choice of model.
- Level unlocks (`lii-zjf.3`): a level opens when 70% of the concepts the
  level before it tests are mastered (`levelStatuses` in
  `web/shared/progress.ts`, after Fret Not's). A level whose lessons test
  nothing asks nothing; the next looks back past it. Outline levels never
  open. A level opened stays open, and opens the written levels before it:
  the server records it in `level_opens` when earned, and "Open anyway" on
  the Path (or on a locked lesson) records it too. A level with checks on
  record is open, so work done before levels could lock stays reachable.
  The Path shows each level locked (lessons listed, not linked, with what
  it needs), open, or done (every exercise solved); "Continue" skips
  locked levels, and Review never serves an exercise in one. Migration `0002_level_opens` (with room for placement,
  `lii-zjf.4`). Not enforced on the server: a check of an exercise in a
  locked level is graded like any other, and opens its level.
- Placement check (`lii-zjf.4`, `#/placement`, `web/shared/placement.ts`):
  offered on the Path at first run (nothing tried, no placement), and
  linked there always, so it can be skipped and taken again. Up to 6
  questions per level, one concept each, by its quickest exercise (a fill
  before a board proof before a typed one, one not solved before first),
  one at a time. Lean judges each answer and it is recorded like any
  other; "I don't know this yet", or a solve with the Tutor's line, is a
  miss. A level is settled as soon as 75% is reached or out of reach. The
  first level not passed opens (`level_opens`, `placement`) with those
  below it, and every concept the passed levels test is credited
  (`concept_credits`): mastered, in review box 2 (with four right answers
  in its recent ones, so one miss lowers the score, not empties it), due 7
  to 13 days on, one day after another. Retaking keeps the first credits.
  "Continue" passes over a lesson the placement credited until it is tried. By level, not by track: the
  levels follow the tracks closely enough. Migration `0003_placement`.
- Typed proofs show the cases still open (`lii-8wq.5`): where no goal is
  left at the end of the body but Lean has not accepted it (a bullet proof
  whose other case was never started), the panel reads them from Lean's
  "unsolved goals" error and shows them under "Still open"; the Tutor is
  told them too. `lii_exercise` reaches the learner only in the refusal
  that explains it, so the `example` headers stay.
- Every move the written levels list has its common refusal in plain words
  (`lii-8wq.4`). The last two gaps: `exact?` finding nothing, and a proof
  left with ⊢ False (after `exfalso`, `by_contra`, or `norm_num` on a false
  claim), which a typed proof's "Not finished" notice now explains.
- Tests: 290, including every reference solution checked by the real Lean,
  the grading refusals (`sorry`, a wrong move, a switched-off tactic, an
  error dressed up as a linter remark, an added axiom, a command smuggled
  into a proof, Lean stopped before its axiom report), the origin guard on
  every mounted route, and the Lean client's stop, restart, eviction and
  timeout paths.
- Docs: PRD, this file, `CONTENT.md` (the lesson format as built, with how
  the Lean file is assembled and one complete lesson that the tests load
  and give to Lean), `CONTENT-REFERENCE.md` (generated by `npm run
  gen:reference` from the registry and the move table: every widget,
  exercise kind and move with checked examples; a test fails when it is
  stale; `lii-2zf.1`), the hero-image prompt, README
  with four screenshots, `CLAUDE.md`.

Not yet there, and waiting on Aaron: `docs/hero.png`, generated from
`docs/hero-image-prompt.md` (`lii-2zf.5`). The README shows a broken image
until it is added.

## Remaining

34 beads in 11 areas. No P1 is left: P2 is next, P3 can wait. "Needs" lists beads that must
land first.

### Lean engine (epic `lii-1ou`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-1ou.4` | Re-check a passing proof in a fresh kernel | 2 | |
| `lii-1ou.6` | Lean checks: cancel a superseded check, and a memory limit | 3 | |
| `lii-1ou.3` | Structured goals through the Lean RPC interactive-goals API | 2 | |
| `lii-m2l` | Lean timing tests fail in the full suite when the machine is loaded | 3 | |

### Proof board (epic `lii-8wq`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-8wq.1` | Ladder fading: the move palette fades into typed Lean | 2 | |
| `lii-8wq.2` | Live proof map | 2 | `lii-1ou.3` |
| `lii-8wq.3` | Lean editor: syntax colouring, completion and inline error marks | 2 | |
| `lii-8wq.6` | obtain on a fact that is not an and, or, iff or exists | 3 | |

### Widgets (epic `lii-53v`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-53v.2` | Function and limit explorers (the plotter and number line are done) | 2 | |
| `lii-53v.3` | Informal beside formal widget | 2 | |
| `lii-53v.4` | Program stepper | 3 | |
| `lii-53v.5` | Small widgets: truth table, induction dominoes (the number line is done) | 2 | |

### Exercises (epic `lii-6xv`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-6xv.2` | Exercise kind: Predict and read | 2 | |
| `lii-6xv.3` | Exercise kind: True or false | 2 | |

### Progress (epic `lii-zjf`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-zjf.7` | Record time taken per exercise attempt | 3 | |
| `lii-zjf.5` | Database backup script | 3 | `lii-2zf.3` |
| `lii-zjf.6` | Record a board move that changed nothing as an attempt | 3 | |

### Tutor (epic `lii-2zo`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-2zo.2` | Tutor lesson authoring with a Lean compile gate and worktree commits | 2 | `lii-2zo.1` |
| `lii-2zo.3` | Tutor as proof partner in the Playground | 2 | `lii-2zo.1` |
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
| `lii-oip` | A calc chain that proves ≤ where < is wanted leaves an unexplained goal like c < c | 3 | |
| `lii-dvy.6` | Outlines for Levels 4–8 as content | 3 | |
| `lii-dvy.7` | Proof-craft lessons | 2 | `lii-6xv.3`, `lii-53v.3` |

### Lab (epic `lii-kqz`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-kqz.1` | Lab page | 2 | |
| `lii-kqz.2` | Famous Proofs gallery | 2 | `lii-kqz.1`, `lii-53v.3`, `lii-8wq.2` |

### Dock app (epic `lii-nnr`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-nnr.1` | Dock app (Lean Into It.app) | 2 | |

### Docs and content tooling (epic `lii-2zf`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-2zf.3` | `docs/DATA.md` | 3 | |
| `lii-2zf.4` | README screenshots | 2 | |
| `lii-2zf.5` | Generate `docs/hero.png` from the prompt (Aaron) | 2 | |
