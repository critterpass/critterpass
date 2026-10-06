/**
 * PowerSync `powersync` publication allow-list (docs/data-model.md §1 Conventions, code-standards.md
 * §13): every registered table whose privacy class is C0-C2 enters the publication, except a table
 * whose RLS shape is "S" in data-model.md §1.1's own legend ("no app_user grant... read via API") —
 * a privacy class alone does not mean a client may `SELECT` the table directly.
 * `packages/db/migrations/*_ops_core_and_publication.sql` hand-copies this same list into the
 * publication's guarded `ADD TABLE` loop; `packages/db/test/publication.test.ts` and
 * `tools/scripts/check-publication.ts` both cross-check the two never drift.
 */
import { getTablePrivacy, isPublishableClass, listRegisteredTables } from '@cp/domain';

// Importing the schema barrel runs every schema module's registerTablePrivacy() call once, so
// listRegisteredTables() below always sees the full set regardless of import order elsewhere.
import * as schema from './schema';

/**
 * Tables whose privacy class alone (C0-C2) would qualify them, but whose RLS shape is "S"
 * (docs/data-model.md §1.1): `media_objects` (packages/db/src/schema/identity.ts) has no app_user
 * SELECT policy at all — reads happen only through the API — so a client can never see it directly
 * even though the row content itself is not sensitive. `fair_use_counters`
 * (packages/db/src/schema/entitlements.ts) is the same shape: silent fair-use counts must never be
 * client-visible (docs/product-decisions.md §3 "never shown as a limit"), even though the row
 * content is not otherwise sensitive.
 *
 * `poi_embeddings` (packages/db/src/schema/places.ts) is the same RLS "S" shape: server-only search
 * ranking, no app_user grant at all. `cities` and `poi_live_checks` are RLS "R" (app_user can read
 * them directly) but docs/data-model.md §3.13 marks both `Stream: —`/"not synced" rather than a
 * PowerSync stream name: `cities` is served over HTTP only (too large and too rarely-changing a
 * reference table for a live sync stream), and `poi_live_checks` is a volatile per-POI cache
 * refreshed by on-demand live checks, read through the places API rather than replicated.
 *
 * `install_attributions` (packages/db/src/schema/user-private.ts) is the "S" shape again: a device's
 * attribution record has no app_user SELECT policy at all.
 *
 * `content_releases`, `critter_names` and `poi_hours_proposals` (packages/db/src/schema/content.ts)
 * are "S": releases and hours proposals are ops-console data, and critter names stay server-side
 * until the viewer finds the critter (copied into their own collection entry, never replicated).
 *
 * `persona_packs` (packages/db/src/schema/ai.ts) is "S" as well: persona content reaches the guide
 * only through the `llm.persona_packs` view, never a client.
 * `scheduled_events` (packages/db/src/jobs/schema.ts) is "S" too: server timers, written through
 * `app.schedule_event` and read only by the worker.
 *
 * `push_tokens` (packages/db/src/schema/notifications.ts) is RLS "O (write)" but `Stream: —` in
 * docs/data-model.md §3.11: provider tokens are only ever read by the push sender and the owner's
 * own API calls, never replicated to a client.
 * `moderation_reports` (packages/db/src/schema/ops-console.ts) is "S" as well: a reporter may insert
 * their own report but never read any report back; only the ops console reads the queue.
 * `fare_cells` (packages/db/src/schema/travel-data.ts) is RLS "R" but served over HTTP only
 * (`/v1/fares`, `/v1/destinations/{id}`): nightly fare cells for every origin are too many rows, and
 * too volatile, for a client to hold.
 * `member_etas` (packages/db/src/schema/location.ts) is crew-visible (C1) but realtime only: ETAs
 * reach the crew over Centrifugo `trip_locations:`, gated per share reason, never through sync.
 * `app_open_hours` (packages/db/src/schema/home.ts) is RLS "X": per-hour app-open counts feed the
 * nudge send time on the server and are never replicated, not even to their owner.
 * `flight_watches` (packages/db/src/schema/bookings.ts) is "S": provider alert subscriptions are
 * the server's; travellers see their effect in `flight_segments`.
 * `codes` (packages/db/src/schema/billing.ts) is "S": gift and promo codes are only ever checked by
 * the server (a hash lookup); a client sees its own `code_redemptions`, never a code row.
 * `provider_intake` (packages/db/src/schema/drivers.ts) is "S": a shared driver message carries a
 * third party's phone number, so it is read through the api and never replicated.
 * `affiliate_clicks` (packages/db/src/schema/suppliers.ts) is "S": clicks are written by the api
 * and read only by the conversions import and the ops console, never by a client.
 * `journey_checks` (packages/db/src/schema/disruptions.ts) is C2: the latest running-late ETA per
 * member and item, answered over HTTP and never synced.
 * `swipe_votes` (packages/db/src/schema/explore.ts) is owner-read and holds every "no": the crew
 * syncs `swipe_yes_votes`, the trigger-kept yes-only mirror, and replication never sees a verdict.
 * `place_qna_summaries` is trip-visible (C1) but served by the place context route only.
 * `sponsored_placements` is RLS "R" but read over HTTP only, gated per viewer by `sponsored(u,t)`,
 * and `sponsored_event_counts` is "S": counts the ops console reads, no client ever does.
 * `media_assets` is RLS "R" but read over HTTP only (`/v1/media`): the app fetches a subject's
 * hero when it shows it and prefetches a trip's files to disk itself.
 * `la_push_to_start_tokens`, `device_activities`, `broadcast_channels` and `la_object_states`
 * (packages/db/src/schema/live-activities.ts) stay server-side: Live Activity tokens and frames
 * are the phone's own truth plus the orchestrator's, never synced.
 * `widget_push_tokens`, `installed_widgets` and `widget_push_ledger`
 * (packages/db/src/schema/widgets.ts) stay server-side too: the phone reports its widget token and
 * installed widgets, the worker reads them to push, and no client reads them back.
 * `anniversaries` (packages/db/src/schema/recap.ts) is "S": the anniversary scan's own timers;
 * travellers see the memory it makes, never the schedule.
 * `poi_foursquare_ids` and `foursquare_api_usage` (packages/db/src/schema/places.ts) are "S": the
 * Foursquare id match and the monthly call counts are server bookkeeping for live place details.
 * `poi_foursquare_photos` (same file) is RLS "R" but read over HTTP only (`/v1/media`), like
 * `media_assets`.
 * `mapbox_geocode_usage` (same file) is "S": the monthly count of address lookups sent to Mapbox.
 * `fsq_os_export_runs`, `fsq_os_export_chunks` and `fsq_os_export_rows` (same file) are "S": the
 * ingest's staging copy of FSQ OS Places, read only by the worker.
 * `climate_normals` (packages/db/src/schema/planning.ts) is RLS "R" but served over HTTP only: the
 * usual rain by hour for every cell of every destination is reference data the fit routes read,
 * not something a phone keeps. (`route_cache` in the same file is C4, so it never qualifies.)
 * `pois` (packages/db/src/schema/places.ts) is RLS "R" but holds the whole open-data catalogue:
 * replication keeps a copy of every row of a published table, so phones receive the recommended
 * places through `place_cards` (the trigger-kept card per recommended place) and search the rest
 * over HTTP.
 * `place_profiles` (packages/db/src/schema/place-profiles.ts) is RLS "R" but read over HTTP only
 * (`GET /v1/places/{id}`): phones get a place's profile through the api. `place_search_pace` (same
 * file) is "S": the shared pace of the worker's place searches.
 * `destination_links` (packages/db/src/schema/trips.ts) is RLS "R" but read over HTTP only:
 * how one destination leads to another is shared content phones read through the api.
 * `destination_briefs` (packages/db/src/schema/destination-briefs.ts) is RLS "R" but read over
 * HTTP only: Explore's picks and the recommended order read a destination's brief on the server.
 *
 * The community tables (packages/db/src/schema/community.ts) are shared content and their owners'
 * own rows, read over HTTP with a cache: a crew plan, its consents, copies, ratings, place rating
 * counts and plan links never sync.
 *
 * `season_months`, `season_events`, `destination_cost_indices` (packages/db/src/schema/travel-data.ts,
 * cost.ts) and `crowd_forecasts` are RLS "R" but read over HTTP only (`/v1/destinations/{id}/season`,
 * `/v1/destinations/{id}/cost-indices`, `/v1/places/{id}/crowd-forecasts`): shared reference
 * content a phone asks for when it shows it, kept as its last good copy, never replicated.
 * `driver_listings`, `driver_listing_stats`, `driver_invites`, `driver_ratings`, `driver_tips` and
 * `driver_listing_flags` (packages/db/src/schema/driver-directory.ts) are read over HTTP only: the
 * directory and the crew's own drivers are fetched when a screen shows them, never synced.
 * `destination_home_links` (packages/db/src/schema/destination-travel.ts) is RLS "R" but read
 * over HTTP only (`GET /v1/destinations/{id}/getting-there`); `destination_link_runs` (same file)
 * is "S": the worker's record of a destination's links run.
 * `driver_plan_shares` and `driver_plan_replies` (packages/db/src/schema/plan-shares.ts) are read
 * over HTTP only: the share sheet and review changes fetch a trip's links and a driver's reply
 * when they open, and the link's sealed token must never replicate.
 * Add a new entry here, with the same comment style, if a later table needs the same treatment.
 */
