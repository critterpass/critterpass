-- Merge execution needs app_system to delete an anonymous uid's rows on the tables
-- packages/db/src/merge-rules.ts's registry currently covers (docs/api-contracts.md §5.1
-- POST /v1/auth/merge): the `keep_existing`/`drop` strategies discard the anon row outright, and the
-- `union` strategy first deletes any anon row that would collide with the existing uid's own row on
-- a unique constraint before reassigning the rest; `users` itself is deleted once every registered
-- table has been handled. None of these tables grants app_system DELETE today (deletion is otherwise
-- reserved for dedicated retention jobs); this grant is scoped to exactly the tables merge execution
-- touches, not a blanket DELETE grant, and app_user's own grants are untouched (still no DELETE
-- anywhere for app_user).
GRANT DELETE ON consents, user_settings, user_entitlements, crew_members, trip_participants, users
  TO app_system;

-- fair_use_counters keeps its stricter lockdown (no app_system grant at all —
-- packages/db/test/permissions/fair_use_counters.test.ts asserts this directly): merge cleanup goes
-- through a dedicated SECURITY DEFINER function instead, the same pattern as app.bump_fair_use.
CREATE OR REPLACE FUNCTION app.merge_drop_fair_use_counters(p_user_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM fair_use_counters WHERE user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION app.merge_drop_fair_use_counters(uuid) TO app_system;

-- crews.created_by and media_objects.owner_id both reference users(id) but are not named `user_id`
-- (packages/db/src/merge-rules.ts's coverage test only scans that column name); registered as
-- ordinary `reassign` rules — see execute.ts's applyMergeRule — so merge can UPDATE them onto the
-- existing uid before the anon `users` row is deleted, instead of that DELETE failing on the FK.

-- Keep in sync with packages/domain/src/events/catalogue.ts#DOMAIN_EVENT_TYPES (this file's own
-- convention, set by packages/db/migrations/*_command_and_event_log.sql): auth.merged
-- (docs/api-contracts.md §5.1 POST /v1/auth/merge) is this phase's one new domain event type.
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged'
));
