# Status: what is done and what remains

The requirements are in [`PRD.md`](PRD.md). This file is the record of which
of them exist. Work is tracked with beads (prefix `lii`); every row under
Remaining is one bead.

To keep it current: `bd ready` lists what can be started now, `bd show <id>`
gives a bead's full brief, and the PR that closes a bead moves its row from
Remaining to Done in this file. `.beads/issues.jsonl` is the exported copy of
the beads that git tracks.

Last updated 2026-11-19.

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
  exercises. Then "Truth tables and proofs" (`lii-dvy.8`), three more: tables
  beside proofs, a True-or-false claim to prove, one to refute with a
  counterexample, and a Fill-the-gap.
- Level 2 written (`lii-dvy.3`): "Counting from zero", "Equal things can be
  swapped", "Addition, defined", "Induction", "Adding up", "Even, odd,
  divides", "Leaning on more than one" on the math track and "Theorems have
  names" on the Lean track; 41 exercises, on Mathlib's own natural numbers.
  "Leaning on more than one" is typed only: the board has no strong
  induction. The dominoes widget is under Dominoes in "Induction" (`lii-dvy.9`).
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
- True or false (`lii-6xv.3`): the exercise kind `truefalse`. The learner
  says whether a claim holds, then proves it or gives a counterexample (a
  value per variable); Lean checks a counterexample by proving the claim's
  negation, which the server writes from the statement. Picking the side
  the reference answer does not back is answered at once with the
  exercise's `why`. No lesson uses it yet. The flawed-step form is
  `lii-6xv.4`.
- Predict and read (`lii-6xv.2`): three kinds for reading Lean. `predict`
  shows a state and a move and offers states to choose from; Lean runs the
  move and decides. `read` (choose the sentence a Lean statement says) and
  `match` (pair sentences with Lean) are marked against the author's answer,
  the one exception to "Lean decides" (decided 2026-11-19); Lean checks
  that their Lean is readable. No lesson uses them yet.
- Ladder fading (`lii-8wq.1`): how a proof is entered fades from clicking
  to typing on four rungs (`web/shared/ladder.ts`): the board with the
  exercise's own moves, the board with every move learned so far, the
  editor with those moves behind "Show moves" (a click writes its line at
  the caret), the editor alone. Each level has a default (`ladder` in
  curriculum.yaml: Levels 0-1 rung 1, Level 2 rung 2, Level 3 rung 3,
  Levels 4-8 rung 4); an exercise may set its own. A board exercise takes
  its level's rung, so Level 3's are now typed with their moves to hand; a
  typed one takes at least 3, so Level 1's typed exercises are at 3, not
  1-2. The learner can step down a rung for one exercise and back up; each
  attempt records its rung (`attempts.input_rung`, migration 0006), and
  mastery charges a refused board check to its last move only when it was
  made on the board.
