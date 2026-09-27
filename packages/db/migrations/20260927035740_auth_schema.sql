-- Better Auth's own tables (docs/data-model.md §3.1): generated from `getAuthTables` over the
-- exact plugin set services/api/src/auth/config.ts configures (core + anonymous + phoneNumber +
-- jwt + admin), reviewed, and hand-written here per docs/code-standards.md §13. The `auth` schema
-- and `auth` role already exist (packages/db/migrations/20260926212754_core_roles_and_schemas.sql);
-- this migration only adds tables and grants, no RLS: `auth.*` is reachable by the `auth` role only,
-- enforced by never granting SCHEMA USAGE to app_user/guide_reader/powersync_repl (checked by
-- packages/db/test/permissions/auth_schema.test.ts), not by row-level policy.

CREATE TABLE auth."user" (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  is_anonymous boolean NOT NULL DEFAULT false,
  phone_number text UNIQUE,
  phone_number_verified boolean,
  role text,
  banned boolean NOT NULL DEFAULT false,
  ban_reason text,
  ban_expires timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE auth."user" IS 'Better Auth core + anonymous/phoneNumber/admin plugin fields. id is UUIDv7 via advanced.database.generateId and equals public.users.id for the same identity (no cross-schema FK: the pair is created in one request by databaseHooks.user.create.after, not enforced by a constraint, so a hook failure never blocks Better Auth from completing a sign-in).';

CREATE TABLE auth.session (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth."user" (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  impersonated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE auth.session IS 'Stored in Postgres, not Redis: config.ts sets session.storeSessionInDatabase=true because secondaryStorage (Redis) is configured for rate limiting, which would otherwise move sessions into Redis by Better Auth default.';
CREATE INDEX session_user_id_idx ON auth.session (user_id);

CREATE TABLE auth.account (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth."user" (id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX account_user_id_idx ON auth.account (user_id);

CREATE TABLE auth.verification (
  id uuid PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON auth.verification (identifier);

CREATE TABLE auth.jwks (
  id uuid PRIMARY KEY,
  public_key text NOT NULL,
  private_key text NOT NULL,
  alg text,
  crv text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
COMMENT ON TABLE auth.jwks IS 'EdDSA keypairs for the jwt plugin; private_key is AES-256-GCM encrypted by Better Auth with BETTER_AUTH_SECRET. rotationInterval 90d, gracePeriod 7d (services/api/src/auth/config.ts): a key stays in GET /api/auth/jwks (and therefore verifiable) for 7d after a new one takes over signing.';

-- No ALTER ... ENABLE ROW LEVEL SECURITY here on purpose: the RLS backstop (docs/data-model.md §2)
-- is for public-schema tables app_user can reach through a pooled app_owner-derived connection.
-- auth.* has exactly one reader/writer role and no other role has schema USAGE at all, which is a
-- strictly stronger guarantee (a query naming auth.* from app_user/guide_reader/powersync_repl
-- fails with "permission denied for schema auth" before RLS would ever be evaluated).
GRANT USAGE ON SCHEMA auth TO auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO auth;
