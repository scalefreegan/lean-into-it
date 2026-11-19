-- The Tutor's read-only role (lii-2zo.5). The Tutor's history tools
-- (scripts/history-mcp.mjs) read the learner's attempts as this role and no
-- other: it can SELECT the attempt and progress tables and nothing else, so
-- nothing the model says can change a row or read the chat or a setting.
--
-- Roles belong to the whole Postgres server, not to one database. The name
-- is lean_tutor_ro unless the setting lii.reader_role names another (a
-- scratch database's own, set by scripts/db/setup.mjs from
-- LEAN_INTO_IT_READER_ROLE). The role cannot log in: the app connects as
-- itself and does SET LOCAL ROLE inside a read-only transaction. A
-- superuser (Homebrew's default) may do that as it is; any other role
-- running this migration is made a member that may SET to the reader and
-- inherits nothing from it.
--
-- A role of that name left by another database is not trusted as found:
-- its attributes are set again, and it must be a member of no other role
-- (membership in pg_read_all_data, say, would let it read every table).
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
  ELSE
    EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', reader);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = reader) THEN
    RAISE EXCEPTION '0005_tutor_reader: the role % is a member of another role, so it could read more than its own grants; revoke that membership, or name another role in LEAN_INTO_IT_READER_ROLE', reader;
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AND NOT pg_has_role(current_user, reader, 'SET') THEN
    EXECUTE format('GRANT %I TO %I WITH INHERIT FALSE, SET TRUE', reader, current_user);
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', reader);
  FOREACH t IN ARRAY ARRAY['attempts', 'solved_exercises', 'hints', 'level_opens', 'concept_credits'] LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', t, reader);
  END LOOP;
END
$$;