- Structured goals (`lii-1ou.3`): the goals a check returns come from
  Lean's RPC (`Lean.Widget.getInteractiveGoals`, one session per document,
  its references released after each reply) and not from splitting the
  printed text: each hypothesis is one card with its own names, type and
  value, however Lean prints it, with flags for an instance and a name Lean
  made up (`n✝`), and the type and target as tagged text with each
  subexpression's position. Lean's diff marks come too: what the last step
  added (`inserted`, which now lights the board's new cards), what it
  changed in a type or target, and what it took away (`gone` on the goals
  it made, read from the goals just before it). The printed goals stay as
  the fallback (`web/shared/interactive.ts`).
- Live proof map (`lii-8wq.2`): under the proof board and the typed editor,
  a diagram of the proof so far (`web/shared/proofmap.ts`, drawn by
  `web/src/widgets/ProofMap.tsx`). Facts down the left; the goals, and a
  move node for each line of Lean, in lanes to the right: an arrow from the
  goal the line works on and from each fact it names, and arrows to the
  goals and facts it makes. A move that splits a goal (`constructor`,
  `apply` with two premises) starts a lane per new goal; open goals are
  amber, finished ones green. Built from Lean's structured goals at the
  start and end of every line (`/api/check` with `map`; a line Lean refuses
  is left out), so it follows edits and deletions; Lean's goal ids say
  which goals a line made. Steps over several lines are drawn whole: the
  cases inside `induction n with` and the rest of the proof after
  `have h : P := by` are made by the line that opened the block, and
  `all_goals` works on every goal it closes. Rows go down in proof order and
  lanes are only added, so a line added at the end moves nothing already
  drawn. Clicking a node picks
  its line (on the board the line is marked, in the editor it is
  selected); a line picked on the board, or the editor's caret line, rings
  its nodes. A part proved on its own line (`have h : P := by linarith`)
  keeps the rest of the proof, which Lean shows under a new goal, and a fact
  whose type a line changed (`obtain ⟨k, rfl⟩ := hp`) is drawn as made by it.
- Proof-craft lessons (`lii-dvy.7`): six short lessons on how
  mathematicians work, each round one worked problem, marked "Proof craft"
  on the Path and their page (the lesson field `craft: true`): work
  backwards and what to do when stuck (`logic-1-work-backwards`), look for
  a counterexample first (`logic-1-counterexample-first`), small cases then
  a guess then a proof (`math-2-small-cases`), strengthen the induction
  hypothesis (`programs-2-strengthen`), split into cases (`math-3-cases`),
  and what "clearly" and "similarly" hide, with a lemma stated once and
  used three times, set beside its Lean (`math-3-clearly`). The bead's
  third point, the mathematician's wording beside the Lean in every other
  lesson, was met before it: every exercise has its `says`. The
  `informal-formal` widget now says, of a line that ends inside a nested
  `by`, that it finishes its own part, not that no goals are left.
- Limit explorers (`lii-53v.2`): four widgets on the arithmetic of
  `web/shared/limits.ts`. `epsilon-delta` (sliders for ε and δ; the box
  turns green when every x in the strip but a has f(x) in the band, decided
  by sampling; "Largest δ" finds it, or says none works),
  `secant-tangent` (h to 0 from either side, the slope beside the
  tangent's), `riemann-sum` (n rectangles, left, right or midpoint, beside
  the area) and `sequence-limit` (an ε band and the first N from which
  every term drawn stays inside). Each says it is a picture, not a proof.
  In the Lab under Limits; no lesson yet (Levels 5 and 6 are outlines).
- The content-check tests' Lean has the app's 20 s limit (`lii-z19`): with
  6 s an ordinary check timed out when the full suite loaded the machine.
- Informal beside formal (`lii-53v.3`): the widget `informal-formal` sets a
  proof in sentences beside the Lean of one of the lesson's exercises (its
  reference solution, so Lean has accepted it). Each sentence names the
  lines that say it (`"2-3: …"`, many-to-many); selecting either side
  lights the other, and selecting a line asks Lean for the state after it
  (a check without `record`, so not an attempt). A line no sentence covers
  is marked unsaid. The loader refuses an exercise that is not the
  lesson's or not a proof, and a line past the solution. In its own lesson
  it waits until the exercise is solved. First used
  under "Putting them together" in "If… then".
- Truth tables and induction dominoes (`lii-53v.5`, `lii-dvy.9`): two more
  widgets. `truth-table` draws every row of a formula in and, or, not,
  implies and iff (its own parser, `web/shared/truthtable.ts`, never
  `eval`), with a column for each part, and can ask the learner to fill in
  the last column. `induction-dominoes` pushes a row of dominoes; taking
  away the base case or the step stops the chain, and `gap` breaks the
  step at one n. In the lessons: the table of p → q in "If… then", the
  dominoes under Dominoes in "Induction", and both in a Lab explorer.
- A file with no imports no longer pays for Lean's core library under the
  proof's time limit (`lii-a7b`): when a document is new or its imports
  change, even to none, the load is a step of its own under the long
  limit. This was what made "loading a library never counts against a
  proof's time" fail now and then (a fresh worker on the core library takes
  about 2 s here).
