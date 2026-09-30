-- Proposals, personal versions, RSVP engagement and private objections (docs/data-model.md §3.5,
-- §3.6; docs/api-contracts-proposal.md). The organiser never learns who opened a proposal or who
-- objected privately: opens land in `engagement_events`, which app_user can neither read nor
-- write except through `app.record_engagement`; private reasons land in `private_guide_threads`,
-- readable by their owner only and never replicated. Anonymous suggestions and unattributed
-- objection changes need a crew of four or more, checked here, not only in the app. Every table
-- is written by the server (a command after its own authorisation, or the worker), so app_user
-- only reads. Doc deltas: `rsvp_suggestions`, `proposal_followups`, and the source link of an
-- anonymous suggestion living on its private thread instead of the suggestion.

-- ---------------------------------------------------------------------------------------------
-- Crew size for the anonymity threshold: active members of the trip's crew. Callable by anyone
-- who can see the trip; a count, never a list.
CREATE OR REPLACE FUNCTION app.trip_crew_size(p_trip uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*)::integer FROM crew_members cm JOIN trips t ON t.crew_id = cm.crew_id
   WHERE t.id = p_trip AND cm.status = 'active'
$$;
REVOKE EXECUTE ON FUNCTION app.trip_crew_size(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.trip_crew_size(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- proposals: RLS class T, C1. One current proposal per trip (a rebuild supersedes the last). Its
-- organisers see it from the start; the rest of the crew only once it is sent (draft privacy).
CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  version_id uuid REFERENCES itinerary_versions (id),
  created_by uuid NOT NULL REFERENCES users (id),
  format text NOT NULL DEFAULT 'trailer' CHECK (format IN ('trailer', 'poster', 'postcard')),
  show_cost boolean NOT NULL DEFAULT true,
  personal boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  reply_by timestamptz NOT NULL,
  -- The earliest free cancellation of a booked stay when the proposal was built (replaces
  -- "hold until"; no stay is ever held).
  stay_free_cancel_until timestamptz,
  status text NOT NULL DEFAULT 'building'
    CHECK (status IN ('building', 'sent', 'locked', 'superseded')),
  sent_at timestamptz,
  reminded_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stay_free_cancel_until IS NULL OR reply_by <= stay_free_cancel_until)
);
CREATE UNIQUE INDEX proposals_current_key ON proposals (trip_id) WHERE status <> 'superseded';
CREATE INDEX proposals_reply_by_idx ON proposals (reply_by) WHERE status = 'sent';
CREATE TRIGGER proposals_touch_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY proposals_select ON proposals FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id)
         AND (app.is_trip_organiser(trip_id) OR sent_at IS NOT NULL));
CREATE POLICY proposals_system ON proposals FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON proposals TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON proposals TO app_system;

-- ---------------------------------------------------------------------------------------------
-- proposal_versions: RLS class T, C1. One per recipient; the recipient sees their own once the
-- proposal is sent, its organisers see every one (PREVIEW AS). `trip_id` repeats the proposal's so
-- policies and streams need no join. Numbers come from the cost engine; the model only words.
CREATE TABLE proposal_versions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  recipient_id uuid NOT NULL REFERENCES users (id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'fallback', 'failed')),
  shared boolean NOT NULL DEFAULT false,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slides) = 'array'),
  poster jsonb CHECK (poster IS NULL OR jsonb_typeof(poster) = 'object'),
  postcard jsonb CHECK (postcard IS NULL OR jsonb_typeof(postcard) = 'object'),
  poster_key text CHECK (char_length(poster_key) <= 300),
  postcard_key text CHECK (char_length(postcard_key) <= 300),
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(highlights) = 'array'),
  savings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(savings) = 'array'),
  savings_minor bigint,
  share_minor bigint,
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  lead_item_id uuid,
  fallback_note text CHECK (char_length(fallback_note) <= 200),
  agent_job_id uuid REFERENCES agent_jobs (id),
  attempts smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_versions_recipient_key UNIQUE (proposal_id, recipient_id)
);
CREATE INDEX proposal_versions_trip_idx ON proposal_versions (trip_id);
CREATE INDEX proposal_versions_recipient_idx ON proposal_versions (recipient_id);
CREATE TRIGGER proposal_versions_touch_updated_at BEFORE UPDATE ON proposal_versions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_versions_select ON proposal_versions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) AND (
    app.is_trip_organiser(trip_id)
    OR (recipient_id = app.uid()
        AND EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.sent_at IS NOT NULL))
  ));
CREATE POLICY proposal_versions_system ON proposal_versions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON proposal_versions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_versions TO app_system;

-- ---------------------------------------------------------------------------------------------
-- proposal_reactions: RLS class T, C1. Quick replies a member chose to post: public on purpose.
CREATE TABLE proposal_reactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL
    CHECK (kind IN ('okay_wow', 'six_am', 'im_in', 'heart', 'fire', 'laugh')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposal_reactions_proposal_idx ON proposal_reactions (proposal_id);
CREATE INDEX proposal_reactions_trip_idx ON proposal_reactions (trip_id);
ALTER TABLE proposal_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_reactions FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_reactions_select ON proposal_reactions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY proposal_reactions_system ON proposal_reactions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON proposal_reactions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_reactions TO app_system;

-- ---------------------------------------------------------------------------------------------
-- hype_aggregates: RLS class T, C1. The crew hype bar, from public reactions and boardings only.
CREATE TABLE hype_aggregates (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES proposals (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  hype_pct smallint NOT NULL DEFAULT 0 CHECK (hype_pct BETWEEN 0 AND 100),
  reacted_count integer NOT NULL DEFAULT 0 CHECK (reacted_count >= 0),
  boarded_count integer NOT NULL DEFAULT 0 CHECK (boarded_count >= 0),
  recipients integer NOT NULL DEFAULT 0 CHECK (recipients >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hype_aggregates_trip_idx ON hype_aggregates (trip_id);
ALTER TABLE hype_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hype_aggregates FORCE ROW LEVEL SECURITY;
CREATE POLICY hype_aggregates_select ON hype_aggregates FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY hype_aggregates_system ON hype_aggregates FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON hype_aggregates TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hype_aggregates TO app_system;

-- ---------------------------------------------------------------------------------------------
-- engagement_events: RLS class S, C2, 90 days. Passive signals (opened, viewed a slide, watched
-- the trailer). No app_user grant at all: a recipient records their own through
-- `app.record_engagement`; only crew-level counts ever leave the server.
CREATE TABLE engagement_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN ('opened', 'viewed', 'trailer_watched')),
  local_hour smallint CHECK (local_hour BETWEEN 0 AND 23),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engagement_events_proposal_user_idx ON engagement_events (proposal_id, user_id);
CREATE INDEX engagement_events_at_idx ON engagement_events (at);
ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_events FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_events_system ON engagement_events FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON engagement_events TO app_system;

-- Records one of the caller's own passive signals on a sent proposal they received. Returns
-- nothing: not even the caller learns a count.
CREATE OR REPLACE FUNCTION app.record_engagement(p_proposal uuid, p_kind text, p_local_hour integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  proposal_trip uuid;
BEGIN
  SELECT p.trip_id INTO proposal_trip FROM proposals p
    JOIN proposal_versions v ON v.proposal_id = p.id AND v.recipient_id = app.uid()
   WHERE p.id = p_proposal AND p.sent_at IS NOT NULL AND app.is_trip_member(p.trip_id);
  IF proposal_trip IS NULL THEN
    RAISE EXCEPTION 'not a recipient of this proposal' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO engagement_events (proposal_id, trip_id, user_id, kind, local_hour)
  VALUES (p_proposal, proposal_trip, app.uid(), p_kind, p_local_hour);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.record_engagement(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_engagement(uuid, text, integer) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- private_guide_threads: RLS class X, C3. A recipient's private reason and the options the guide
-- offered; the organiser, peers, guide_reader and replication never read it. `body_enc` is sealed
-- with the field keyring. `anonymous_suggestion_id` is the only link to what the crew saw.
CREATE TABLE private_guide_threads (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  owner_id uuid NOT NULL REFERENCES users (id),
  reason text NOT NULL CHECK (reason IN ('cost', 'dates', 'plan', 'other')),
  body_enc text CHECK (char_length(body_enc) <= 8000),
  offered_options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(offered_options) = 'array'),
  chosen_option text CHECK (char_length(chosen_option) <= 80),
  follow_up_at timestamptz,
  anonymous_suggestion_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX private_guide_threads_trip_owner_idx ON private_guide_threads (trip_id, owner_id);
CREATE INDEX private_guide_threads_owner_idx ON private_guide_threads (owner_id);
CREATE TRIGGER private_guide_threads_touch_updated_at BEFORE UPDATE ON private_guide_threads
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE private_guide_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_guide_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY private_guide_threads_owner ON private_guide_threads FOR SELECT TO app_user
  USING (owner_id = app.uid());
CREATE POLICY private_guide_threads_system ON private_guide_threads FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON private_guide_threads TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON private_guide_threads TO app_system;

-- ---------------------------------------------------------------------------------------------
-- anonymous_suggestions: RLS class T, C1. "Someone asked about cost": never a name, and only in a
-- crew of four or more. There is no source column; the private thread keeps the link.
CREATE TABLE anonymous_suggestions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  topic text NOT NULL CHECK (topic IN ('cost', 'dates', 'plan', 'other')),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anonymous_suggestions_trip_idx ON anonymous_suggestions (trip_id);
ALTER TABLE anonymous_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_suggestions FORCE ROW LEVEL SECURITY;
CREATE POLICY anonymous_suggestions_select ON anonymous_suggestions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY anonymous_suggestions_system ON anonymous_suggestions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON anonymous_suggestions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON anonymous_suggestions TO app_system;
ALTER TABLE private_guide_threads ADD CONSTRAINT private_guide_threads_anonymous_suggestion_fk
  FOREIGN KEY (anonymous_suggestion_id) REFERENCES anonymous_suggestions (id);

-- The caller's own private thread (locked), checked against the crew-size threshold. Raises
-- insufficient_privilege for someone else's thread and check_violation for a crew under four.
CREATE OR REPLACE FUNCTION app.lock_anonymous_source(p_thread uuid)
RETURNS private_guide_threads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  thread private_guide_threads;
BEGIN
  SELECT * INTO thread FROM private_guide_threads
   WHERE id = p_thread AND owner_id = app.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not your private thread' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app.trip_crew_size(thread.trip_id) < 4 THEN
    RAISE EXCEPTION 'crew too small to stay anonymous' USING ERRCODE = 'check_violation';
  END IF;
  RETURN thread;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.lock_anonymous_source(uuid) FROM PUBLIC;

-- Writes the crew-visible anonymous line for the caller's private reason (once per thread).
CREATE OR REPLACE FUNCTION app.write_anonymous_suggestion(p_thread uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  thread private_guide_threads;
  suggestion uuid;
BEGIN
  thread := app.lock_anonymous_source(p_thread);
  IF thread.anonymous_suggestion_id IS NOT NULL THEN
    RETURN thread.anonymous_suggestion_id;
  END IF;
  INSERT INTO anonymous_suggestions (trip_id, proposal_id, topic, text)
  VALUES (thread.trip_id, thread.proposal_id, thread.reason, CASE thread.reason
    WHEN 'cost' THEN 'Someone asked about cost'
    WHEN 'dates' THEN 'Someone asked about the dates'
    WHEN 'plan' THEN 'Someone asked about the plan'
    ELSE 'Someone has a question about the trip' END)
  RETURNING id INTO suggestion;
  UPDATE private_guide_threads SET anonymous_suggestion_id = suggestion WHERE id = p_thread;
  RETURN suggestion;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.write_anonymous_suggestion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.write_anonymous_suggestion(uuid) TO app_user;

-- Proposes a shared-structure option picked in a private objection as a change set with no
-- author the crew could trace (the trip's guide proposes it). Same threshold and ownership check.
CREATE OR REPLACE FUNCTION app.write_unattributed_changeset(
  p_thread uuid, p_ops jsonb, p_cost_delta_minor bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  thread private_guide_threads;
  base uuid;
  guide uuid;
  created uuid;
BEGIN
  thread := app.lock_anonymous_source(p_thread);
  SELECT t.current_version_id, t.guide_id INTO base, guide FROM trips t WHERE t.id = thread.trip_id;
  IF base IS NULL OR guide IS NULL THEN
    RAISE EXCEPTION 'trip has no plan or guide to propose from' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, status, ops,
                           cost_delta_minor)
  VALUES (thread.trip_id, base, 'chat', 'guide', guide, 'draft', p_ops, p_cost_delta_minor)
  RETURNING id INTO created;
  UPDATE change_sets SET status = 'proposed' WHERE id = created;
  RETURN created;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.write_unattributed_changeset(uuid, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.write_unattributed_changeset(uuid, jsonb, bigint) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- rsvp_suggestions: RLS class T (organisers only), C1. The guide's cards on the organiser's
-- tracker: resend at a hour, an anonymised offer, a nudge. Handled or dismissed ones stay for
-- history; `dedupe_key` keeps one open card per rule and target.
CREATE TABLE rsvp_suggestions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  kind text NOT NULL CHECK (kind IN ('resend', 'offer', 'nudge')),
  target_uid uuid REFERENCES users (id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  copy text NOT NULL CHECK (char_length(copy) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'executed', 'dismissed', 'expired')),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rsvp_suggestions_dedupe_key UNIQUE (proposal_id, dedupe_key)
);
CREATE INDEX rsvp_suggestions_trip_idx ON rsvp_suggestions (trip_id, status);
CREATE TRIGGER rsvp_suggestions_touch_updated_at BEFORE UPDATE ON rsvp_suggestions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE rsvp_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_suggestions FORCE ROW LEVEL SECURITY;
CREATE POLICY rsvp_suggestions_select ON rsvp_suggestions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) AND app.is_trip_organiser(trip_id));
CREATE POLICY rsvp_suggestions_system ON rsvp_suggestions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON rsvp_suggestions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON rsvp_suggestions TO app_system;

-- ---------------------------------------------------------------------------------------------
-- proposal_followups: RLS class O, C2. "Ask me on Sunday" (the recipient's own) and resends the
-- organiser scheduled from a suggestion; `followup.deliver` pushes each once when due. A member
-- reads only their own follow-ups, never a resend aimed at them.
CREATE TABLE proposal_followups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  proposal_id uuid NOT NULL REFERENCES proposals (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN ('followup', 'resend')),
  due_at timestamptz NOT NULL,
  lead_item_id uuid,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX proposal_followups_open_key ON proposal_followups (proposal_id, user_id, kind)
  WHERE status = 'scheduled';
CREATE INDEX proposal_followups_due_idx ON proposal_followups (due_at) WHERE status = 'scheduled';
CREATE TRIGGER proposal_followups_touch_updated_at BEFORE UPDATE ON proposal_followups
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE proposal_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_followups FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_followups_owner ON proposal_followups FOR SELECT TO app_user
  USING (user_id = app.uid() AND kind = 'followup');
CREATE POLICY proposal_followups_system ON proposal_followups FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON proposal_followups TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_followups TO app_system;

-- ---------------------------------------------------------------------------------------------
-- trip_dropouts: RLS class T, C1. The re-split a member's decline proposes (3f-7): the
-- cost engine's before/after per member and the changes to make (rooms, shared costs, supplier
-- seats, third-party stays), built once per (trip, member). The organiser works through it and
-- marks it resolved (`resolve_dropout`); nothing moves before that.
CREATE TABLE trip_dropouts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  ops jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ops) = 'array'),
  members jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(members) = 'array'),
  cost_delta_minor bigint,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_dropouts_trip_user_key UNIQUE (trip_id, user_id)
);
ALTER TABLE trip_dropouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_dropouts FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_dropouts_select ON trip_dropouts FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_dropouts_system ON trip_dropouts FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON trip_dropouts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_dropouts TO app_system;

-- ---------------------------------------------------------------------------------------------
-- A member's command may publish public proposal updates (reactions, statuses, hype, offers) on
-- `proposal:{id}` when they can read the proposal; everything else about `app.enqueue_rt` is
-- unchanged. Per-member signals never go there: the command layer never publishes them.
CREATE OR REPLACE FUNCTION app.enqueue_rt(channel text, payload jsonb, kind text DEFAULT 'publish') RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  caller_uid uuid := app.uid();
  new_id bigint;
BEGIN
  IF kind NOT IN ('publish', 'unsubscribe', 'disconnect') THEN
    RAISE EXCEPTION 'invalid rt_outbox kind: %', kind USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF kind <> 'publish' AND caller_uid IS NOT NULL THEN
    RAISE EXCEPTION 'only app_system or a trigger may enqueue kind %', kind USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF caller_uid IS NOT NULL THEN
    IF NOT (
      channel = app.channel_name('user', caller_uid::text)
      OR (channel LIKE 'crew%:%' AND app.is_crew_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'trip%:%' AND app.is_trip_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'poll:%' AND EXISTS (
        SELECT 1 FROM polls p
         WHERE p.id = split_part(channel, ':', 2)::uuid
           AND app.can_read_poll_scope(p.crew_id, p.trip_id)
      ))
      OR (channel LIKE 'proposal:%' AND EXISTS (
        SELECT 1 FROM proposals p
         WHERE p.id = split_part(channel, ':', 2)::uuid
           AND app.is_trip_member(p.trip_id)
           AND (p.sent_at IS NOT NULL OR app.is_trip_organiser(p.trip_id))
      ))
    ) THEN
      RAISE EXCEPTION 'not permitted to publish on channel %', channel USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO rt_outbox (channel, payload, idem_key, kind)
  VALUES (channel, payload, gen_random_uuid(), kind)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/data-model-sync-and-privacy.md §4): the crew-visible proposal rows
-- sync; engagement, private threads and follow-ups never do.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proposals', 'proposal_versions', 'proposal_reactions', 'hype_aggregates',
    'anonymous_suggestions', 'rsvp_suggestions', 'trip_dropouts'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON proposals, proposal_versions, proposal_reactions, hype_aggregates,
  anonymous_suggestions, rsvp_suggestions, trip_dropouts TO powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- The proposal events join the catalogue (packages/domain/src/proposal/events.ts), added to
-- whatever the constraint lists now.
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'proposal.created', 'proposal.sent', 'proposal.reacted', 'proposal.engagement_counted',
      'proposal.offer_published', 'proposal.reply_by_soon', 'proposal.locked',
      'followup.scheduled', 'followup.due', 'suggestion.executed', 'suggestion.dismissed',
      'participant.declined', 'crew.member_updated'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
