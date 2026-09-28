-- Crew chat (docs/data-model.md §3.6): messages, reactions and the per-crew sequence counter, the
-- read marker on crew_members, per-user member mutes, the system rows crew changes post, the
-- guide's chat window and the chat domain events.

-- ---------------------------------------------------------------------------------------------
-- crew_chat_counters: RLS class S (C4). One row per crew holding the last assigned `seq`; the
-- message insert trigger increments it under the row lock, so seq is gap-free per crew and follows
-- commit order (a rolled-back send rolls its increment back too).
CREATE TABLE crew_chat_counters (
  crew_id uuid PRIMARY KEY REFERENCES crews (id),
  last_seq bigint NOT NULL DEFAULT 0 CHECK (last_seq >= 0)
);
ALTER TABLE crew_chat_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_chat_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_chat_counters_system ON crew_chat_counters FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON crew_chat_counters TO app_system;

-- ---------------------------------------------------------------------------------------------
-- messages: RLS class M (chat variant). Members, and former members who kept the chat, read the
-- crew's rows except those moderation hid; only an active member inserts, as themselves; a sender
-- edits or tombstones their own rows. Guide, system and card rows are written as app_system.
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  seq bigint NOT NULL,
  sender_kind text NOT NULL CHECK (sender_kind IN ('user', 'guide', 'system')),
  sender_id uuid REFERENCES users (id),
  guide_id uuid REFERENCES guides (id),
  type text NOT NULL CHECK (type IN (
    'text', 'photo', 'voice', 'system', 'poll', 'expense', 'guide_offer', 'changeset',
    'boost_card', 'meetup', 'proposal', 'supplier_order'
  )),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  ref_kind text CHECK (ref_kind ~ '^[a-z_]{1,40}$'),
  ref_id uuid,
  reply_to_id uuid REFERENCES messages (id),
  mentions uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(mentions) <= 16),
  mentions_guide boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 10),
  edited_at timestamptz,
  deleted_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_crew_seq_key UNIQUE (crew_id, seq),
  CONSTRAINT messages_sender_matches_kind CHECK (
    (sender_kind = 'user' AND sender_id IS NOT NULL)
    OR (sender_kind = 'guide' AND sender_id IS NULL)
    OR (sender_kind = 'system' AND sender_id IS NULL)
  ),
  CONSTRAINT messages_tombstone_is_empty CHECK (
    deleted_at IS NULL OR (body = '' AND attachments = '[]'::jsonb)
  )
);
CREATE INDEX messages_crew_seq_desc_idx ON messages (crew_id, seq DESC);
CREATE INDEX messages_sender_id_idx ON messages (sender_id) WHERE sender_id IS NOT NULL;
CREATE INDEX messages_reply_to_id_idx ON messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
-- Media read checks look a key up by containment (original or derived key).
CREATE INDEX messages_attachments_idx ON messages USING gin (attachments jsonb_path_ops);
CREATE TRIGGER messages_touch_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.assign_message_seq() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO crew_chat_counters AS c (crew_id, last_seq) VALUES (NEW.crew_id, 1)
  ON CONFLICT (crew_id) DO UPDATE SET last_seq = c.last_seq + 1
  RETURNING c.last_seq INTO NEW.seq;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.assign_message_seq() FROM PUBLIC;
CREATE TRIGGER messages_assign_seq BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION app.assign_message_seq();

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY messages_select ON messages FOR SELECT TO app_user
  USING (hidden_at IS NULL AND app.is_crew_chat_member(crew_id));
CREATE POLICY messages_insert ON messages FOR INSERT TO app_user
  WITH CHECK (
    sender_kind = 'user' AND sender_id = app.uid() AND hidden_at IS NULL
    AND app.is_crew_member(crew_id)
  );
CREATE POLICY messages_update_own ON messages FOR UPDATE TO app_user
  USING (sender_kind = 'user' AND sender_id = app.uid() AND app.is_crew_member(crew_id))
  WITH CHECK (sender_kind = 'user' AND sender_id = app.uid() AND app.is_crew_member(crew_id));