- Spot the flaw (`lii-6xv.4`): the kind `flaw`, an argument in words with
  one wrong step to find, marked against the author's answer; the
  explanation shows once the step is found. No lesson uses it yet.
- Pictures for Level 3 (`lii-dvy.11`): three more widgets. `plot` graphs
  functions of x from a small expression parser of its own
  (`web/shared/expr.ts`, never `eval`), with a point to move along the
  curves and a view that drags and zooms. `number-line` marks points,
  intervals and a distance, and can carry a movable x with a sentence
  saying where it is. `square-of-sum` is the square of side a + b in four
  pieces. They are in "The real numbers", "Identities", "Inequalities",
  "Absolute value and distance" and "Functions, increasing and bounded".
  This is the plotter and number-line part of `lii-53v.2` and `lii-53v.5`;
  the limit explorers, truth table and dominoes are done (below).
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
  shows "Lean is starting" while Mathlib loads.
- A superseded check is skipped, and a worker has a memory limit
  (`lii-1ou.6`). A check whose browser request was given up on before its
  turn came (the editor asks again as the learner types on) is not sent to
  Lean at all (`wantedWhile` in `web/server/lean/lsp.ts`, tied to the reply
  by `/api/check`, `/api/playground` and `/api/gallery`), so a pile of
  stale checks no longer holds up the one wanted on the shared document;
  nothing is recorded for it. A press of Check is never skipped: it is an
  attempt even if the page went away before its verdict. One already
  running is left to finish or run out of time, since Lean cannot always
  stop a step mid-way. Every Lean
  worker runs with Lean's `-M 8192` (8 GB as Lean counts it; Mathlib alone
  takes over 4 GB, so there even 2 + 2 = 4 dies, and 6 GB checks proofs);
  a check that wants more dies at once, the learner is told it ran out of
  memory (Lean's stderr says so, naming no file, so only a memory death in
  the 2 s before the crash counts; the crash reply does not say), and its
  document is reopened. Not measured: whether the shared exercise
  document's worker grows over a long session towards the limit; if it
  did, a check would be refused and the document reopened, which heals it.
