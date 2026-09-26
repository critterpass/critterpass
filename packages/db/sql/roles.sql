-- Cluster-wide roles, schemas and extensions for app-layer authorization plus the RLS backstop
-- (docs/data-model.md §2). Every statement is idempotent: this file runs unmodified against a
-- fresh local Testcontainers Postgres, Railway/PlanetScale staging and production, none of which
-- start from the same bootstrap state. No LOGIN role gets a password here — each is provisioned
-- out-of-band (Railway variables / PlanetScale secrets) and rotated the same way.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_system') THEN
    CREATE ROLE app_system LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'guide_reader') THEN
    CREATE ROLE guide_reader NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_repl') THEN
    -- REPLICATION is granted by platform tooling outside SQL (PlanetScale: `pscale role create
    -- --with-replication`); managed Postgres rejects CREATE ROLE ... REPLICATION here.
    CREATE ROLE powersync_repl LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth') THEN
    CREATE ROLE auth LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_reader') THEN
    CREATE ROLE admin_reader LOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- On managed Postgres this migration runs as a platform-provisioned login (e.g. PlanetScale's
-- pscale_api_*), not literally as app_owner or auth. PostgreSQL 16+ only auto-grants the creator
-- ADMIN option on a role it creates, not SET or INHERIT (`createrole_self_grant`), so
-- `... AUTHORIZATION app_owner` / `AUTHORIZATION auth` below would otherwise fail with "must be
-- able to SET ROLE app_owner". This upgrades that grant; it is skipped wherever the connecting
-- role already IS the target (self-granting a role to itself errors), which is the case on a
-- fresh local Postgres where app_owner is the literal superuser that owns everything already.
DO $$
BEGIN
  IF current_user <> 'app_owner' THEN
    EXECUTE 'GRANT app_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE';
  END IF;
  IF current_user <> 'auth' THEN
    EXECUTE 'GRANT auth TO CURRENT_USER WITH SET TRUE, INHERIT TRUE';
  END IF;
END
$$;

-- Every service's pooled connection currently authenticates as app_owner and downgrades per
-- request via `SET LOCAL ROLE`, which requires membership in the target role.
GRANT app_user TO app_owner;
GRANT app_system TO app_owner;
GRANT guide_reader TO app_owner;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION app_owner;
CREATE SCHEMA IF NOT EXISTS ops AUTHORIZATION app_owner;
CREATE SCHEMA IF NOT EXISTS llm AUTHORIZATION app_owner;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION auth;

-- guide_reader gets USAGE on app too: the llm.* views arriving in phase 13 filter by app.uid(),
-- which runs in the querying role's own session, not the view definer's.
GRANT USAGE ON SCHEMA app TO app_user, app_system, guide_reader;
GRANT USAGE ON SCHEMA llm TO guide_reader;

-- Extensions used across the schema (docs/data-model.md §1); IF NOT EXISTS keeps these a no-op
-- where infra/docker/postgres/init.sql or the PlanetScale org already installed them.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- The PowerSync replication publication is created once, here; every later migration only ever
-- adds tables to it through a guarded DO block, never SET TABLE or drop-and-recreate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync;
  END IF;
END
$$;