const PUBLISHABLE_CLASS_EXCEPTIONS: ReadonlySet<string> = new Set([
  'affiliate_clicks',
  'anniversaries',
  'app_open_hours',
  'broadcast_channels',
  'cities',
  'climate_normals',
  'codes',
  'content_releases',
  'destination_briefs',
  'destination_home_links',
  'destination_link_runs',
  'destination_links',
  'device_activities',
  'driver_invites',
  'driver_listing_flags',
  'driver_listing_stats',
  'driver_listings',
  'driver_plan_replies',
  'driver_plan_shares',
  'driver_ratings',
  'driver_tips',
  'critter_names',
  'crowd_forecasts',
  'destination_cost_indices',
  'engagement_events',
  'fair_use_counters',
  'fare_cells',
  'flight_watches',
  'foursquare_api_usage',
  'fsq_os_export_chunks',
  'fsq_os_export_rows',
  'fsq_os_export_runs',
  'install_attributions',
  'journey_checks',
  'la_object_states',
  'la_push_to_start_tokens',
  'mapbox_geocode_usage',
  'media_assets',
  'media_objects',
  'member_etas',
  'moderation_reports',
  'persona_packs',
  'place_profiles',
  'place_qna_summaries',
  'place_rating_stats',
  'plan_links',
  'place_search_pace',
  'poi_embeddings',
  'poi_foursquare_ids',
  'poi_foursquare_photos',
  'poi_hours_proposals',
  'poi_live_checks',
  'pois',
  'provider_intake',
  'proposal_followups',
  'push_tokens',
  'ratings',
  'scheduled_events',
  'season_events',
  'season_months',
  'shared_plan_consents',
  'shared_plan_copies',
  'shared_plans',
  'sponsored_event_counts',
  'sponsored_placements',
  'swipe_votes',
  'installed_widgets',
  'widget_push_ledger',
  'widget_push_tokens',
]);

/** Every table this schema declares that the `powersync` publication should carry. */
export function computePublicationAllowList(): readonly string[] {
  void schema; // ensure the side-effecting import above is never tree-shaken away.
  return listRegisteredTables().filter((table) => {
    const privacy = getTablePrivacy(table);
    return (
      privacy !== undefined &&
      isPublishableClass(privacy.class) &&
      !PUBLISHABLE_CLASS_EXCEPTIONS.has(table)
    );
  });
}
