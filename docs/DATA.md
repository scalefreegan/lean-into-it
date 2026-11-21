# What is stored where

Lean Into It keeps what the learner has done in a local Postgres 17
database, `lean_into_it`. The curriculum is not in it: it is markdown and
YAML under `content/`, tracked by git, and lesson and exercise ids from
those files are the keys the database uses (which is why an id never
changes once live). Mirrors Fret Not's `docs/DATA.md`, without its
accounts: here there is no login and one learner.

| What | Where | Tracked by git |
|---|---|---|
| The curriculum, the Famous Proofs | `content/` | yes |
| Attempts, solves, hints, the Tutor chat, opened levels, placement credits, Listen settings | Postgres `lean_into_it` | no |
| Listen's audio cache | `data/tts-cache/` | no (`data/` is ignored) |
| The ElevenLabs key, local overrides | `.env.local` | no |
| The Playground's Lean file, Listen's speed, which levels are unfolded, a dismissed placement offer | the browser's localStorage (`lean-into-it:…`) | no, and not in the database |
| A Tutor writing turn's scratch checkout | a git worktree under the system temp folder (`lean-into-it-author/`) | its commit lands only after the checks (`web/server/turn.ts`) |
| A Tutor run's working folder | the system temp folder (`lean-into-it-tutor-*`), cleared after 45 minutes (`scripts/claude.mjs`) | no |
| Lean and Mathlib | `lean/.lake/` (about 10 GB), fetched by `npm run lean:setup` | no |

## Setup

Once per machine:

```sh
brew install postgresql@17 && brew services start postgresql@17
npm install && npm --prefix web install
npm run db:setup     # creates the database if missing, applies every migration
```

`db:setup` also creates the Tutor's read-only role (below), which needs a
Postgres user that may create roles; Homebrew's default user may.

`db:setup` and `db:migrate` (pending migrations only; the database must
exist) are idempotent: on a current database they print the state and
change nothing. A database holding a migration this checkout does not know
is refused, untouched. `npm run dev` checks at start that the database
answers and every migration is applied, and stops with "Run `npm run
db:setup`…" if not.

### Which database

`DATABASE_URL` comes from the shell, else `.env.local` in the checkout,
else `postgres://localhost/lean_into_it` (`scripts/db/config.mjs`).

A linked git worktree has no default: with no `DATABASE_URL` it refuses to
start. `.env.local` is per checkout, so a worktree usually has none, and
the default would be the real database, where `db:setup` would apply an
unmerged branch's migrations. Give a branch under test its own:

```sh
createdb lii_scratch
DATABASE_URL=postgres://localhost/lii_scratch LEAN_INTO_IT_READER_ROLE=lean_tutor_ro_scratch npm run db:setup
# ... and when done
dropdb lii_scratch && psql -d postgres -c "drop role lean_tutor_ro_scratch"
```

Never run `npm run db:setup` against the real database from a worktree.

## Schema

`scripts/db/schema.ts` (Drizzle) is the schema; the SQL that reaches a
database is in `scripts/db/migrations/` (`npm run db:generate` after a
schema change, then commit the SQL and its snapshot). Applied migrations
are recorded in `drizzle.__drizzle_migrations`, by hash.

| Table | Key | Holds |
|---|---|---|
| `learners` | `id` (uuid) | `name`; Listen mode's `listen_mode`, `tts_voice_id`, `tts_model_id` (null: the default model) |
| `attempts` | `id` | every recorded check of an exercise: `lesson_id`, `exercise_id`, the proof `body`, `solved`, `error` (Lean's message, or the app's own sentence for a refusal Lean did not make), the highest hint `rung` (1–3) asked for on that exercise that day, the input ladder's `input_rung` (1–2 board, 3–4 editor), `assisted` (rung 3 gave the line), `elapsed_ms` (working time before the check) |
| `solved_exercises` | learner, lesson, exercise | each exercise solved, with the first proof that did it |
| `chat_messages` | `id` | the Tutor chat: `role` user / assistant / note, `text`, the exercise and rung a hint was for; trimmed to the newest 400 |
| `hints` | `id` | every hint rung the Tutor gave, kept apart from the chat so trimming it cannot take back an assisted mark |
| `level_opens` | learner, level | the levels that have opened, and `how`: earned, anyway, placement |
| `concept_credits` | learner, concept | concepts the placement check credited, and when each is `due_at` for review |

Every table but `learners` has a `learner_id`, which cascades on delete.

**Not stored:** mastery, spaced review and what is due. They are worked
out each time from `attempts` and `concept_credits`
(`web/shared/progress.ts`), so a change to how they are worked out applies
to the whole history at once, and they can never drift from it.