- A calc chain that is not strict enough is told so (`lii-oip`). A chain
  that proves a ≤ c where the goal is a < c is not refused by Lean: it adds
  a last link from c to itself and leaves "case calc.step ⊢ c < c", which
  nothing can prove. `chainNotStrict` in `web/shared/explain.ts` names it
  ("This chain gets to c, but none of its links is strict, so it proves
  less than the goal’s “<”…"; inside a bullet too), and the typed editor's "Not finished" notice says it, as it says
  what only False left means (`whatIsLeft`). A chain that stops short
  ("⊢ b < c", a link still to write) gets nothing particular. Held to
  Lean's real message in `web/server/lean.test.ts`.
- obtain on any fact (`lii-8wq.6`). The board's obtain writes a pattern
  for “there is exactly one” (`obtain ⟨x, hx, huniq⟩`), for membership in
  a Set's ∩ and ∪ (an “and” and an “or” about the two sets), and for
  False (`obtain ⟨⟩`, which ends the goal), besides and, or, iff, exists,
  Even, Odd and ∣. ∩ and ∪ only where every set in them is known to be a
  Set (a Finset's or a List's are not an “and” or an “or” by definition),
  and only when the membership is the fact itself, not inside an
  implication or a “for all”. The replay of every board solution now also
  asks whether the board would refuse its obtain lines. On any other fact the board does not send it
  (`obtainMisfit` in `web/shared/moves.ts`) and says why; on an equation it
  points to rw. Before, it wrote ⟨h1, h2⟩: Lean refused that in words
  about its internals, or quietly substituted an equation away, or split
  a ≤ between natural numbers into Lean's own cases. Each new pattern is
  played against the real Lean in `web/server/lean.test.ts`.
- `docs/DATA.md` (`lii-2zf.3`): what is stored where (the database table
  by table, `data/`, `.env.local`, the settings the server reads), the one
  learner, setup and migrations, the worktree rule, and backup and restore
  with `pg_dump` and `pg_restore`. Its setup, migrate, backup, restore and
  rename-swap steps were tried on scratch databases: the restored copy
  had its rows, all 8 migrations recorded, and the Tutor role's schema access and five grants (and still no access to the chat).
- Field notes, the Tutor's research maps (`lii-2zo.4`): `#/notes`. Ask
  about a result in the news and a research turn maps it. That turn is
  the headless Claude with WebSearch and WebFetch in place of the file
  tools (fetched pages can say anything, so it can read no file to send
  out), in an empty folder, barred from fetching this machine, taking the
  Tutor's one-turn slot. It runs on the server, so leaving the page does
  not stop it; Stop does. The server holds its JSON to the rules
  (`web/shared/research.ts`): every claim cites a source with an http(s)
  link or is moved to "could not confirm"; "claimed" and "formally
  verified" are separate, and a verified item names a real system; with
  nothing verified the note is a fixed sentence, never the Tutor's;
  concepts link to the lesson that teaches them or say "outlined, not yet
  written"; a map with no sources is refused. Each source link is opened
  once (never one on this machine or a private network, redirects checked
  hop by hop), and an item whose every source did not open moves to
  "could not confirm". Each connection is pinned to the address checked,
  so a name that turns into a local one is caught too; a host on this
  machine or a private network is never opened and backs nothing; the link
  stage has a minute in all. Maps are saved in `research_maps` (migration
  0008) with the date, listed, reopened and deleted. Offline, nothing
  starts and the page says the feature needs the internet. Tried in the
  real app with a stand-in `claude` (no real research turn was run):
  made, saved, listed, reopened, deleted; a run went on while another
  page was open, and Stop ended one with nothing saved; a dead link was
  marked and a local one not opened. The link check was also run against
  the real network (a public page, `localhost`, 127.0.0.1, ::1, a public
  name pointing at 127.0.0.1, a name that does not exist).
- Levels 4–8 as a plan (`lii-dvy.6`): each outlined level in
  `content/curriculum.yaml` lists its concepts with what each builds on
  (37 in all, resting on Levels 0–3's), its moves (checked as real
  tactics against the app's Lean and Mathlib), its planned lessons (38,
  each with the id it will have, track, concepts and widgets) and the
  widgets still to build (set diagram, function arrows, program stepper,
  blueprint graph). The loader checks that every concept, track and
  widget a plan names exists, that no concept rests on itself or on a
  later one, that a concept declared for a level is not taught before
  it, that a plan has no stray fields, and that a written planned
  lesson sits where it was planned; a level loses `status: outline` only
  once every move it has has a sentence and a Lab example. The Path lists an
  outlined level's lessons to write and its concepts; `check:content --
  --gaps` lists them too. An outline's moves are a plan only: the Moves
  page, the Lab and mastery count a written level's. The Tutor's writing
  brief says how to write a planned lesson, and that it stays unreachable
  until the level is opened, which needs app code. Counting moves now takes
  the longest first, so `simp only` is not also counted as `simp`. A test keeps
  `docs/PRD.md`'s outlined levels (titles and moves) the same as the file's.
- A board move that gets nowhere is kept as a stumble (`lii-zjf.6`). Lean
  takes `norm_num` on a goal it cannot touch without an error, so the
  server used to keep nothing. Now `checkBody` compares Lean's goals before
  the last line with those after it and says `unchanged` in the reply; a
  board move (`record: "rejected"`) with it is an attempt row, not solved,
  with the board's own sentence as its error, for the history the Tutor
  and mastery read. The board's "gets you no further here" now comes from
  the same comparison, so what is said and what is kept cannot differ.
- Goal cards show a function applied to an argument as the result
  (`lii-8wq.7`). Taking apart “there is exactly one” left
  `huniq : ∀ (y : ℕ), (fun n ↦ n + 1 = 3) y → y = n`; it now reads
  `∀ (y : ℕ), y + 1 = 3 → y = n`. Every exercise's theorem is checked
  under `set_option pp.beta true in`, on the theorem's own line so no line
  number moves (`DISPLAY` in `web/shared/proof.ts`). Display only: what
  is proved is the same. Held in `web/server/lean.test.ts`.
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
  after Fret Not's), read-only: Read, Glob and Grep, no settings files,
  and no MCP server but its own history tools (below); one turn at a time. On an exercise, the hint
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
- Levels fold on the Path (`lii-091`): a level's heading opens and closes
  it. Until the learner says otherwise, only the level with the next
  lesson in it is open; a closed one keeps its number, title, state and
  count of lessons done. Levels are one to a row; an open one has its
  lessons in two columns where there is room. What is opened and closed is kept in the browser (`localStorage`),
  and one control opens or closes them all.
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
- A passing proof is checked by the kernel a second time (`lii-1ou.4`):
  `#lii_replay` under the axiom report renames every constant the file
  added and replays them through `Lean.Kernel.Environment.replay`, so a
  theorem a metaprogram added without the kernel's check is refused even
  with the word list bypassed; so is a file with anything already named
  where the copies go. About 1–4 ms for a typical proof, more where the
  kernel's own check is heavy (it is done twice: 75 ms measured for a
  `decide`-heavy proof). It runs in the same Lean process, so it is a
  second layer under the word list, not a replacement for it.
