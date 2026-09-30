-- Plan collaboration (docs/data-model.md §3.3): anchored comments and their +1s (crew-visible, C1),
-- a member's personal "just me" plan ops (owner-only, C2), per-user calendar feed tokens
-- (server-only, C3), the guide's owner-filtered view of personal ops, and the command outcome code
-- a stale plan edit answers with.

-- ---------------------------------------------------------------------------------------------
-- comments: RLS class T. Every member of the trip's crew reads the trip's comments; a member writes
-- as themselves; the author edits or tombstones their own (body cleared, the thread keeps its
-- shape). Anchors: a plan item's stable_id, a poll option id, a day number, or option:poi.
CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  anchor_kind text NOT NULL,
  anchor_id text NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id),
  body text NOT NULL DEFAULT '',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_anchor_kind_check CHECK (anchor_kind IN ('item', 'option', 'day', 'poi_in_option')),
  CONSTRAINT comments_anchor_id_check CHECK (anchor_id ~ '^[0-9a-f:-]{1,80}$'),
  CONSTRAINT comments_body_check CHECK (char_length(body) <= 1000),
  CONSTRAINT comments_tombstone_is_empty CHECK ((deleted_at IS NULL) = (body <> ''))
);
CREATE INDEX comments_trip_anchor_idx ON comments (trip_id, anchor_kind, anchor_id);
CREATE INDEX comments_author_id_idx ON comments (author_id);
CREATE TRIGGER comments_touch_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;

CREATE POLICY comments_select ON comments FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY comments_insert ON comments FOR INSERT TO app_user
  WITH CHECK (author_id = app.uid() AND app.is_trip_member(trip_id) AND deleted_at IS NULL);
CREATE POLICY comments_update_own ON comments FOR UPDATE TO app_user
  USING (author_id = app.uid() AND app.is_trip_member(trip_id))
  WITH CHECK (author_id = app.uid());
CREATE POLICY comments_system ON comments FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON comments TO app_user;
GRANT INSERT (id, trip_id, anchor_kind, anchor_id, author_id, body) ON comments TO app_user;
GRANT UPDATE (body, edited_at, deleted_at) ON comments TO app_user;
GRANT SELECT, INSERT, UPDATE ON comments TO app_system;

-- ---------------------------------------------------------------------------------------------
-- comment_plus_ones: one +1 per member per comment; trip_id is copied from the comment so the trip
-- stream and RLS filter without a join. A member adds their own; taking it back is a server
-- delete (app_user holds no DELETE anywhere).
CREATE TABLE comment_plus_ones (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  comment_id uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_plus_ones_comment_user_key UNIQUE (comment_id, user_id)
);
CREATE INDEX comment_plus_ones_trip_id_idx ON comment_plus_ones (trip_id);
CREATE INDEX comment_plus_ones_user_id_idx ON comment_plus_ones (user_id);

CREATE OR REPLACE FUNCTION app.comment_plus_ones_copy_trip() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  SELECT trip_id INTO NEW.trip_id FROM comments WHERE id = NEW.comment_id AND deleted_at IS NULL;
  IF NEW.trip_id IS NULL THEN
    RAISE EXCEPTION 'comment % does not take +1s', NEW.comment_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.comment_plus_ones_copy_trip() FROM PUBLIC;
CREATE TRIGGER comment_plus_ones_copy_trip BEFORE INSERT ON comment_plus_ones
  FOR EACH ROW EXECUTE FUNCTION app.comment_plus_ones_copy_trip();

ALTER TABLE comment_plus_ones ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_plus_ones FORCE ROW LEVEL SECURITY;
CREATE POLICY comment_plus_ones_select ON comment_plus_ones FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY comment_plus_ones_insert ON comment_plus_ones FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY comment_plus_ones_system ON comment_plus_ones FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON comment_plus_ones TO app_user;
GRANT INSERT (id, comment_id, trip_id, user_id) ON comment_plus_ones TO app_user;
GRANT SELECT, INSERT, DELETE ON comment_plus_ones TO app_system;

-- ---------------------------------------------------------------------------------------------
-- personal_plan_ops: RLS class O. A member's accepted ops applied to their own plan only
-- (docs/product-decisions.md Q-35). Nobody else reads them, not even the organiser; the guide
-- reads its asker's own rows through llm.my_personal_plan_ops only.
CREATE TABLE personal_plan_ops (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  change_set_id uuid REFERENCES change_sets (id),
  base_version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  -- Structural shape: packages/domain/src/plan/change-set-ops.ts#changeSetOpsSchema.
  ops jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_plan_ops_status_check CHECK (status IN ('active', 'dropped')),
  CONSTRAINT personal_plan_ops_ops_is_array_check CHECK (jsonb_typeof(ops) = 'array')
);
CREATE INDEX personal_plan_ops_trip_user_idx ON personal_plan_ops (trip_id, user_id);
CREATE INDEX personal_plan_ops_user_id_idx ON personal_plan_ops (user_id);
CREATE UNIQUE INDEX personal_plan_ops_change_set_user_key ON personal_plan_ops (change_set_id, user_id)
  WHERE change_set_id IS NOT NULL;