CREATE POLICY messages_system ON messages FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON messages TO app_user;
GRANT INSERT (id, crew_id, trip_id, sender_kind, sender_id, type, body, reply_to_id, mentions,
  mentions_guide, attachments) ON messages TO app_user;
GRANT UPDATE (body, mentions, mentions_guide, attachments, edited_at, deleted_at) ON messages TO app_user;
GRANT SELECT, INSERT, UPDATE ON messages TO app_system;
GRANT SELECT (attachments, body, created_at, crew_id, deleted_at, edited_at, guide_id, hidden_at, id,
  mentions, mentions_guide, ref_id, ref_kind, reply_to_id, sender_id, sender_kind, seq, trip_id,
  type, updated_at) ON messages TO admin_reader;
CREATE POLICY messages_admin_reader ON messages FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- message_reactions: RLS class M, self write. `crew_id` is copied from the message by trigger so
-- the stream and the policies never trust a client-supplied crew.
CREATE TABLE message_reactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES crews (id),
  user_id uuid NOT NULL REFERENCES users (id),
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_one_per_emoji_key UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX message_reactions_message_id_idx ON message_reactions (message_id);
CREATE INDEX message_reactions_crew_id_idx ON message_reactions (crew_id);
CREATE INDEX message_reactions_user_id_idx ON message_reactions (user_id);

CREATE OR REPLACE FUNCTION app.message_reaction_crew() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  SELECT m.crew_id INTO NEW.crew_id FROM messages m WHERE m.id = NEW.message_id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.message_reaction_crew() FROM PUBLIC;
CREATE TRIGGER message_reactions_crew BEFORE INSERT ON message_reactions
  FOR EACH ROW EXECUTE FUNCTION app.message_reaction_crew();

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions FORCE ROW LEVEL SECURITY;
CREATE POLICY message_reactions_select ON message_reactions FOR SELECT TO app_user
  USING (app.is_crew_chat_member(crew_id));
CREATE POLICY message_reactions_insert ON message_reactions FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_crew_member(crew_id));
CREATE POLICY message_reactions_system ON message_reactions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON message_reactions TO app_user;
GRANT INSERT (id, message_id, crew_id, user_id, emoji) ON message_reactions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON message_reactions TO app_system;
GRANT SELECT (created_at, crew_id, emoji, id, message_id, user_id) ON message_reactions TO admin_reader;
CREATE POLICY message_reactions_admin_reader ON message_reactions FOR SELECT TO admin_reader USING (true);