- The Lean editor is CodeMirror 6 (`lii-8wq.3`), in typed exercises and
  the Playground, behind the same props: Lean's colours, backslash symbol
  names, Tab as two spaces, completion of tactic names and of the names in
  the current goal, a wavy underline under the exact span Lean pointed at
  (`BodyDiagnostic.range`, in the body's own columns) and Lean's message
  on hover. What it knows without asking Lean is pure and tested
  (`web/shared/leaneditor.ts`).
- The Lab (`lii-kqz.1`, `#/lab`): the open side of the app, with nothing
  scored. A move reference, level by level from `curriculum.yaml`: each
  move with what it does and an example that opens as a small Lean file to
  run and change, with the goal at the cursor and Lean's messages beside it
  (the same panel as the Playground, `web/src/proof/LeanPad.tsx`, checked
  by `/api/playground`, so nothing is recorded). Three explorers from the
  widgets there are: functions (plot), the number line, and the square of a
  sum; and a link to the Playground. What is on offer is data in
  `web/shared/lab.ts`; tests hold it to the curriculum (every move has an
  example), to the registry, and to Lean (every example is accepted). The
  Tutor is told the page and the example open. Not yet, with its own
  bead: the program stepper (`lii-53v.4`).
- Famous Proofs gallery (`lii-kqz.2`, `#/lab/famous`): five classic proofs
  from `content/gallery.yaml` (the square root of 2 is irrational, there are
  infinitely many primes, Cantor's diagonal argument, the odd numbers add up
  to squares, the pigeonhole principle). Each has who proved it and why it
  matters, how its Lean statement says the theorem, Mathlib's name for it
  (linked to Mathlib's documentation), and the level whose moves are enough
  to follow it, linked to that level on the Path (`#/level/<id>` unfolds it
  and scrolls to it). The proof is in words beside the Lean, sentence to
  lines as in the `informal-formal` widget (`PairedView`), with the proof
  map under both: hovering or selecting a sentence rings its nodes, and
  clicking a node selects its line and shows Lean's state after it. Lean is
  asked through `/api/gallery`, which takes only the entry's id, reads the
  statement and proof from the file, and records nothing. The loader checks
  each entry's shape; `npm test` and `npm run check:content` check every
  proof against the real Lean, and `npm test` that its map reaches the last
  line with every goal done.
- The header fits a phone (`lii-h1d`): below 768 px the sections (Path,
  Review, Moves, Lab, Playground) take a row of their own under the name and
  the Listen button, and scroll within it if they must, so no page scrolls
  sideways from the header at 390 px. From 768 px up it is one row as before.
- Time per attempt (`lii-zjf.7`): every attempt row keeps `elapsed_ms`,
  the working time on the exercise before that check: how long it had been
  on screen (some of it in the middle 80% of the window) with the tab
  showing, on this visit to the page (`web/shared/clock.ts`;
  `web/src/workclock.ts` watches the element `useTouch` is spread on).
  Not from the page opening, since a lesson shows all its exercises at
  once, nor from the first click, since for a one-click answer that click
  is the answer. Reading it counts; so does sitting idle with it on screen;
  two exercises on screen together both count. Each visit starts again, so
  a solve's time is that visit's, not the total. The browser sends it with
  each check that is an attempt; the server keeps whole ms from 0 to a day,
  and null otherwise (past a day the browser sends none), and older rows
  have null. The Tutor's history tool shows it as `secondsWorked`. Nothing
  grades by it.
- Listen mode (`lii-1gs.1`), ported from Fret Not: a Listen button in the
  header opens the switch, the voice and the quality; with it on and a
  voice chosen, play controls sit at the foot of the page (back, −5 s,
  play/pause, +5 s, skip, stop, speed). Play reads the open lesson block by
  block with the word sounding marked; it reads an exercise's title and
  claim and then waits there, as it does at a widget, until Play or Skip.
  Nothing starts by itself. A Tutor reply is read as it arrives (Back and
  Skip then act on the reply, and the lesson keeps its place). Fenced
  code is shown and not read. The text goes to ElevenLabs
  (`web/server/tts.ts`, behind `wrap()`) the first time it is heard; the
  audio and word timings are then kept under `data/tts-cache/`, so a second
  listen makes no call. The key is `ELEVENLABS_API_KEY` in the gitignored
  `.env.local`, read on the server and sent only in a header; with no key
  the panel says how to add one and nothing else changes. Voice, quality
  and the switch are columns on the learner (migration `0004_listen`: run
  `npm run db:setup` once after pulling, or the dev server stops at its
  boot check); the speed is the browser's. The alignment, speakable-text
  and transport logic is pure and tested (`web/shared/tts/`); the server
  tests stand in for ElevenLabs. Not yet checked against the real
  ElevenLabs from this repo.
- Spoken forms for Listen mode (`lii-1gs.2`): a `code` span is said from the
  form its author wrote, `` `code`{say: …} ``, or failing that from the
  tables in `web/shared/tts/say.ts` (names by their pieces, tactic lines,
  simple formulas, `n : ℕ` as "n, a natural number"), and is marked as one
  unit however many words are said for it. Symbols in running text and in
  exercise claims are said as words (a², ≤, ×). A fenced block is still
  not read; with `say: …` on its opening line that summary is said while
  the block is marked. Every ` ```lean ` block in the lessons has a
  summary, and the eleven spans the tables were not sure of have written
  forms. `check:content --gaps` lists spans with no form that the tables
  are not sure of, and symbols no table has; both lists are empty now.
  `docs/CONTENT.md` "Spoken forms" has the syntax. How the forms sound in
  a real voice has not been heard: nothing was sent to ElevenLabs.
- The Tutor reads the learner's history (`lii-2zo.5`), and cannot change
  it: three tools, `recent_attempts` (checks newest first, with the proof
  sent, Lean's error and the hint rung), `trouble` (failed checks by
  concept and by move, with the commonest errors) and `progress` (mastery,
  what is due, which levels are open, worked out as the Path does). They
  are a stdio MCP server (`scripts/history-mcp.mjs`, after Lingo Dojo's
  bank server) that each Tutor run starts with the learner fixed in its
  environment. It reads as the Postgres role `lean_tutor_ro` (migration
  `0005_tutor_reader`: SELECT on `attempts`, `solved_exercises`, `hints`,
  `level_opens` and `concept_credits`, nothing else, no login), inside a
  read-only transaction; the tests show every write through it failing, on
  PGlite. A role of that name with more than those grants is refused, by
  the migration and again before each read. The queries are the `reader…`
  functions of `scripts/db/progress.ts`. The role belongs to the whole Postgres server, so a scratch
  database names its own with `LEAN_INTO_IT_READER_ROLE`
  (`lean_tutor_ro_scratch`). The drawer says the Tutor can read the
  attempts. Checked against a real Postgres 17 over stdio; not yet tried
  in a real Tutor turn (that spends a `claude` call), so whether the CLI
  hands the tools to the run under `--restricted` is unproven.
- The Tutor is a proof partner in the Playground (`lii-2zo.3`). A turn
  asked from the Playground is given one more tool, `lean_check`
  (`scripts/lean-mcp.mjs`): it posts scratch Lean to `/api/tutor/lean`
  with a token made for that turn, and gets back Lean's messages by line,
  whether Lean accepted the text, whether a `sorry` is left, and the goals
  after a line it names. The scratch text is checked by a Lean of its
  own, never the learner's file. It is searched first and
  refused unread unless it is plainly statements, proofs and look-ups
  (`web/shared/partner.ts`): a line in the first column must start one of
  a short list of commands, and nowhere may the text name what makes Lean
  run code of the file's own (`#eval`, `IO`, `macro`, `elab`, `simproc`,
  attributes off a list of four, `plausible`, `config :=`, `import` …) or
  an `axiom`. The filter reads words and is the outer layer only; under
  it the Tutor's Lean is sandboxed (next entry). Of the `#` commands only
  `#check`, `#check_failure`, `#print`, `#reduce` and
  `#synth` run. The server then asks Lean again about each Lean block in
  the reply and writes Lean's verdict under it ("checked, no errors",
  "the statement is accepted; the proof is left open", "a sketch, not
  accepted as written", "part of a proof, not checked"), so the label is
  Lean's and not the Tutor's (a line the Tutor wrote that looks like a
  label is taken out). A Lean block that the filter would let through has
  an "Insert into the Playground" button, which adds it at the end of the
  file; nothing reaches the file otherwise. Tested against the real Lean: a statement of
  "the sum of two even numbers is even" elaborates, `Nat.add_zero` is
  looked up and accepted in use, a step returns the goals it leaves. Not
  done: lemma search on the internet (Loogle, LeanSearch), left out
  because it would give a run that can read the attempt history a way to
  send text out. Not yet tried in a real Tutor turn.
- The Tutor's Lean is sandboxed (`lii-2zo.6`). Text the Tutor's model
  wrote (its `lean_check` scratch files and the Lean blocks of a Playground
  reply) is checked by a second Lean process, `lean --server` started
  under macOS's `sandbox-exec` (`web/server/lean/sandbox.ts`,
  `tutorLean()` in `lsp.ts`), not by the `lake serve` that checks the
  learner's own work. Its profile is an allow-list: everything is denied
  unless a line names it. It may read the system's libraries, the
  toolchain and `lean/`, and nothing else (not the home folder, the
  repository, `.env` files, Homebrew's data, `/Applications`); write
  nothing; run only `lean` itself (not `lake`, not a compiler); use no
  network and no Mach service. It runs in `/var/empty`. Tested with the
  real Lean and harmless probes, each refused with "operation not
  permitted" and each allowed when the same file is given to the
  learner's Lean: reading a repository file, listing the home folder,
  asking about a folder in it, listing `/Applications`, reading
  `/etc/hosts`, writing a file, starting `/bin/echo` and `lake`; `ring`
  and `norm_num` still prove. Without `sandbox-exec` (not macOS) the
  Tutor's Lean does not run at all, rather than run unsandboxed. The
  Restart button restarts it too. Not probed from Lean: the network (the
  profile denies it; the reviewer saw `nc` to 127.0.0.1 refused under the
  same network rule). Not covered: the rung-3 hint line, still checked on
  the learner's Lean inside an exercise's brackets; and a block the
  learner chooses to Insert, which goes to their own Playground and so to
  their own Lean (only the word filter stands before that button).
- The Tutor writes lessons and exercises (`lii-2zo.2`). An ordinary
  question to the Tutor (never a hint) may ask for new exercises or a
  lesson. When `content/` is exactly the last commit, that turn runs in a
  git worktree of its own outside the repository (`web/server/turn.ts`,
  taken from Fret Not), with Edit and Write granted only under that copy's
  `content/`, and with the sandboxed `lean_check` tool to try its Lean
  first. What it leaves is judged before anything is committed
  (`web/server/author.ts`): the loader must accept it; no lesson, exercise
  or concept id may have gone; no file but `curriculum.yaml` and
  `lessons/<track>/<name>.md` may have been written; and Lean, the
  sandboxed one, is given every exercise the turn wrote or changed with
  its reference solution exactly as a learner's answer would be checked
  (a fill-the-gap choice that is not the solution must be refused), and
  the Lean snippets of a lesson it touched. What is refused goes back to
  the Tutor for one repair turn. A valid result is committed as
  `agent: <summary>` and fast-forwarded into the branch with plumbing
  (no hooks, no signing, never `git worktree prune`); the chat says
  `Committed <hash>` and the pages show the new lessons without a reload.
  Anything else is thrown away with the copy, and the chat says what
  failed. With uncommitted work in `content/` (or a detached HEAD, a
  merge in progress, a symbolic link) the turn is read-only, in the
  repository, and a note says why and what to do. Before Lean sees a
  lesson the Tutor touched, the word filter reads its Lean: no `#eval`,
  `IO`, macros or anything else `lean_check` refuses may be added (uses
  are counted, so not one more than a person had written there), and a
  file it changed must load afterwards, since
  once a lesson lands, opening it gives its Lean to the learner's own
  Lean, which is not sandboxed. That filter is not a sandbox; the commit
  is the record, and it is the owner's to read. Tested with a stand-in
  agent: in throwaway repositories (never this one: in a test, however it
  is started, a turn may only write into a repository the test names),
  and against
  the real Lean with a good exercise and one whose solution fails. Not
  tried: a real Tutor turn that writes (it would commit to this
  repository). Not built: progress while it works (a writing turn can
  take ten minutes or more behind one waiting request; Stop works); a
  server killed mid-turn leaves its worktree in the temp folder until the
  next start or turn sweeps it.
- Tests: 578, including every reference solution checked by the real Lean,
  the grading refusals (`sorry`, a wrong move, a switched-off tactic, an
  error dressed up as a linter remark, an added axiom, a command smuggled
  into a proof, Lean stopped before its axiom report), the origin guard on
  every mounted route, and the Lean client's stop, restart, eviction and
  timeout paths.
- A Dock app (`lii-nnr.1`): `./macos/build-app.sh` builds and installs
  `/Applications/Lean Into It.app` from `macos/` (the pattern is Fret
  Not's). Clicking it starts the dev server if it is down, waits for the
  page (not for Lean), and focuses the Chrome tab already on the app or
  opens one; Quit stops the server only if the app started it, and the warm
  Lean with it. The server runs as the child of a nested helper app with a
  compiled executable, which is what lets macOS grant it the Documents
  folder; the runner puts elan's and Homebrew's directories on `PATH` so
  Lean is found. `macos/README.md` has the build, the two permission
  prompts and what to do after a rebuild.
- Docs: PRD, this file, `CONTENT.md` (the lesson format as built, with how
  the Lean file is assembled and one complete lesson that the tests load
  and give to Lean), `CONTENT-REFERENCE.md` (generated by `npm run
  gen:reference` from the registry and the move table: every widget,
  exercise kind and move with checked examples; a test fails when it is
  stale; `lii-2zf.1`), the hero-image prompt, README
  with six screenshots (retaken with the CodeMirror editor and the levels'
  progress; the Tutor's added; `lii-2zf.4`; the proof map's with it,
  `lii-8wq.2`), `CLAUDE.md`.

`docs/hero.png` (1600×900, generated from `docs/hero-image-prompt.md`) is
in the repo (`lii-2zf.5`).

## Remaining

3 beads in 3 areas, all P3. "Needs" lists beads that must land first.

### Widgets (epic `lii-53v`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-53v.4` | Program stepper | 3 | |

### Progress (epic `lii-zjf`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-zjf.5` | Database backup script | 3 | |

### Tutor (epic `lii-2zo`)

| Bead | Title | P | Needs |
|---|---|---|---|
| `lii-2zo.7` | wrap(): refuse API requests that did not come from the app's own page | 3 | |
