# Lean Into It — agent instructions

A visual app for learning mathematical proof and formal verification with
Lean 4. Localhost, one learner, no login. The curriculum is markdown and YAML
under `content/`, tracked by git; attempts and what has been solved are in a
local Postgres 17 database (`lean_into_it`). Proofs are checked by a real
Lean 4 with Mathlib, kept warm by the dev server. Read `docs/PRD.md` first
(what was decided), `docs/STATUS.md` (what exists, and the bead for
everything that does not yet), and `docs/CONTENT.md` (the lesson file format; `docs/CONTENT-REFERENCE.md` is generated from the registry and lists every widget, exercise kind and move)
before touching content or the loader.

## Layout
```
content/                 curriculum.yaml, lessons/<track>/*.md   (the product)
lean/                    Lake project: Lean 4 + Mathlib; .lake/ is fetched by `npm run lean:setup`
web/shared/goals.ts      Lean's printed goals parsed into cards (pure)
web/shared/proof.ts      exercise + body -> Lean source, diagnostics -> verdict (pure)
web/shared/moves.ts      the proof board's moves; each writes one tactic line
web/shared/explain.ts    Lean's error messages in plain words
web/shared/reference.ts  docs/CONTENT-REFERENCE.md as text (scripts/gen-reference.ts writes it)
web/shared/registry.ts   every widget and exercise kind, with its parameters (the loader checks lessons against it)
web/shared/progress.ts   mastery per concept and per move, from the attempt rows (pure)
web/shared/wire.ts       request and reply types shared by server and client
web/server/lean/lsp.ts   the warm Lean: one `lake serve`, JSON-RPC over stdio
web/server/check.ts      /api/check, /api/playground, /api/lean (status), /api/lean/restart
web/server/loader.ts     content/ -> Content, with readable refusals
web/server/contentcheck.ts  what `npm run check:content` asks Lean (scripts/check-content.ts is the command)
web/server/api.ts        wrap() and the route table
web/server/tutor.ts      /api/tutor: the read-only Tutor, the hint ladder, rung 3 checked by Lean
scripts/claude.mjs       the headless `claude -p` the Tutor runs on (read-only sandbox, argv pinned by a test)
scripts/db/              Postgres: schema.ts, migrations/, progress.ts (the only reader/writer of personal rows)
web/src/proof/           ProofBoard, TypedProof, GoalCards, LeanEditor
web/src/widgets/         one component per widget; registry.ts maps registered names to them
web/src/exercises/       one component per exercise kind (ProveIt, FillGap), mapped the same way
web/src/tutor/           the Tutor drawer and what pages tell it (store.ts)
web/src/pages/           Home (the Path), Lesson, Review (#/review), Moves (#/moves), Playground, Gallery (#/gallery)
```

## Rules that keep it working
- Port **38800**, `strictPort`, polling watcher (FSEvents is unreliable on
  this machine). Siblings: Fret Not 38600, jev-ants 38500, Lingo Dojo 38400,
  Atlas 38300, Wine Guide 38200, Basecamp 38100.
- **Lean decides.** An exercise is solved only when Lean accepts the proof of
  the exercise's own statement with no error and no `sorry`, resting only on
  the three standard axioms (`web/shared/proof.ts` `judge`). Nothing else,
  and no agent, grades. The learner's body must not be able to decide for
  Lean: it sits in brackets inside the `by` block, may not close them or
  name a way to run a program (`escapesIn`), and Lean's axiom report after
  the theorem must arrive and be clean. Read the notes at the top of
  `proof.ts` before changing how the source is assembled.
- The statement comes from the exercise file, never from the browser: the
  client sends a proof body and the server assembles the source.
- **Lean runs what it is given with this user's permissions** (a `#eval` can
  start a process). Every API route goes through `wrap()` in
  `web/server/api.ts`: the Host must be this machine and the Origin must
  match it. No exceptions, and never serve this app on a network.
- All exercises share one Lean document (`"exercise"`), the Playground has
  its own. A new document pays for `import Mathlib` again (several seconds);
  a changed one costs about 200 ms. Do not add a document per exercise.
- A check has 20 seconds (`web/server/lean/lsp.ts`); past it the document is
  closed, which ends its Lean worker, and the reply says Lean took too long.
  Only the child process this server spawned is ever signalled.
- Personal rows are read and written only through `scripts/db/progress.ts`,
  whose functions all take the learner id.
- Never change a lesson `id` or an exercise `id` once live: progress is keyed
  on them.
- Every exercise needs a reference `solution` that Lean accepts;
  `web/server/lean.test.ts` checks all of them against the real Lean.
- Adding a board move starts in `web/shared/moves.ts`. Adding a widget or an
  exercise kind starts in `web/shared/registry.ts` (`docs/CONTENT.md` has
  the steps).
- Files under `web/shared/` and `scripts/db/*.ts` are run directly by Node
  (type stripping): explicit `.ts` import extensions, erasable syntax only.
- The facts/goal/closed colours (teal, amber, green) mean the same thing
  wherever a proof state is drawn. Colours come from the tokens in
  `web/src/index.css`; components never write a raw hex or a `dark:` variant.
- Tests never touch the real `content/` for writing, nor a Postgres server:
  `freshDb()` (`scripts/tests/testdb.mjs`, PGlite with the real migrations).
  The Lean tests start a real `lake serve`; where Lean is not installed they
  are skipped with a loud line, which means nothing was checked. Never run
  `npm run db:setup` against the real database from a worktree (a linked
  worktree refuses without its own `DATABASE_URL`).
- Changing the Lean or Mathlib version: `lean/lean-toolchain` and the Mathlib
  `rev` in `lean/lakefile.toml` move together, then `npm run lean:setup` and
  `npm test` (error-message wording in `web/shared/explain.ts` is
  version-specific).
- Keep `docs/STATUS.md` true: the PR that closes a bead moves its row to Done.

## Build & test
```sh
npm install && npm --prefix web install
npm run lean:setup          # once: Lean toolchain + Mathlib cache (about 10 GB in all)
npm run db:setup            # once per machine (Postgres 17 running); idempotent
npm run dev                 # http://localhost:38800
npm test                    # node --test: shared logic, loader, database, real Lean
npm run check:content       # content/ only: structure, every solution and Lean snippet against the real Lean
                            #   -- --no-lean (structure only), --lesson <id>, --gaps, --lean (fail if Lean is missing)
npm run gen:reference       # after editing web/shared/registry.ts or moves.ts; commit docs/CONTENT-REFERENCE.md (a test fails if stale)
npm run typecheck && npm run lint
npm run db:generate         # after editing scripts/db/schema.ts; commit the SQL
```
Verify UI in the real app (Playwright MCP or Claude-in-Chrome) before claiming
a feature works. Lean content must be exactly right: check every statement
and solution against Lean, not from memory. A PR that touches `content/`
runs `npm run check:content` and says so.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