**What becomes an attempt** (`web/server/check.ts` `keep`, the request's
`record`): a move on the proof board when Lean refuses it, when it gets
nowhere, or when it finishes a proof not solved yet today; a press of Check
(except on an empty answer, and a true-or-false answered rightly with the
side alone); a typed proof re-checked as it is edited only when it solves
one not solved yet today. Re-checking a stored solution as an exercise
opens is never an attempt.

### Who reads and writes them

- Personal rows are read and written only through `scripts/db/progress.ts`,
  whose functions all take the learner id.
- The Tutor's history tools (`scripts/history-mcp.mjs`) read as a
  separate role, `lean_tutor_ro` (migration `0005_tutor_reader`), granted
  `USAGE` on the schema and `SELECT` on `attempts`, `solved_exercises`,
  `hints`, `level_opens` and `concept_credits`, and nothing else: not the
  chat, not `learners`, no writes. The role cannot log in: the tools
  connect as the app does, in a read-only session, and take on the role
  with `SET LOCAL ROLE` inside a read-only transaction. The role is
  server-wide, the grants per database; `LEAN_INTO_IT_READER_ROLE` names
  another (`lean_tutor_ro_…`) for a scratch database.

## The learner

There are no logins. The first request that needs a learner creates one
row named "Learner" (`ensureLearner`); after that the server uses the
oldest row, looked up once per server process. A second learner would be a second row and a way to choose
between them; nothing in the schema assumes one.

## Files

| Path | Holds |
|---|---|
| `data/tts-cache/` | Listen's audio and word timings from ElevenLabs, named by a hash of the text, voice and model; safe to delete (it is fetched again) |
| `.env.local` | `ELEVENLABS_API_KEY`; optionally `DATABASE_URL` and `LEAN_INTO_IT_READER_ROLE`, the only settings read from it. The key and the role are read per use, so a change to them needs no restart; `DATABASE_URL` is read when the server starts, so a change to it needs a restart (until then the app keeps the old database while the Tutor's history tools, which read it per turn, would see the new one). Never commit it, never print it |

Settings the server reads, mostly for tests and scratch runs. The first two
come from the shell environment, else `.env.local`; the rest from the shell
environment only (putting them in `.env.local` does nothing: in particular,
`LEAN_INTO_IT_AUTHORING=off` there does not stop the Tutor writing lessons).

| Variable | Default | What |
|---|---|---|
| `DATABASE_URL` | `postgres://localhost/lean_into_it` (none in a worktree) | the database |
| `LEAN_INTO_IT_READER_ROLE` | `lean_tutor_ro` | the Tutor's read-only role |
| `LEAN_INTO_IT_DATA_DIR` | `data/` | where the Listen cache goes |
| `LEAN_INTO_IT_CONTENT_DIR` | `content/` | the curriculum the server loads |
| `LEAN_INTO_IT_AUTHORING` | on | `off`: the Tutor never writes lessons |
| `LEAN_INTO_IT_TUTOR_DIR` | system temp `lean-into-it-author/` | where writing turns make their worktrees |
| `LEAN_INTO_IT_REPO_ROOT` | this checkout | the repository writing turns commit to (tests point it at a throwaway one) |
| `LEAN_INTO_IT_ENV_FILE` | `.env.local` | the env file itself |

## Backup and restore

What cannot be fetched again is the database, `.env.local`'s key (which
ElevenLabs can reissue), and what the browser keeps: the Playground's Lean
file is there and nowhere else, so copy out anything in it worth keeping.
A copy of the database is the backup:

```sh
pg_dump -Fc lean_into_it > ~/lean_into_it-$(date +%F).dump
```

To restore, into a database you name, then look before using it:

```sh
createdb lean_into_it_restored
pg_restore --no-owner -d lean_into_it_restored ~/lean_into_it-<date>.dump
psql -d lean_into_it_restored -c "select count(*) from attempts"
```

Then stop the app, and either point `DATABASE_URL` at it (in `.env.local`)
or swap names (`alter database lean_into_it rename to lean_into_it_old;`
and the restored one to `lean_into_it`, from `psql -d postgres`), and start
it again. Its boot check says whether every migration this checkout knows
is applied; if a dump from an older checkout lacks some, `npm run
db:migrate` (with that `DATABASE_URL`) adds them. The dump carries the
migration record, so the restored database is exactly as current as the
one it came from; and it carries the read-only role's grants, which take
effect where that role exists (it is server-wide: on another machine run
`npm run db:setup` first, which creates it).

A script that does this on a schedule is `lii-zjf.5`.

## Testing

Tests never reach a Postgres server. `freshDb()`
(`scripts/tests/testdb.mjs`) gives each suite an in-process PGlite with the
real migrations applied. Tests that write files point
`LEAN_INTO_IT_DATA_DIR` or `LEAN_INTO_IT_CONTENT_DIR` at temp directories
(the Lean and loader tests read the real `content/` and write nothing), and
a Tutor writing turn under test commits only to a throwaway repository
(`scripts/tests/authorrepo.mjs`).
