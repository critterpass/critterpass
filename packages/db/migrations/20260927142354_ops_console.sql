-- Ops console: concierge tasks, user approvals, partner adapter switches, moderation reports, the
-- admin_reader read boundary and an append-only admin audit (docs/data-model.md §2, §3.15, §3.16).
-- Enum CHECK lists mirror packages/domain/src/admin/ops-enums.ts.

-- admin_reader: the ops console's read role. The api's pooled connection downgrades to it per
-- request (`SET LOCAL ROLE`), exactly like app_user/app_system.
GRANT admin_reader TO app_owner;
GRANT USAGE ON SCHEMA ops TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.admin_audit: append-only for every role, the table owner included.
ALTER TABLE ops.admin_audit ADD COLUMN op_id uuid;
ALTER TABLE ops.admin_audit ADD COLUMN detail jsonb;
CREATE INDEX admin_audit_at_idx ON ops.admin_audit (at DESC);
CREATE INDEX admin_audit_admin_idx ON ops.admin_audit (admin_id, at DESC);

CREATE OR REPLACE FUNCTION app.deny_admin_audit_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'ops.admin_audit is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE EXECUTE ON FUNCTION app.deny_admin_audit_change() FROM PUBLIC;

CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON ops.admin_audit
  FOR EACH ROW EXECUTE FUNCTION app.deny_admin_audit_change();
CREATE TRIGGER admin_audit_no_truncate BEFORE TRUNCATE ON ops.admin_audit
  FOR EACH STATEMENT EXECUTE FUNCTION app.deny_admin_audit_change();

CREATE POLICY admin_audit_admin_reader ON ops.admin_audit FOR SELECT TO admin_reader USING (true);
GRANT SELECT ON ops.admin_audit TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.ops_config: optimistic concurrency, audience and last editor for the flag editor. Only
-- public, all-audience keys project to client_config; scoped flags are resolved server-side.
ALTER TABLE ops.ops_config ADD COLUMN version int NOT NULL DEFAULT 1;
ALTER TABLE ops.ops_config ADD COLUMN audience jsonb NOT NULL DEFAULT '{"kind": "all"}'::jsonb;
ALTER TABLE ops.ops_config ADD COLUMN updated_by uuid;
ALTER TABLE ops.ops_config ADD CONSTRAINT ops_config_audience_kind_check
  CHECK (audience->>'kind' IN ('all', 'cohort', 'uids', 'app_version'));

CREATE OR REPLACE FUNCTION app.sync_client_config() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM client_config WHERE key = OLD.key;
    RETURN OLD;
  END IF;

  IF NEW.is_public AND NEW.audience->>'kind' = 'all' THEN
    INSERT INTO client_config (key, value) VALUES (NEW.key, NEW.value)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ELSE
    DELETE FROM client_config WHERE key = NEW.key;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_client_config() FROM PUBLIC;

CREATE POLICY ops_config_admin_reader ON ops.ops_config FOR SELECT TO admin_reader USING (true);
GRANT SELECT ON ops.ops_config TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.approvals: the exact text a user approved. The one app_user carve-out in `ops`: a user may
-- insert their own approval (from the app) but never read, change or delete one.
CREATE TABLE ops.approvals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  subject_kind text NOT NULL CHECK (subject_kind ~ '^[a-z][a-z_]*$'),
  subject_id uuid NOT NULL,
  text_shown text NOT NULL CHECK (length(text_shown) BETWEEN 1 AND 4000),
  approved_at timestamptz NOT NULL DEFAULT now(),
  op_id uuid UNIQUE
);
CREATE INDEX approvals_subject_idx ON ops.approvals (subject_kind, subject_id);
CREATE INDEX approvals_user_idx ON ops.approvals (user_id);
ALTER TABLE ops.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY approvals_insert_own ON ops.approvals FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid());
CREATE POLICY approvals_system ON ops.approvals FOR ALL TO app_system USING (true) WITH CHECK (true);
CREATE POLICY approvals_admin_reader ON ops.approvals FOR SELECT TO admin_reader USING (true);
GRANT USAGE ON SCHEMA ops TO app_user;
GRANT INSERT (id, user_id, subject_kind, subject_id, text_shown, op_id) ON ops.approvals TO app_user;
GRANT SELECT, INSERT ON ops.approvals TO app_system;
GRANT SELECT ON ops.approvals TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.concierge_tasks: the human ops desk queue.
CREATE TABLE ops.concierge_tasks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid REFERENCES trips (id),
  requested_by uuid REFERENCES users (id),
  kind text NOT NULL
    CHECK (kind IN ('vendor_message', 'clinic_handoff', 'partner_booking', 'review')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'waiting_user', 'done', 'cancelled')),
  assignee_admin_id uuid,
  approval_id uuid REFERENCES ops.approvals (id),
  due_at timestamptz,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(notes) = 'array'),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX concierge_tasks_queue_idx ON ops.concierge_tasks (status, due_at);
