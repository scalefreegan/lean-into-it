# Lean Into It — PRD

Personal and localhost, for one adult learner with no login. A **highly visual
app for learning mathematical proof and formal verification with Lean 4**:
what a proof is, logic, induction, algebra and inequalities, on towards
calculus, and proving that small programs do what they say. Every idea is
shown, tried by hand and then checked by Lean. It starts from someone who
once studied maths through calculus and some symbolic logic and has not used
either for a while, so it refreshes as it goes. The design must take later
levels (limits, derivatives, loop invariants) without rework.

The motivation is the run of recent results in which proofs were found or
checked with the help of AI and proof assistants. The app makes no claims
about any particular result; it teaches what "formally verified" means so
that such news can be read with understanding.

Decided 2026-11-17 in the intake interview (16 questions in four rounds, and
one request made mid-interview; all answers below are final for v1):

| Decision | Choice |
|---|---|
| Lean engine | **Local Lean 4 + Mathlib.** The toolchain is installed on this Mac (elan), the Lake project in `lean/` depends on Mathlib, and the app's server keeps one Lean language server (`lake serve`) warm and checks proofs through it. Real goal states and error messages, works offline, and Mathlib gives real numbers, limits, derivatives and tactics such as `ring` and `linarith`. About 7 GB under `lean/.lake` plus about 3 GB of toolchain in `~/.elan` |
| Proof input | **A ladder: visual cards, then typed Lean.** Early levels show the goal and hypotheses as cards and offer a palette of moves to click; the real Lean line each click writes is always visible. Later levels fade the palette until proofs are typed freely in an editor with the same live goal panel |
| App shape | **Guided path + Lab + Tutor**, the shape of Fret Not. A levelled path of short lessons (explain, see, try, then exercises checked by Lean), an open Lab of explorers and a free Lean Playground with nothing scored, and a Tutor chat beside every page |
| Tracks | All four, linked so a concept in one points to its counterpart in the others: **Logic and proof** (`logic`), **Math refresher to calculus** (`math`), **Lean itself** (`lean`), **Verified programs** (`programs`) |
| Tutor roles | All four: **explain and hint**; **write lessons and exercises** into `content/` as git commits, each exercise compiled in Lean with a reference solution before the commit lands; **proof partner in the Playground** (runs Lean itself, turns informal arguments into Lean statements and back, finds Mathlib lemmas); **explain current research results** as a plain-language map of what was claimed, what was formally verified and which path concepts it rests on (needs internet) |
| Grading | **Lean decides, never the Tutor.** A proof passes when Lean accepts it with no errors and no `sorry` |
| Hint style | **Hint ladder.** Three rungs climbed only on request: a nudge about the idea, then the name of the move or lemma, then the exact line with an explanation. Using the last rung marks the exercise as **assisted**, so it comes back in review |
| Visuals | All four as the app's main widgets: **live proof map**, **function and limit explorers**, **informal beside formal**, **program stepper**. Smaller ones (truth tables, number lines, induction dominoes) come along regardless |
| Progress | **Mastery + spaced review**, the Fret Not model: mastery per concept and per tactic from exercise results, due items resurface in a short Review session at growing intervals, levels unlock as mastery builds, and a placement check lets the learner skip what they already know |
| v1 curriculum | **Levels 0–3 fully written, 4–8 outlined** (see Curriculum) |
| Programs | **Functional first, loops later.** v1 proves things about small recursive functions written in Lean (numbers, lists, trees): state a specification as a theorem, test it, then prove it, and see how a test differs from a proof. Imperative code with loop invariants is an outlined later level |
| Proof craft | **Woven in, plus a Famous Proofs gallery.** Every lesson shows how a mathematician would say the argument beside the Lean; short proof-craft lessons cover habits such as trying examples, working backwards and hunting counterexamples; the Lab has a gallery of classic proofs, each as informal beside formal with its proof map |
| Exercises | All four kinds: **Prove it**, **Fill the gap**, **Predict and read**, **True or false**. All graded by Lean or by fixed answers |
| Listen mode | **ElevenLabs read-aloud with word highlighting**, as in Fret Not (added during the interview). **Speak maths, skip code**: formulas are spoken in plain English from a written spoken form and highlight as a whole while said; Lean code blocks are not read, and the narrator says what the code does where the lesson supplies that |
| Learner | **One implicit learner, no login screen.** A second learner later is a row, not a rewrite |
| Store | Curriculum is markdown, YAML and Lean under `content/`, tracked by git. Progress, proof attempts and Tutor chat are rows in a local **Postgres 17** database (`lean_into_it`, Drizzle schema), so the Tutor can read attempt history through a read-only role. Tests run on in-process PGlite |
| Devices | **Mac only**, launched from the Dock; a real keyboard; works from a full window down to a narrow one |
| Stack | Match Fret Not (`../fret-not`): React 19 + Vite 8 + TS strict, Vite middleware API behind the same-origin `wrap()`, Tailwind 4, oxlint, `node --test`, beads (prefix `lii`); Dock app from `macos/`; **port 38800** |
| Repo | **Public**, `github.com/scalefreegan/lean-into-it`, **AGPL-3.0-only**, with the sibling README layout. Lessons are original; Lean and Mathlib are Apache-2.0 dependencies fetched at install, not copied in |
| First PR | **One working slice**, with every remaining requirement filed as a bead and a done/remaining record kept in `docs/STATUS.md` |

## Vocabulary

- **Track** — a sequence of lessons on one subject across the levels:
  `logic`, `math`, `lean`, `programs`. A concept in one track can name its
  counterpart in another (induction on numbers in `math`, induction on lists
  in `programs`).
- **Level** — a stage of the path (0, 1, 2 …). Unlocks, in order, when the
  level before it reaches a mastery threshold, or through the placement check.
- **Concept** — the unit of mastery ("implication", "proof by induction",
  "the triangle inequality"). Lessons teach concepts; exercises test them;
  reviews resurface them.
- **Move** — one step of a proof as the learner makes it. On the proof board
  a move is a click; in the editor it is a line. Each move is a Lean
  **tactic** (`intro`, `apply`, `exact`, `cases`, `rw`, `induction` …).
  Tactics have mastery of their own, beside concepts.
- **Goal** — what is left to prove, written after `⊢`. A proof may have
  several goals open at once.
- **Hypothesis** — a fact available for use, with a name (`h1 : P → Q`).
- **Goal state** — the hypotheses and goals at one point in a proof. Lean
  reports it; the app draws it.
- **Proof board** — the click-to-prove view: hypothesis cards, goal cards, a
  palette of moves, and "Lean written so far".
- **Editor and goal panel** — the type-to-prove view: Lean text on one side,
  the live goal state for the cursor's line on the other.
- **Ladder / rung** — how much of the palette an exercise shows, from every
  relevant move offered (rung 1) to editor only (rung 4).
- **Lesson** — one markdown file: short prose interleaved with **widgets**
  and ending in exercises. Ten minutes or less.
- **Widget** — an interactive visual embedded in a lesson or opened in the
  Lab: proof board, proof map, informal beside formal, function and limit
  explorers, program stepper, truth table, number line, induction dominoes.
- **Proof map** — a diagram of a proof in progress: facts as nodes, moves as
  arrows, open goals highlighted.
- **Informal beside formal** — a textbook-style proof next to its Lean
  proof, each sentence linked to the lines that formalise it.
- **Exercise** — a declared task of one of four kinds, graded by Lean or by
  a fixed answer.
- **Reference solution** — a proof stored with an exercise that Lean
  accepts. It shows the exercise can be done; it is not an answer key the
  learner's proof is compared with.
- **Assisted** — an exercise passed after the last hint rung was used. It
  counts as seen, not mastered.
- **Lab** — the free side of the app: explorers and the Famous Proofs gallery.
- **Playground** — a blank Lean editor with a goal panel. Nothing is scored.
- **Tutor** — the embedded agent in the side chat.
- **Research map** — the Tutor's plain-language account of a result in the
  news, with sources.

## User flow (v1)

1. Open the app (Dock icon or `npm run dev`, http://localhost:38800).
2. **Path** shows the levels, the next lesson, and any reviews due today.
3. A **lesson** alternates short explanations with widgets to play with,
   shows the argument as a mathematician would say it beside the Lean, then
   runs its exercises. Early exercises are proved by clicking moves on the
   proof board; later ones are typed. Lean checks each one, and the result
   updates the mastery of the concepts and tactics it used.
4. Stuck on an exercise: ask the Tutor for a hint, one rung at a time.
5. **Review** is a short mixed session of due concepts and tactics across
   all tracks.
6. The **Lab** is always open: function and limit explorers, truth tables,
   induction dominoes, the proof map and program stepper on something of
   your own, a tactic reference, and the Famous Proofs gallery.
7. The **Playground** is a blank Lean file. Try anything; ask the Tutor to
   work alongside.
8. The **Tutor** chat sits beside every page. Ask why a move did what it
   did, ask for another example, ask it to write more exercises on a
   concept, or ask it to explain a result in the news.
9. A learner who already knows a level takes the **placement check** and
   starts later.

## Curriculum

Each level lists its concepts by track and the moves it introduces. A move,
once introduced, stays in the palette.

Fully written for v1:

- **Level 0 — What a proof is.**
  `logic`: claims, and the difference between evidence and proof (checking
  many cases is not a proof; a pattern can break late); true, false and not
  yet known; hypotheses and goals. `lean`: what Lean is and what "checked"
  means; reading a statement; the proof board. First click-proofs. No typing.
  Moves: `exact`, `rfl`, `norm_num`.
- **Level 1 — Logic you can see.**
  `logic`: and, or, not and false; if… then; if and only if; for all; there
  exists; proof by cases; proof by contradiction and where classical logic
  comes in; truth tables against proofs. `lean`: reading a goal state;
  propositions as types and proofs as terms.
  Moves: `intro`, `apply`, `constructor`, `cases` (and `obtain`),
  `left`, `right`, `use`, `by_contra`, `contradiction`, `exfalso`.
- **Level 2 — Numbers and induction.**
  `math`: the natural numbers as zero and successor; equality and rewriting;
  addition and multiplication defined by recursion; proof by induction and
  strong induction; sum formulas; divisibility and parity. `lean`:
  definitions, `theorem` and `example`, finding a lemma by name.
  `programs`: first verified programs on lists: a recursive function
  (length, append, reverse), a specification as a theorem, testing with
  `#eval`, proof by induction on a list, and how a test differs from a proof.
  Moves: `rw`, `simp`, `induction`, `omega`, `decide`, `exact?`, a first
  `calc`.
- **Level 3 — Algebra and inequalities.**
  `math`: the real numbers and what is assumed about them; identities;
  equations; inequalities and how they combine; absolute value as distance
  and the triangle inequality; functions, graphs, composition, monotone and
  bounded. `lean`: structured proofs with `have` and `calc`; when
  automation is the honest answer and when it hides the idea.
  Moves: `ring`, `linarith`, `nlinarith`, `positivity`,
  `field_simp`, `gcongr`, `have`, `calc`.

Proof-craft lessons run through Levels 0–3: try small examples first; guess
the pattern, then the statement; work backwards from the goal; look for a
counterexample before trying to prove; split into cases; strengthen the
induction hypothesis; state a lemma and reuse it; what "clearly" hides.

Outlined only, for the Tutor and me to fill in:

- **Level 4 — Sets and functions.** Sets, subsets, union and intersection;
  functions as objects; injective, surjective, bijective; images and
  preimages; relations and equivalence classes. Moves: `ext`, `funext`,
  `rintro`, `simp only`, `refine`.
- **Level 5 — Sequences and limits (epsilon-N).** Sequences; what "tends
  to" means; epsilon-N proofs by hand; uniqueness of limits; sums and
  products of limits; bounded monotone sequences. Moves: `specialize`,
  `choose`, `filter_upwards`, working with `∀ ε > 0, ∃ N`.
- **Level 6 — Continuity, derivatives, integrals.** Epsilon-delta
  continuity; the derivative as a limit; rules of differentiation; the mean
  value theorem; the integral and the fundamental theorem. Moves: Mathlib's
  calculus API (`HasDerivAt`, `deriv`, `fun_prop`, `continuity`).
- **Level 7 — Verified programs: specs, invariants, sort, search.**
  Insertion sort and its two-part specification (sorted, a permutation);
  binary search; trees; termination; then imperative code with loops and
  mutable state, proved with invariants.
- **Level 8 — How large formalisations are built.** Mathlib and how it is
  organised; blueprints and dependency graphs; reading a statement you
  cannot yet prove; what AI provers do and what the kernel still checks;
  what a formal proof does and does not establish.

## Exercises

Exercises are declared in the lesson (kind, concept, statement, reference
solution, rung) and **graded by Lean or by fixed answers, never by the
agent**. For a proof, the server owns the statement: it assembles the
preamble, the theorem and the learner's proof body, and passes only if Lean
reports no errors and no `sorry`. The four kinds:

- **Prove it** — a statement to prove from scratch, by clicking moves in
  early levels and typing later.
- **Fill the gap** — a mostly written proof with a missing step, or a choice
  of which lemma or move fits. Lean checks the completed proof.
- **Predict and read** — before a move runs, predict what the goal becomes
  (the right answer is what Lean returns); match an English statement to its
  Lean form; read a statement and say what it claims.
- **True or false** — decide whether a claim holds, then back it up: prove
  it, or give a counterexample that Lean checks. Also spot the flawed step in
  a plausible but wrong argument.

Each attempt records the exercise, the Lean text, the result, Lean's
messages, the time taken, the rung and whether it was assisted. Mastery per
concept and per tactic is a score from recent results; an item that reaches
the threshold enters the review schedule with growing intervals, and a
missed review shortens its interval.

## Tutor

A headless `claude -p` on the Claude Code login (no API key), as in the
sibling apps. Each turn is given the page on screen, the current exercise,
the proof so far, the goal state and the last Lean error.

- **Explain and hint.** Explains why a move did what it did. On an exercise
  it offers the hint ladder; the third rung's line is checked by Lean before
  it is shown, and using it marks the exercise assisted.
- **Write lessons and exercises.** A writing turn runs in a git worktree
  outside the repository and may write only under that worktree's
  `content/`. The running loader validates the result, and every exercise
  must compile in Lean with its reference solution. A valid result arrives
  as one `agent: <summary>` commit; an invalid one never arrives.
- **Proof partner.** In the Playground it runs Lean through the app's
  checker in scratch documents, formalises an informal statement and
  explains a formal one, finds Mathlib lemmas, and suggests a next step on
  request. Suggestions are offered, not typed into the learner's file.
- **Research maps.** Given a result in the news it searches the web and
  writes a map with sources: what was claimed; what was formally verified,
  as distinct from announced; which path concepts it rests on; what is
  still open. It says plainly what it could not confirm.
- **Reads history, never changes it.** Through a Postgres role that can only
  SELECT, for requests such as "write exercises that drill what I keep
  missing".

The Tutor never grades and never writes into the working tree.

## Listen

ElevenLabs reads lesson prose, exercise prompts and Tutor replies aloud with
a word-by-word highlight, using Fret Not's Listen design: a toggle in the
header, a transport, voice settings stored for the learner, audio cached
under `data/`, the key in a gitignored `.env.local`. Without a key
everything else works.

Maths is spoken from a written spoken form supplied in the lesson ("for
every x there exists a y such that…"), and the formula highlights as a whole
while it is said. Lean code blocks are skipped; where the lesson gives a
one-line summary of what the code does, the narrator says that. Lean names
that appear in prose have a pronunciation table.

## Extensibility

- **New levels and lessons**: files under `content/`; the loader validates
  them (known concepts, known widgets, well-formed exercises) and refuses
  invalid files with a readable error. The content checker also compiles
  every reference solution.
- **New widget or exercise kind**: an entry in the registry, a component or
  a grader, then the generated reference.
- **New track**: a track id in `curriculum.yaml` and a folder of lessons.
- **New Lean or Mathlib version**: change `lean/lean-toolchain` and the
  Mathlib revision together, run `npm run lean:setup`, then the content
  checker, which shows every lesson a rename broke.
- **New learner**: a row; progress, attempts and chat hang off its id.
- **Imperative verification** (Level 7): the program stepper's trace format
  leaves room for loop state and an invariant.

## Trust and safety

- **Lean alone grades.** An exercise passes only when Lean accepts the proof
  of the statement the server supplied, with no errors and no `sorry`, and
  Lean reports that the proof rests only on the three axioms of ordinary
  mathematics (`propext`, `Classical.choice`, `Quot.sound`). A proof body
  that runs a program (`run_tac`, `#eval` and the like), changes Lean's
  settings, or tries to end the theorem and write commands of its own is
  refused before Lean sees it. The Tutor's opinion of a proof is never a
  grade.
- **Code typed in the app runs on this Mac.** Lean elaborates what it is
  given with the user's permissions, and Lean code can read files and start
  processes while it is being checked. So the API is same-origin and
  localhost only: every route goes through `wrap()`, which refuses a request
  whose Host is not this machine or whose Origin does not match it, and the
  dev server does not listen on the network. This is a
  single-user tool on the owner's machine, not a service.
- **Tutor-authored content is checked before it lands.** Every exercise the
  Tutor writes must compile with a reference solution, in a worktree, before
  the commit is fast-forwarded. The Tutor cannot write outside `content/`.
- **Research maps carry sources** and separate "claimed" from "formally
  verified". The app ships no claims of its own about recent results.

## Non-goals (v1)

- Phone or tablet layout, touch-first interaction, serving on a tailnet.
- Logins, several learners, a kids mode.
- Imperative programs with loop invariants (outlined, Level 7); verifying
  code in other languages or with other tools.
- Levels 4–8 as written lessons.
- Hosting Lean anywhere but this Mac.
- Reading Lean code aloud token by token.

## Architecture

```
content/               the product (git-tracked)
  curriculum.yaml      tracks, levels and the moves each level introduces (concepts come with mastery)
  lessons/<track>/     one .md per lesson: frontmatter + body with widget and exercise blocks
lean/                  Lake project: lean-toolchain (v4.36.0), lakefile.toml (Mathlib v4.36.0),
                       library LeanIntoIt; .lake/ is gitignored and fetched by `npm run lean:setup`
web/
  server/              Vite serve-middleware API behind the same-origin wrap():
                       the Lean language-server client and /api/check, the content loader,
                       attempts and completion
  shared/              pure TS that runs in the browser, the server and node --test
  src/                 React UI: Path, Lesson, proof board, editor + goal panel, Playground
scripts/               Lean setup, database setup and migrations, tests
scripts/db/            Postgres: Drizzle schema, migrations
data/                  runtime state (gitignored)
macos/                 Dock app, port 38800 (planned)
docs/                  this PRD; STATUS.md (done and remaining); CONTENT.md (lesson format); hero-image-prompt.md
```

## What the first PR contains

The slice, and nothing else: the repo scaffold; the Lean project and its
setup script; the warm Lean checker behind `/api/check`; the content loader;
`curriculum.yaml` with Levels 0–8 listed and one Level 1 logic lesson
written ("If… then", on implication); the Path page; the Lesson page; the
proof board; the typed editor with its live goal panel; the Playground;
"Prove it" exercises graded by Lean; attempts and exercise and lesson
completion stored in Postgres and shown on the Path; tests.

Everything else in this document is filed as a bead. `docs/STATUS.md` lists
what is done and what remains, with bead ids.

## Known gaps after the first PR

- Goal states are parsed from Lean's plain-text goals, which is fragile for
  multi-line types and grouped binders (bead: structured goals).
- A passing proof is checked for extra axioms, and a body that runs a
  program is refused by name. One route is closed only by that refusal: a
  metaprogram that adds a theorem the kernel was told not to check leaves no
  axiom behind. Re-checking a passing proof in a fresh kernel would close it
  independently (bead `lii-1ou.4`).
- An exercise can list tactics that are switched off for it (`forbid`),
  which is a teaching device, not a security one.
- A check that runs longer than two minutes restarts Lean. There is no
  shorter limit per exercise, a check that has been superseded is not
  cancelled inside Lean, and nothing limits Lean's memory (bead: timeouts
  and a restart path).
- The editor is a plain text area with line numbers and symbol shortcuts: no
  syntax colouring or completion.
- Lean's error messages are put in plain words only for the moves the one
  written lesson uses.
- One lesson; no mastery, review, unlocks or placement; no Tutor; no Listen;
  no Lab; no Dock app.