CREATE TRIGGER personal_plan_ops_touch_updated_at BEFORE UPDATE ON personal_plan_ops
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE personal_plan_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_plan_ops FORCE ROW LEVEL SECURITY;

CREATE POLICY personal_plan_ops_select_own ON personal_plan_ops FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY personal_plan_ops_insert_own ON personal_plan_ops FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY personal_plan_ops_update_own ON personal_plan_ops FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY personal_plan_ops_system ON personal_plan_ops FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON personal_plan_ops TO app_user;
GRANT INSERT (id, trip_id, user_id, change_set_id, base_version_id, ops, status) ON personal_plan_ops TO app_user;
GRANT UPDATE (base_version_id, ops, status) ON personal_plan_ops TO app_user;
GRANT SELECT, INSERT, UPDATE ON personal_plan_ops TO app_system;

-- The guide's window onto personal ops: the asking user's own active rows on the trip in context
-- (the worker sets app.uid to the job's owner per transaction). guide_reader holds nothing on the
-- base table.
CREATE VIEW llm.my_personal_plan_ops AS
SELECT p.id, p.trip_id, p.change_set_id, p.base_version_id, p.ops, p.created_at
FROM personal_plan_ops p
WHERE p.user_id = app.uid()
  AND p.trip_id = NULLIF(current_setting('app.trip', true), '')::uuid
  AND p.status = 'active';
GRANT SELECT ON llm.my_personal_plan_ops TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- calendar_feed_tokens: RLS class S, C3. The subscribe link's secret is shown once; only its
-- SHA-256 is stored, and only the server (the feed route and the issue/revoke commands, as
-- app_system) reads or writes a row. Revoking stamps revoked_at; the feed then answers 404.
CREATE TABLE calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_feed_tokens_hash_length_check CHECK (octet_length(token_hash) = 32)
);
CREATE INDEX calendar_feed_tokens_trip_user_idx ON calendar_feed_tokens (trip_id, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX calendar_feed_tokens_user_id_idx ON calendar_feed_tokens (user_id);
CREATE TRIGGER calendar_feed_tokens_touch_updated_at BEFORE UPDATE ON calendar_feed_tokens
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_feed_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_feed_tokens_system ON calendar_feed_tokens FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON calendar_feed_tokens TO app_system;

-- ---------------------------------------------------------------------------------------------
-- A plan edit against a superseded version answers PLAN_VERSION_CONFLICT with the latest version.
-- Keep in sync with packages/domain/src/errors.ts#ERROR_CODES (packages/db/test/idempotency.test.ts).
ALTER TABLE cmd_results DROP CONSTRAINT cmd_results_code_check;
ALTER TABLE cmd_results ADD CONSTRAINT cmd_results_code_check CHECK (code IS NULL OR code IN (
  'AUTH_REQUIRED', 'SESSION_REVOKED', 'MERGE_REQUIRED', 'ACCOUNT_CLOSED', 'ATTESTATION_FAILED',
  'FORBIDDEN', 'ACTION_KEY_SCOPE', 'NOT_FOUND', 'VALIDATION', 'STATE_INVALID', 'VERSION_CONFLICT',
  'PLAN_VERSION_CONFLICT', 'IDEMPOTENCY_MISMATCH', 'RATE_LIMITED', 'NUDGE_TOO_SOON',
  'QUOTA_EXHAUSTED', 'REDRAFT_LIMIT', 'SEAT_LIMIT', 'WAITLISTED', 'ENTITLEMENT_REQUIRED',
  'BOOST_INTENT_LOCKED', 'VOTE_CLOSED', 'NOT_ELIGIBLE', 'INVITE_EXPIRED', 'INVITE_REVOKED',
  'CODE_INVALID', 'CODE_REDEEMED', 'CODE_EXPIRED', 'OWNED_BY_OTHER_ACCOUNT', 'K_ANON_UNAVAILABLE',
  'HOLD_EXPIRED', 'HOLD_NOT_PROVIDED', 'SUPPLIER_UNAVAILABLE', 'SUPPLIER_REJECTED',
  'PAYMENT_PENDING', 'LOCATION_IMPLAUSIBLE', 'CONTENT_REJECTED', 'APPROVAL_REQUIRED',
  'PAYLOAD_TOO_LARGE', 'UPSTREAM_TIMEOUT', 'INTERNAL'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: comments and +1s ride the trip
-- stream, personal ops ride trip_me. calendar_feed_tokens (C3) is never published.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['comments', 'comment_plus_ones', 'personal_plan_ops'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON comments, comment_plus_ones, personal_plan_ops TO powersync_repl;