-- app_user holds DELETE on nothing; taking back one's own reaction goes through this function,
-- which removes only the caller's row and only while they are an active member.
CREATE OR REPLACE FUNCTION app.remove_message_reaction(p_message uuid, p_emoji text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH gone AS (
    DELETE FROM message_reactions r
    WHERE r.message_id = p_message AND r.emoji = p_emoji AND r.user_id = app.uid()
      AND app.is_crew_member(r.crew_id)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM gone)
$$;
REVOKE EXECUTE ON FUNCTION app.remove_message_reaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remove_message_reaction(uuid, text) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- The read marker is the highest seq read (replaces the message-id marker), and a member's mutes
-- (hide a crewmate's messages on their own devices) live with their settings.
ALTER TABLE crew_members DROP COLUMN last_read_message_id;
ALTER TABLE crew_members ADD COLUMN last_read_seq bigint NOT NULL DEFAULT 0 CHECK (last_read_seq >= 0);
GRANT SELECT (last_read_seq) ON crew_members TO admin_reader;
ALTER TABLE user_settings ADD COLUMN muted_uids uuid[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(muted_uids) <= 200);
GRANT SELECT (muted_uids) ON user_settings TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- System rows: a member joining (not the crew's creator), leaving or being removed, and a rename
-- each post one `system` message, in the same transaction as the change.
CREATE OR REPLACE FUNCTION app.post_crew_system_message(p_crew uuid, p_kind text, p_member uuid, p_body text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO messages (crew_id, sender_kind, type, ref_kind, ref_id, body)
  VALUES (p_crew, 'system', 'system', p_kind, p_member, coalesce(p_body, ''))
$$;
REVOKE EXECUTE ON FUNCTION app.post_crew_system_message(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.post_crew_system_message(uuid, text, uuid, text) TO app_system;

CREATE OR REPLACE FUNCTION app.crew_members_chat_rows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  was_active boolean := TG_OP = 'UPDATE' AND OLD.status = 'active';
BEGIN
  IF NEW.status = 'active' AND NOT was_active THEN
    IF NOT EXISTS (SELECT 1 FROM crews c WHERE c.id = NEW.crew_id AND c.created_by = NEW.user_id) THEN
      PERFORM app.post_crew_system_message(NEW.crew_id, 'member_joined', NEW.user_id, NULL);
    END IF;
  ELSIF was_active AND NEW.status <> 'active' THEN
    PERFORM app.post_crew_system_message(NEW.crew_id, 'member_left', NEW.user_id, NULL);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.crew_members_chat_rows() FROM PUBLIC;
CREATE TRIGGER crew_members_chat_rows AFTER INSERT OR UPDATE OF status ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.crew_members_chat_rows();

CREATE OR REPLACE FUNCTION app.crews_chat_rename_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM app.post_crew_system_message(NEW.id, 'crew_renamed', app.uid(), NEW.name);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.crews_chat_rename_row() FROM PUBLIC;
CREATE TRIGGER crews_chat_rename_row AFTER UPDATE OF name ON crews
  FOR EACH ROW EXECUTE FUNCTION app.crews_chat_rename_row();

-- ---------------------------------------------------------------------------------------------
-- llm.chat_window: the guide's view of a crew chat (docs/data-model-sync-and-privacy.md §2). Only
-- visible text from members and the guide, with author display names; never attachments, card
-- payloads (polls, expenses, supplier orders, proposals, ...), system rows, or hidden and deleted
-- rows. Filtered to crews the asking user (`app.uid`) is an active member of. Callers wrap every
-- row as untrusted user data.
GRANT EXECUTE ON FUNCTION app.is_crew_member(uuid) TO guide_reader;

CREATE OR REPLACE VIEW llm.chat_window AS
SELECT
  m.crew_id,
  m.seq,
  CASE m.sender_kind WHEN 'guide' THEN 'guide' ELSE 'member' END AS author_kind,
  CASE m.sender_kind WHEN 'guide' THEN g.name ELSE u.display_name END AS author_name,
  m.type,
  m.body,
  m.created_at
FROM messages m
LEFT JOIN users u ON u.id = m.sender_id
LEFT JOIN guides g ON g.id = m.guide_id
WHERE m.type = 'text'
  AND m.sender_kind IN ('user', 'guide')
  AND m.hidden_at IS NULL
  AND m.deleted_at IS NULL
  AND app.is_crew_member(m.crew_id);

-- The last `n` rows (at most 200) of one crew, oldest first.
CREATE OR REPLACE FUNCTION llm.chat_window(crew uuid, n integer) RETURNS SETOF llm.chat_window
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT * FROM (
    SELECT * FROM llm.chat_window w WHERE w.crew_id = crew
    ORDER BY w.seq DESC LIMIT least(greatest(n, 0), 200)
  ) recent ORDER BY recent.seq
$$;
REVOKE EXECUTE ON FUNCTION llm.chat_window(uuid, integer) FROM PUBLIC;
GRANT SELECT ON llm.chat_window TO guide_reader;
GRANT EXECUTE ON FUNCTION llm.chat_window(uuid, integer) TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- domain_events: chat events join the catalogue (packages/domain/src/chat/events.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'fare.dropped', 'forecast.changed', 'hazard.changed',
  'moderation.decided',
  'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded',
  'pass.issued', 'profile.updated', 'profile.taste_changed', 'profile.avatar_changed',
  'crew.created', 'crew.updated', 'crew.code_rotated', 'user.active_crew_changed',
  'invite.created', 'invite.claimed', 'invite.deferred', 'invite.declined', 'invite.revoked',
  'invite.nudged', 'trip.seat_opened', 'seat_offer.accepted', 'referral.progressed',
  'chat.message_sent', 'chat.message_edited', 'chat.message_deleted', 'chat.reaction_changed',
  'chat.guide_mentioned'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList. crew_chat_counters (C4) stays out.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['messages', 'message_reactions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON messages, message_reactions TO powersync_repl;