CREATE INDEX concierge_tasks_trip_idx ON ops.concierge_tasks (trip_id);
CREATE INDEX concierge_tasks_requested_by_idx ON ops.concierge_tasks (requested_by);
CREATE INDEX concierge_tasks_approval_idx ON ops.concierge_tasks (approval_id);
CREATE TRIGGER concierge_tasks_touch_updated_at BEFORE UPDATE ON ops.concierge_tasks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE ops.concierge_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.concierge_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY concierge_tasks_system ON ops.concierge_tasks FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY concierge_tasks_admin_reader ON ops.concierge_tasks FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE ON ops.concierge_tasks TO app_system;
GRANT SELECT ON ops.concierge_tasks TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.partner_adapters: one switch per supplier adapter; `set_partner_adapter` mirrors each row
-- into the public `supplier.<partner>.*` config keys so app copy switches with it.
CREATE TABLE ops.partner_adapters (
  partner text PRIMARY KEY
    CHECK (partner IN ('agoda_demand', 'klook_activity', 'trip_com_at', 'viator_booking', 'gyg_api')),
  enabled boolean NOT NULL DEFAULT false,
  copy_mode text NOT NULL DEFAULT 'link' CHECK (copy_mode IN ('link', 'booking')),
  approved_at timestamptz,
  notes text CHECK (length(notes) <= 2000),
  version int NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER partner_adapters_touch_updated_at BEFORE UPDATE ON ops.partner_adapters
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE ops.partner_adapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.partner_adapters FORCE ROW LEVEL SECURITY;
CREATE POLICY partner_adapters_system ON ops.partner_adapters FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY partner_adapters_admin_reader ON ops.partner_adapters FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE ON ops.partner_adapters TO app_system;
GRANT SELECT ON ops.partner_adapters TO admin_reader;

-- Every adapter starts switched off on link copy, except Viator, whose booking API is live.
INSERT INTO ops.partner_adapters (partner, enabled, copy_mode, approved_at) VALUES
  ('agoda_demand', false, 'link', NULL),
  ('klook_activity', false, 'link', NULL),
  ('trip_com_at', false, 'link', NULL),
  ('viator_booking', true, 'booking', now()),
  ('gyg_api', false, 'link', NULL)
ON CONFLICT (partner) DO NOTHING;

-- The public copy switches the app reads through client_config, in step with the rows above.
INSERT INTO ops.ops_config (key, value, is_public)
SELECT 'supplier.' || partner || '.' || field, value, true
FROM ops.partner_adapters,
  LATERAL (VALUES ('enabled', to_jsonb(enabled)), ('copy_mode', to_jsonb(copy_mode))) AS f (field, value)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- moderation_reports: RLS class S. A reporter inserts their own report and can never read any
-- report back; collapsing repeats and every verdict run as app_system.
CREATE TABLE moderation_reports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  reporter_id uuid NOT NULL REFERENCES users (id),
  target_kind text NOT NULL CHECK (target_kind ~ '^[a-z][a-z_]*$'),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  report_count int NOT NULL DEFAULT 1 CHECK (report_count >= 1),
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  verdict text CHECK (verdict IN ('approve', 'hide', 'remove', 'ban_author')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_reports_queue_idx ON moderation_reports (status, last_reported_at DESC);
CREATE INDEX moderation_reports_subject_idx ON moderation_reports (target_kind, target_id);
CREATE INDEX moderation_reports_reporter_idx ON moderation_reports (reporter_id);
CREATE TRIGGER moderation_reports_touch_updated_at BEFORE UPDATE ON moderation_reports
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE moderation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY moderation_reports_insert_own ON moderation_reports FOR INSERT TO app_user
  WITH CHECK (reporter_id = app.uid());
CREATE POLICY moderation_reports_system ON moderation_reports FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT INSERT (id, reporter_id, target_kind, target_id, reason) ON moderation_reports TO app_user;
GRANT SELECT, INSERT, UPDATE ON moderation_reports TO app_system;

-- ---------------------------------------------------------------------------------------------
-- admin_reader column grants on `public`: generated from the privacy map with
-- `computeAdminReaderGrants`/`renderAdminReaderGrantSql` (packages/domain/src/admin/reader-grants.ts)
-- over every registered table's columns; C3/C4 columns and unregistered tables get nothing.
-- packages/db/test/permissions/admin-reader.test.ts recomputes the set against the live schema.
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (balances_snapshot, id, purge_at, purged_at, reason, requested_at, restored_at, source, user_id) ON account_deletions TO admin_reader;
CREATE POLICY account_deletions_admin_reader ON account_deletions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (actor_id, actor_kind, at, crew_id, id, object_id, object_kind, text, trip_id, verb) ON activity_events TO admin_reader;
CREATE POLICY activity_events_admin_reader ON activity_events FOR SELECT TO admin_reader USING (true);
GRANT SELECT (base_version_id, cost_micros, created_at, id, input_hash, kind, model, partial, pgboss_job_id, result_ref, status, steps, tokens_in, tokens_out, trip_id, updated_at, user_id) ON agent_jobs TO admin_reader;
CREATE POLICY agent_jobs_admin_reader ON agent_jobs FOR SELECT TO admin_reader USING (true);
GRANT SELECT (at, cache_read, cost_micros, id, job_id, langfuse_trace_id, model, tier, tokens_in, tokens_out, trip_id, user_id) ON ai_usage TO admin_reader;
CREATE POLICY ai_usage_admin_reader ON ai_usage FOR SELECT TO admin_reader USING (true);
GRANT SELECT (approved_by, approved_by_kind, author_id, author_kind, base_version_id, cost_delta_minor, created_at, id, ops, poll_id, result_version_id, scope, status, trigger, trip_id, updated_at) ON change_sets TO admin_reader;
CREATE POLICY change_sets_admin_reader ON change_sets FOR SELECT TO admin_reader USING (true);
GRANT SELECT (country, created_at, iata_nearby, id, lat, lng, location, name, population, source_id, updated_at) ON cities TO admin_reader;
CREATE POLICY cities_admin_reader ON cities FOR SELECT TO admin_reader USING (true);
GRANT SELECT (key, updated_at, value) ON client_config TO admin_reader;
CREATE POLICY client_config_admin_reader ON client_config FOR SELECT TO admin_reader USING (true);
GRANT SELECT (cmd, code, detail, op_id, result_ref, server_ts, status, uid) ON cmd_results TO admin_reader;
CREATE POLICY cmd_results_admin_reader ON cmd_results FOR SELECT TO admin_reader USING (true);
GRANT SELECT (copy_version, created_at, granted_at, id, purpose, revoked_at, scope, updated_at, user_id) ON consents TO admin_reader;
CREATE POLICY consents_admin_reader ON consents FOR SELECT TO admin_reader USING (true);
GRANT SELECT (colour, created_at, crew_id, id, joined_epoch, keep_in_chat, last_read_message_id, left_at, notify_level, role, status, updated_at, user_id) ON crew_members TO admin_reader;
CREATE POLICY crew_members_admin_reader ON crew_members FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, created_by, id, member_ceiling, membership_epoch, name, settlement_currency, updated_at) ON crews TO admin_reader;
CREATE POLICY crews_admin_reader ON crews FOR SELECT TO admin_reader USING (true);
GRANT SELECT (best_months, colour, country, coverage, created_at, currency, geofence, id, name, slug, tz, updated_at) ON destinations TO admin_reader;
CREATE POLICY destinations_admin_reader ON destinations FOR SELECT TO admin_reader USING (true);
GRANT SELECT (cap, count, id, metric, user_id, window_start) ON fair_use_counters TO admin_reader;
CREATE POLICY fair_use_counters_admin_reader ON fair_use_counters FOR SELECT TO admin_reader USING (true);
GRANT SELECT (as_of, base, created_at, id, quote, rate, source) ON fx_snapshots TO admin_reader;
CREATE POLICY fx_snapshots_admin_reader ON fx_snapshots FOR SELECT TO admin_reader USING (true);
GRANT SELECT (audit, change_set_id, channel, compensates_id, cost_delta_minor, created_at, disruption_id, id, inverse, kind, reversible, status, target_provider_id, trip_id, undo_until, updated_at) ON guide_actions TO admin_reader;
CREATE POLICY guide_actions_admin_reader ON guide_actions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, id, offer_id, trip_id, user_id) ON guide_offer_claims TO admin_reader;
CREATE POLICY guide_offer_claims_admin_reader ON guide_offer_claims FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, expires_at, id, kind, message_id, slots_taken, slots_total, status, target_ref, trip_id, updated_at) ON guide_offers TO admin_reader;
CREATE POLICY guide_offers_admin_reader ON guide_offers FOR SELECT TO admin_reader USING (true);
GRANT SELECT (colour, created_at, id, local_words, name, persona_pack_version, slug, updated_at, voice_id) ON guides TO admin_reader;
CREATE POLICY guides_admin_reader ON guides FOR SELECT TO admin_reader USING (true);
GRANT SELECT (channel, claimed_at, created_at, device_id, invite_id, join_code, source) ON install_attributions TO admin_reader;
CREATE POLICY install_attributions_admin_reader ON install_attributions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (cost_pp_minor, created_at, created_by_job_id, currency, id, parent_id, status, trip_id, updated_at, visibility) ON itinerary_versions TO admin_reader;
CREATE POLICY itinerary_versions_admin_reader ON itinerary_versions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (bytes, created_at, destination_id, id, pmtiles_key, updated_at, version) ON map_regions TO admin_reader;
CREATE POLICY map_regions_admin_reader ON map_regions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (bytes, created_at, id, kind, owner_id, purpose, r2_key, sha256, trip_id, updated_at) ON media_objects TO admin_reader;
CREATE POLICY media_objects_admin_reader ON media_objects FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, decided_at, decided_by, id, last_reported_at, reason, report_count, reporter_id, status, target_id, target_kind, updated_at, verdict) ON moderation_reports TO admin_reader;
CREATE POLICY moderation_reports_admin_reader ON moderation_reports FOR SELECT TO admin_reader USING (true);
GRANT SELECT (copy_key, created_at, is_shipped, key, sort, tier, updated_at) ON perks TO admin_reader;
CREATE POLICY perks_admin_reader ON perks FOR SELECT TO admin_reader USING (true);
GRANT SELECT (approved_at, created_at, guide_id, id, lexicon, status, style, system_prompt_ref, updated_at, version, voice_settings) ON persona_packs TO admin_reader;
CREATE POLICY persona_packs_admin_reader ON persona_packs FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, date, day_no, id, theme, trip_id, updated_at, version_id, weather_ref) ON plan_days TO admin_reader;
CREATE POLICY plan_days_admin_reader ON plan_days FOR SELECT TO admin_reader USING (true);
GRANT SELECT (amount_minor, attendee_ids, booking_id, category, cost_model, created_at, created_by_kind, currency, day_id, ends_at, flexibility, id, is_outdoor, lane, must_do_id, notes, poi_id, provider_id, stable_id, starts_at, status, trip_id, tz, updated_at, version_id) ON plan_items TO admin_reader;
CREATE POLICY plan_items_admin_reader ON plan_items FOR SELECT TO admin_reader USING (true);
GRANT SELECT (embedding, model, poi_id, updated_at) ON poi_embeddings TO admin_reader;
CREATE POLICY poi_embeddings_admin_reader ON poi_embeddings FOR SELECT TO admin_reader USING (true);
GRANT SELECT (checked_at, closed_permanently, is_open_now, poi_id) ON poi_live_checks TO admin_reader;
CREATE POLICY poi_live_checks_admin_reader ON poi_live_checks FOR SELECT TO admin_reader USING (true);
GRANT SELECT (address, category, created_at, curation, destination_id, editorial, fts, geofence, hours, hours_verified_at, id, last_live_check_at, lat, lng, location, merged_into_id, name, name_local, price_level, source_ids, status, tags, timezone, updated_at, visit_radius_m) ON pois TO admin_reader;
CREATE POLICY pois_admin_reader ON pois FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, grants, key, store_ids, type, updated_at) ON products TO admin_reader;
CREATE POLICY products_admin_reader ON products FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, created_by, data, due_at, error, fired_at, id, kind, local_at, pgboss_job_id, ref_id, slot, status, tz, updated_at) ON scheduled_events TO admin_reader;
CREATE POLICY scheduled_events_admin_reader ON scheduled_events FOR SELECT TO admin_reader USING (true);
GRANT SELECT (boost_active, computed_at, live_map, redraft_limit, seat_cap, sponsored, trip_id) ON trip_entitlements TO admin_reader;
CREATE POLICY trip_entitlements_admin_reader ON trip_entitlements FOR SELECT TO admin_reader USING (true);
GRANT SELECT (chosen_options, countdown_target_at, created_at, egg_id, holds_seat, id, landed_at, role, rsvp, trip_id, updated_at, user_id, waitlist_position) ON trip_participants TO admin_reader;
CREATE POLICY trip_participants_admin_reader ON trip_participants FOR SELECT TO admin_reader USING (true);
GRANT SELECT (cancelled_at, created_at, crew_id, current_version_id, destination_id, draft_version_id, end_date, guide_id, id, is_guest_guide, is_solo, local_currency, phase, plan_progress, redraft_limit, redrafts_used, reply_by, seat_cap, setup_step, start_date, status, tz, updated_at) ON trips TO admin_reader;
CREATE POLICY trips_admin_reader ON trips FOR SELECT TO admin_reader USING (true);
GRANT SELECT (count, id, limit_at_time, metric, period_key, reset_at, started_at, subject_id, subject_kind) ON usage_counters TO admin_reader;
CREATE POLICY usage_counters_admin_reader ON usage_counters FOR SELECT TO admin_reader USING (true);
GRANT SELECT (computed_at, expires_at, guide_unlimited_global, icon_styles, pass_plus, sources, user_id) ON user_entitlements TO admin_reader;
CREATE POLICY user_entitlements_admin_reader ON user_entitlements FOR SELECT TO admin_reader USING (true);
GRANT SELECT (app_locale, chattiness, created_at, crew_chat_mode, distance_unit, email_import, hide_collection, hide_lockscreen_details, hide_taste_tags, leave_by_through_dnd, location_mode, price_display, talk_out_loud, time_format, updated_at, user_id) ON user_settings TO admin_reader;
CREATE POLICY user_settings_admin_reader ON user_settings FOR SELECT TO admin_reader USING (true);
GRANT SELECT (app_icon, avatar_id, created_at, display_name, home_airport, home_country, home_currency, id, locale, member_since, purge_at, status, tz, updated_at, username) ON users TO admin_reader;
CREATE POLICY users_admin_reader ON users FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants
