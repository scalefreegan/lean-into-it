-- The Tutor's read-only role (lii-2zo.5). The Tutor's history tools
-- (scripts/history-mcp.mjs) read the learner's attempts as this role and no
-- other: it can SELECT the attempt and progress tables and nothing else, so
-- nothing the model says can change a row or read the chat or a setting.
--
-- Roles belong to the whole Postgres server, not to one database. The name
-- is lean_tutor_ro unless the setting lii.reader_role names another (a
-- scratch database's own, set by scripts/db/setup.mjs from
-- LEAN_INTO_IT_READER_ROLE). The role cannot log in: the app connects as
-- itself and does SET LOCAL ROLE inside a read-only transaction, which
-- needs the connecting role to be a superuser (Homebrew's default) or a
-- member of this role.
DO $$
DECLARE
  reader text := coalesce(nullif(current_setting('lii.reader_role', true), ''), 'lean_tutor_ro');
  t text;
BEGIN
  IF reader !~ '^lean_tutor_ro[a-z0-9_]{0,40}$' THEN
    RAISE EXCEPTION '0005_tutor_reader: lii.reader_role must look like lean_tutor_ro[a-z0-9_]*, got %', reader;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = reader) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', reader);
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', reader);
  FOREACH t IN ARRAY ARRAY['attempts', 'solved_exercises', 'hints', 'level_opens', 'concept_credits'] LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', t, reader);
  END LOOP;
END
$$;
