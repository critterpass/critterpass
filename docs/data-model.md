# Critterpass data model

Status: contract for all build phases. Stack: PostgreSQL 18 (PlanetScale Postgres HA, ap-southeast-1) via Drizzle 0.45 core API + `pg`; app-layer policy + RLS backstop; self-hosted PowerSync (Sync Streams); Centrifugo v6; pg-boss. Supabase mechanisms from the master analysis are translated here and never used.

Companion: [data-model-sync-and-privacy.md](./data-model-sync-and-privacy.md) — private-field strategy, state machines, Sync Streams, Centrifugo channels, LLM views, table → phase map.

Sources: master synthesis §0.2 (C1–C48), §1.3, §3, §8, §10.1, §10.4; custom Hono backend report §4.3–4.9; travel supplier report §4, §9; slice "Data model contributions" sections. Decision 10 supersedes C43 (no room holds; Viator holds only).

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Schemas | `public` = domain tables (PowerSync reads `public`); `app` = helper functions, RLS helpers, SECURITY DEFINER aggregates; `auth` = Better Auth tables (owned by role `auth`); `llm` = read views for `guide_reader`; `ops` = back-office, concierge, config, audit; `pgboss` = pg-boss (owned by `app_system`) |
| Primary keys | `id uuid PRIMARY KEY DEFAULT uuidv7()` (PG18 native). Client-created rows (offline) supply their own UUIDv7 `id`; server never rewrites it. Every synced table has a single-column `id` (PowerSync requirement); join tables get a surrogate `id` + a unique constraint on the natural key |
| Command ids | Every write carries `op_id uuid` (client UUIDv7). `cmd_results.op_id` is the idempotency key; replays return the stored result |
| Foreign keys | Always `uuid`, `ON DELETE RESTRICT` by default; `CASCADE` only for pure children (options → poll, shares → expense). Index every FK column used in a policy or stream query |
| Timestamps | `timestamptz` UTC for instants: `created_at DEFAULT now()`, `updated_at` (trigger `app.touch_updated_at`). Never `timestamp without time zone` |
| Local time | Wall-clock events store the instant (`starts_at timestamptz`) **and** the IANA zone (`tz text`, stored canonical: aliases such as `Asia/Saigon` become `Asia/Ho_Chi_Minh` via `canonicalTz` in `@cp/domain` and `app.canonical_tz` triggers; `app.valid_tz` checks it without scanning `pg_timezone_names`). Calendar-only values use `date` (`start_date`, `local_date`). "Daily" periods key on the user's device tz at event time (`period_key text 'YYYY-MM-DD'`) — decision 8 / C47 |
| Money | `amount_minor bigint` + `currency char(3)` (ISO 4217, exponent from `packages/cost-engine` table: JPY/VND/IDR/KRW 0). Never floats. Converted values store `fx_snapshot_id` alongside. Prices shown from quotes carry `quote_id` + `fetched_at` |
| FX rates | `numeric(20,10)`; one `fx_snapshots` row per (base, date, source) |
| Enums | `text` + `CHECK (col IN (...))`, generated from the zod enum in `packages/domain` (expand/contract-friendly; no PG `ENUM` types) |
| Soft delete | User-authored content has `deleted_at timestamptz`. Stream queries and RLS filter `deleted_at IS NULL`; purge jobs hard-delete after the retention window. Financial (C5) and ledger rows are never soft-deleted — they are reversed |
| Versioning | Mutable collaborative rows carry `version int NOT NULL DEFAULT 1` (bumped by command handlers; optimistic concurrency via `base_version` in commands) |
| JSON | `jsonb` only for bounded, schema-validated blobs (zod in `packages/domain`); never for anything filtered by policy or stream |
| Text search | `tsvector` generated columns + `pg_trgm` GIN; embeddings `vector(1024)` (pgvector HNSW, cosine) |
| Geo | PostGIS `geography(...)` columns (Point/Polygon/MultiPolygon, SRID 4326) with GiST indexes for near-me ranking, reverse geocoding and geofence containment (§3.13) |
| Encryption | C3 secret fields: `bytea` AES-256-GCM envelope (`key_id`, nonce, ciphertext) via `packages/db/crypto`; lookups via `*_hash bytea` (HMAC-SHA256, pepper in Railway variables). Keys rotate yearly (re-encrypt job) |
| Naming | snake_case plural tables; `*_id` FKs; booleans `is_*`/`has_*`; migrations `<timestamp>_<what>.sql`, no plan/phase/feature ids |
| Privacy class | C0 public · C1 crew-visible · C2 personal · C3 sensitive (split table, owner-only, not published, not in `llm`) · C4 biometric/minors (on-device only, never stored) · C5 financial record (retained, user link anonymised on deletion) |

### 1.1 Column legend used in schema tables

| Col | Values |
|---|---|
| **Authz** (app-layer command policy, `packages/domain` policy fns) | `self` owner only · `mem` crew member · `par` trip participant (RSVP ≠ out) · `org` trip organiser · `any` authenticated · `sys` worker/system only · `adm` admin role (Better Auth admin) |
| **RLS** (backstop policy on `app_user`) | `O` `user_id = app.uid()` · `M` `app.is_crew_member(crew_id)` · `T` `app.is_trip_member(trip_id)` · `R` read-all authenticated, no write · `S` no `app_user` grant (system/API via `app_system` or SECURITY DEFINER) · `X` owner-only + excluded from every derived view |
| **Stream** | PowerSync Sync Stream name (defined in companion §4) or `—` (API/Centrifugo only) |
| **Ret** | retention; `life` = lifetime of parent; `acct` = until account purge |

---

## 2. Database roles and RLS backstop

| Role | Login | Used by | Grants |
|---|---|---|---|
| `app_owner` | yes | `drizzle-kit migrate` (pre-deploy) only | owns `public`, `app`, `llm`, `ops` |
| `app_user` | no (assumed via `SET LOCAL ROLE`) | `api` request context, `/sync/upload` | SELECT/INSERT/UPDATE on user-data tables per table below; RLS **FORCED**; no BYPASSRLS; no access to `auth`, `ops`, `pgboss` |
| `app_system` | yes (pooled) | `worker`, webhook handlers, cron | explicit grants per table; cross-user writes through SECURITY DEFINER fns; owns `pgboss` |
| `guide_reader` | no (SET LOCAL ROLE inside AI context builder) | LLM context assembly | SELECT on `llm.*` views only; zero C3/C4, zero supplier content |
| `powersync_repl` | yes (direct, not PgBouncer) | PowerSync replication | REPLICATION; SELECT on published tables only |
| `auth` | yes | Better Auth adapter | owns `auth` schema |
| `admin_reader` | yes | `apps/admin` reads via `api` admin routes | SELECT on `ops.*` + non-C3 `public`; writes only via admin commands |

**Request transaction pattern** (`packages/db/withUser.ts`):

```sql
BEGIN;
SET LOCAL ROLE app_user;
SELECT set_config('app.uid', $1, true), set_config('app.device', $2, true);
-- command handler: policy check (app layer) → writes → rt_outbox rows → pg-boss sends → cmd_results
COMMIT;
```

`withSystem(fn)` = same with `app_system` and `app.uid` unset. Works under PgBouncer transaction pooling (all settings are `LOCAL`).

**RLS helpers** (`app` schema, `STABLE SECURITY DEFINER`, `search_path` pinned):

| Function | Returns true when |
|---|---|
| `app.uid()` | `current_setting('app.uid', true)::uuid` |
| `app.is_crew_member(crew uuid)` | active `crew_members` row for `app.uid()`; also `status='former' AND keep_in_chat` for chat-only tables |
| `app.is_trip_member(trip uuid)` | caller is a crew member of the trip's crew (planning data is crew-visible, C1) |
| `app.is_trip_participant(trip uuid)` | `trip_participants.rsvp NOT IN ('out')` or organiser |
| `app.is_trip_organiser(trip uuid)` | `trip_participants.role='organiser'` |
| `app.can_see_location(share uuid)` | the share is open (a paused crew-map share is not; Help/SOS ignore pause) and the caller is its owner or a trip participant (not `out`, still in the crew); crew_map needs `trip_entitlements.boost_active`, help/sos always. `app.shared_location_fixes(share, max_rows)` is the only read path to fixes; `app.is_own_active_share(share)` gates fix inserts; `app.delete_own_visit(visit)` is the owner's delete |
| `app.budget_band(trip uuid)` | SECURITY DEFINER aggregate; returns band only when k ≥ 4 maxes (C3 rule) |
| `app.setup_member_ids(trip uuid)` (doc delta) | who takes part in setup: the trip crew's active members less anyone with RSVP `out` (a solo trip: its participants); the denominator of availability counts, budget k and must-do prompts |
| `app.my_budget_max(trip uuid)` (doc delta) | the caller's own `budget_max_private` row for the trip, nobody else's; the only read of a max through `app_user` |
| `app.recompute_availability(trip uuid)` (doc delta) | app_system only; recounts `availability_summaries` from setup members' `calendar_days` over today … +183 d |

Every user-data table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY; ALTER TABLE … FORCE ROW LEVEL SECURITY;` default-deny; policies generated with Drizzle `pgPolicy` + `pgRole` (`entities.roles` in drizzle config); helper fns + publication in custom SQL migrations. Index `crew_members(user_id, crew_id) WHERE status='active'`.

**Permission contract suite** (Vitest + Testcontainers, PR-blocking): fixtures outsider / ex-member / member / organiser / anonymous × every command × RLS × Sync Stream query × Centrifugo subscribe-proxy decision × `llm` views.

---

## 3. Schema by domain

Key columns omit `id`, `created_at`, `updated_at`, `deleted_at`, `version` unless relevant.

### 3.1 Identity and profiles

Better Auth (`auth` schema; ids = UUIDv7 via `advanced.database.generateId`):

| Table | Columns (plugins) | Notes |
|---|---|---|
| `auth.user` | id, name, email (nullable for phone-only; anonymous plugin temp email), email_verified, image, is_anonymous (anonymous), phone_number, phone_number_verified (phoneNumber), role, banned, ban_reason, ban_expires (admin) | uid is preserved on anonymous upgrade (`linkSocial`, phone `verify({updatePhoneNumber:true})`); merge only via `onLinkAccount` when the identity already exists |
| `auth.session` | id, user_id, token, expires_at (30 d sliding; console 12 h absolute), ip_address, user_agent, impersonated_by, console (true for ops console sessions, set by its Better Auth instance) | Redis secondary storage for rate limits |
| `auth.account` | id, user_id, provider_id (apple/google/phone), account_id, access/refresh/id tokens, scope | `disableImplicitLinking`; SIWA refresh token captured for revocation on deletion |
| `auth.verification` | identifier, value, expires_at | OTP 300 s |
| `auth.jwks` | id, public_key, private_key (AES-GCM), created_at | EdDSA; `/jwks` for PowerSync + Centrifugo |

Ours:

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `users` | status (anonymous/registered/closed/purged), display_name, username (citext unique), home_airport (IATA), home_country, home_currency, locale, tz, member_since, avatar_id, app_icon, purge_at | 1:1 `auth.user.id` (same uuid) | self | read: self or shares a crew (`app.shares_crew`) ; write: O | me, crew_people | C1 subset / C2 | acct |
| `user_private` | phone_e164_enc, phone_hash, email_enc, passport_no_enc, sign_in_country | uk phone_hash | self | X | — | C3 | acct |
| `user_settings` | chattiness, talk_out_loud, leave_by_through_dnd, crew_chat_mode, muted_uids (crewmates whose chat messages this user hides; `mute_member`), location_mode, email_import, price_display (home/local/both), time_format, distance_unit, app_locale (doc delta: the shipped language the app is showing, written by `set_app_locale`; `app.user_locale(uid)` resolves a person's language from it, else the newest device's tag mapped to a shipped language, else `en`, and is what guide replies, push text and guide-text translations use), hide_lockscreen_details, hide_taste_tags, hide_collection, explore_at_home (doc delta: home-set collecting opt-in, default false), active_crew_id (doc delta: the crew Home shows, set by `set_active_crew`) | pk user_id-unique | self | O | me | C2 | acct |
| `taste_profiles` | answers jsonb, tags text[], tag_sources jsonb (quiz/chips/inviter/guide), chronotype, pace, room_pref, visibility (crew/self, derived by trigger from `user_settings.hide_taste_tags`; doc delta) | uk user_id | self | read M-shared / write O | me, crew_people | C1 (disclosed) | acct |
| `dietary_profiles` | diet (none/vegetarian/vegan/pescatarian/halal/kosher), allergies text[], avoid text[], spice, accessibility_notes_enc, consent_at, visibility (self/crew_flags) | uk user_id | self | X | — | C3 | acct |
| `participant_dietary_flags` | trip_id, user_id, flags text[] (e.g. `no_peanuts`) | uk (trip_id, user_id); derived by `app.sync_dietary_flags` (profile, crew membership and trip triggers) while `visibility = 'crew_flags'` and `consent_at` is set: the diet and one `no_<allergen>` per allergy, nothing else; deleted when consent goes (doc delta) | sys | T read | trip | C1 | life |
| `passes` | status (draft/issued), number (`CP-0427` from `pass_number_seq`, reserved by `start_pass`), issued_at, cover; MRZ derived on read (doc delta) | uk user_id | self | read shares-crew / write S | me, crew_people | C1 | acct |
| `avatars` | kind (initials/critter/photo), form_id, ring, media_key, moderation_status (none/pending/approved/rejected), moderation_reason, variant_keys jsonb (doc delta) | user_id idx | self | read shares-crew; write O | me, crew_people | C1 | acct |
| `app_icon_unlocks` | icon_key, unlocked_at, source | uk (user_id, icon_key) | sys | O read | me | C2 | acct |
| `guide_skins` | trip_id?, form_id | uk (user_id, trip_id) | self | O | me | C2 | acct |
| `saved_items` | kind (place = a destination / poi = a place page's POI (doc delta) / plan/day/request: a city asked for from an empty search, `note` = the query), ref_id, list_name, note | (user_id, kind) | self | O | me | C2 | acct |
| `saved_lists` (doc delta) | user_id, name, position; `saved_items.list_name` names the list an item sits in (null = the default "Saved") | uk (user_id, name) | self | O (delete via command) | me | C2 | acct |
| `past_trips` | place_id, country, month date, source | user_id | self | O | me | C2 | acct |
| `phrase_progress` | phrase_id, practised_at, score | (user_id, phrase_id) | self | O | me | C2 | acct |
| `install_attributions` | device_id, channel, source, invite_id?, join_code?, via (referrer/paste/code/phone/clip/link)?, claimed_url?, link_kind?, claimed_at | unique device_id | sys | S | — | C2 | 180 d |
| `device_attestations` | install_id, platform (ios/android), key_id, public_key, counter, attested_at, last_assertion_at, verdict | unique install_id, unique key_id | sys | S (silent; never client-visible) | — | C2 | rolling |

### 3.2 Crews, memberships, invites

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `crews` | name (1–32 chars), art? (doc delta: crew art key), settlement_currency, member_ceiling (16), membership_epoch int, created_by | — | mem (rename), org of any trip for settings | M | crews | C1 | acct of last member + 30 d |
| `crew_members` | crew_id, user_id, role (organiser/member), colour, status (active/left/removed/former), keep_in_chat, joined_epoch, left_at, last_read_seq (highest chat seq read; only moves forward), notify_level | uk (crew_id, user_id); idx (user_id, crew_id) WHERE active | mem (self leave), org (remove) | M | crews | C1 | life |
| `invites` | crew_id, trip_id?, inviter_id, join_code_id, kind (personal/generic), seat_token_hash (SHA-256 of the ≥128-bit single-claim token; personal only), invitee_user_id?, channel, status (pending/later/declined/claimed/waitlisted/expired/revoked), waitlist_position, expires_at, claimed_by, claimed_at, nudged_at (doc delta: kind, join_code_id, revoked, nudged_at; opens moved to `invite_opens`) | uk seat_token_hash; (crew_id, status) | mem | M + inviter + in-app invitee (stream never carries seat_token_hash or nudged_at) | crew_invites | C1 (status) | 90 d after terminal |
| `invite_opens` | id (= invite id), inviter_id, open_count (bot-filtered), first_opened_at, last_opened_at (doc delta: per-invite opens are the inviter's alone, C28) | 1:1 invite | sys | O (inviter) | me | C2 | life of invite |
| `invite_prefill` | invite_id, inviter_id, name_enc, home_hint (IATA), tags (≤3, taste enum), inviter_note_enc, phone_hash (doc delta: HMAC for the phone match; the number is never stored), provenance (contacts/typed) | 1:1 invite; TTL purge | mem (inviter) | X (inviter only) | — | C3 | purge at claim/expiry + 7 d |
| `join_codes` | code (6 chars, ambiguity-safe alphabet, CSPRNG), target_kind (crew/trip/referral), target_id, crew_id? (null for referral), created_by, expires_at, max_uses, uses, status (active/revoked/expired/exhausted) | uk code WHERE active; non-members resolve via `app.lookup_join_code(code)` (live codes only, public subset) | mem | M (+ creator for referral codes; writes S) | crew_invites | C1 | 30 d after expiry |
| `referrals` | referrer_id, referee_id, code, invite_id?, via (invite/code/referral_link), status (pending/joined/qualified/void), void_reason, qualified_at, reward_kind, reward_ref (doc delta: status, via) | uk referee_id | sys | O (either party) | me | C2 | acct |
| `crew_contact_cards` | crew_id, user_id, phone_display | derived when `CONSENT(crew_phone_visible)`; deleted on revoke | sys | M | crews | C1 (consented) | life of consent |

Epochs: every join/leave/remove increments `crews.membership_epoch` in the same transaction and writes an `rt_outbox` control row → worker calls Centrifugo `unsubscribe`/`disconnect` for the removed user; PowerSync re-evaluates stream membership from replicated `crew_members`. `joined_epoch` lets handlers reject commands whose `base_epoch` predates a removal.

### 3.3 Trips, polls, plans, ChangeSets

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `trips` | crew_id, status, setup_step, phase (generated from status), destination_id?, guide_id, is_guest_guide, is_solo, start_date, end_date, tz, local_currency, seat_cap (derived 6/16), trip_length_days (doc delta: the length the setup date windows slide over; the vote's length until dates lock), plan_progress, redrafts_used, redraft_limit (derived), current_version_id, draft_version_id, reply_by, cancelled_at | (crew_id, status) | mem read; org transitions | T | crews (header), trip | C1 | acct/crew |
| `trip_participants` | trip_id, user_id, role (organiser/member), rsvp (unopened/opened/maybe/in/out/waitlisted), holds_seat (generated), waitlist_position, chosen_options jsonb, landed_at, countdown_target_at, egg_id | uk (trip_id, user_id); partial idx holds_seat | self (rsvp), org | T | trip | C1 status / C2 options | life |
| `destinations` | slug, name, country, guide_id, coverage (live/guest), colour, currency, best_months int[], tz, geo bbox, geofence geography(MultiPolygon,4326) (doc delta: seeded from Overture locality/division polygons at ingest, see §3.13 geo note), critter_set_id (the place it belongs to; one row per city of the place index is kept in step by `app.sync_place_destinations` on every content release) | uk slug | adm | R | catalog | C0 | content |
| `guides` | slug, name, colour (C5 canonical), persona_pack_version, voice_id (ElevenLabs), local_words jsonb | uk slug | adm | R | catalog | C0 | content |
| `pitches` | crew_id, trip_id?, destination_id, pitched_by, month?, sections jsonb, quote_ids uuid[], model, prompt_version, cache_key (place:month), fare_snapshot_id (fingerprint of the fares quoted; a change invalidates the cached pitch), status (pitched/on_board/queued/final/won/back_in_deck), i18n jsonb? (doc delta: translations of the headline, reasons and quote in `sections` per language, `{"<locale>": {"<field>": text}, "_src": hash of the source fields}`; written by `guide_text.translate`, read through `guideText`) | (trip_id); (crew_id, status); (crew_id, cache_key, created_at desc) | mem (sys writes) | M | trip (trip rows), crew_polls (trip_id null) | C1 | life |
| `polls` | crew_id, trip_id?, kind (destination/generic/day_option/changeset_approval/decision/mvp), stage (board/final; destination only), status (open/closed/cancelled, guard trigger `app.polls_state_guard`), question, created_by, eligible_voter_ids uuid[] (snapshot), decider_policy? (organiser/any_affected/majority_of_affected/threshold_n; null = plurality), threshold, closes_at (board: when it advances; otherwise the deadline), allow_change, tie_rule (cheaper_for_majority_origin/organiser_pick/earliest_to_count), winner_option_id, result jsonb (tallies, tie note, final `tie_preview`), close_reason (all_voted/deadline/manual/decider), closed_at, stage_changed_at, version | (trip_id, status); (closes_at) WHERE open; uk (crew_id) WHERE destination AND open | mem create (kind-specific), org close; sys writes | M / T (`app.can_read_poll_scope`) | trip, crew_polls | C1 | life |
| `poll_options` | poll_id, crew_id + trip_id (copied from the poll by trigger), kind (destination/poi/changeset/text/date_window), ref_id, label, frozen_quote_id, pitch_id, proposed_by, position, eliminated_at (knocked out of the board) | cascade; uk (poll_id, ref_id) | mem (sys writes) | M / T via scope | trip, crew_polls | C1 | life |
| `ballots` | poll_id, option_id (FK (option_id, poll_id)), crew_id + trip_id (copied from the poll), user_id, source (app/widget/notification/la), op_id, cast_at | uk (poll_id, user_id) | self, eligible voter, poll open and before its deadline (backstop `app.can_vote`; changes also `app.can_change_ballot`; else `rejected: VOTE_CLOSED`) | M / T via scope | trip, crew_polls | C1 | life |
| `poll_reveals` | poll_id, user_id, seen_at (null = reveal still to show; filed for every voter when a destination poll closes) | uk | self | O | me | C2 | life |
| `date_window_options` | trip_id, position, kind (best/partial/full_crew/ask_first), start_date, end_date, free_count, member_count, missing_member_ids, missed_must_do_ids, ask_user_id? (only when that member marked the blocking days askable), ask_status? (asked/freed/not_movable/timed_out: the only part of a private ask the crew sees), price_delta_minor + currency, season_score, reason (template key), is_pick (doc delta: kind, position, member_count, missed_must_do_ids, ask_user_id, ask_status, currency, season_score) | uk (trip_id, position) | sys | T | trip | C1 | life |
| `availability_summaries` | trip_id, date, free_count, maybe_count, busy_count, unknown_count, member_count, computed_at (doc delta: maybe_count, member_count) | uk (trip_id, date) | sys (`app.recompute_availability`, counting setup members only: `app.setup_member_ids` = active crew members less anyone who said no) | T | trip | C1 | life |
| `itinerary_versions` | trip_id, parent_id, visibility (organiser/crew), status (drafting/draft/proposed/current/superseded), cost_pp_minor, currency, created_by_job_id (uk when set: one version per job), metrics jsonb (doc delta: planner cost/pace/transit totals, `draftMetricsSchema`), coverage jsonb (doc delta: must-dos made, flags, closures with sources, stays, display fields of every named place, setup fingerprint; `draftCoverageSchema`) | (trip_id, status) | org | T + visibility: `organiser` rows only for `app.is_trip_organiser` | trip (crew rows), trip_draft (organiser) | C1 / C2 (draft) | life |
| `plan_days` | version_id, trip_id, day_no, date, theme, weather_ref, i18n jsonb? (doc delta: translations of the theme per language, `{"<locale>": {"<field>": text}, "_src": hash of the source fields}`; written by `guide_text.translate`, read through `guideText`) | uk (version_id, day_no) | org / via ChangeSet | as version | trip, trip_draft | C1 | life |
| `plan_items` | version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, lane, attendee_ids uuid[], poi_id, provider_id, booking_id, must_do_id, category, cost_model (per_person/group/unit), amount_minor, currency, status (confirmed/proposed/voting), flexibility, is_outdoor, created_by_kind (user/guide), notes, locked_reason (doc delta: booking/must_do/user; a redraft keeps the item), i18n jsonb? (doc delta: translations of the note of a guide-written item per language, `{"<locale>": {"<field>": text}, "_src": hash of the source fields}`; written by `guide_text.translate`, read through `guideText`) | (version_id, day_id); (trip_id, stable_id) | via ChangeSet only (guide never writes directly) | as version | trip, trip_draft | C1 | life |
| `change_sets` | trip_id, base_version_id, trigger (weather/manual/dropout/delay/chat/redraft/swap), scope (group/personal), author_kind (user/guide), author_id, status (draft/proposed/voting/approved/applied/rejected/reverted/stale), poll_id?, cost_delta_minor, ops jsonb (validated `packages/planner` ChangeSet ops: op, target, before, after, reason, affected_user_ids, booking_impact), result_version_id | (trip_id, status) | mem propose; decider per poll policy (C41); apply = sys after approval | T (organiser-only when base is a private draft) | trip, trip_draft | C1 | life |
| `guide_actions` | trip_id, change_set_id?, kind, target_provider_id, channel, status (planned/needs_approval/running/done/failed/undone), reversible, compensates_id, cost_delta_minor, audit jsonb, inverse jsonb? (registered inverse of a reversible action), undo_until? (end of the undo window), disruption_id? (groups "undo everything" for one disruption; FK once `disruptions` exists) | trip_id | sys (after approval) | T | trip | C1 | life |
| `guide_offers` | trip_id, message_id, kind, slots_total, slots_taken, expires_at, target_ref, status (open/full/expired/cancelled) | trip_id | sys create; mem claim | T | trip | C1 | life |
| `guide_offer_claims` | offer_id, user_id | uk | self | T | trip | C1 | life |
| `comments` | trip_id, anchor_kind (item/option/day/poi_in_option; doc delta), anchor_id (text: an item's stable_id, a poll option id, a day number, or `option:poi`), author_id, body (≤1000), edited_at, deleted_at (doc delta: delete tombstones, body cleared) | (trip_id, anchor_kind, anchor_id) | mem; author edits/tombstones | T | trip | C1 | life |
| `comment_plus_ones` | id, comment_id, trip_id (doc delta: copied from the comment by trigger), user_id | uk (comment_id, user_id) | self add; un-+1 is a server delete | T | trip | C1 | life |
| `personal_plan_ops` (doc delta) | trip_id, user_id, change_set_id?, base_version_id, ops jsonb (accepted ChangeSet ops with `before` snapshots), status (active/dropped) | (trip_id, user_id); uk (change_set_id, user_id) | self (via `apply_changeset{scope: personal}` / `resolve_overlay_clash`) | O; guide only through `llm.my_personal_plan_ops` (own active rows, trip in context) | trip_me | C2 | life |
| `calendar_feed_tokens` (doc delta) | trip_id, user_id, token_hash bytea (SHA-256 of the one-time-shown secret), revoked_at | uk token_hash; (trip_id, user_id) live | sys (`create_calendar_feed` / `revoke_calendar_feed`, feed route) | S | — | C3 | until revoked / account |
| `swipe_sessions` | trip_id, destination_id, started_by, status (building/live/ended), deck jsonb (ranked cards: poi_id, rank, score, reasons, note), match_rule (min(2, participants)), ended_at (doc delta: columns) | one open session per trip (partial uk) | par | T (system writes) | trip | C1 | life |
| `swipe_votes` | session_id, trip_id, user_id, poi_id, verdict (yes/no/super) | uk (session_id, user_id, poi_id) | par (commands) | O read, system writes; never published, no powersync_repl/guide_reader grant | — | C2 | life |
| `swipe_yes_votes` (doc delta) | session_id, trip_id, user_id, poi_id, super: the yes-only mirror of `swipe_votes`, kept by trigger (a flip to no or an undo deletes the row) | uk (session_id, user_id, poi_id) | sys (trigger) | T | trip | C1 | life |
| `swipe_matches` | session_id, trip_id, poi_id, user_ids, change_set_id (the organiser's suggestion), day_no (doc delta: replaces slotted_item_id) | uk (session_id, poi_id) | sys (vote tx) | T | trip | C1 | life |
| `activity_events` | trip_id, crew_id, actor_kind (user/guide/system), actor_id, verb, object_kind, object_id, text, at | (trip_id, at desc) append-only | sys | T | trip | C1 | life |
| `agent_jobs` | trip_id, user_id, kind (draft/redraft/merge/proposal/disruption/recap/quests/pitch/briefing/content), status (queued/running/succeeded/failed/cancelled), steps jsonb (progress), partial jsonb, input_hash, base_version_id, result_ref, model, tokens_in, tokens_out, cost_micros, pgboss_job_id | (trip_id, kind, status) | org / self | T (organiser-only kinds filtered) | trip_draft / me | C2 | 90 d (row); result kept |

### 3.4 Setup: availability, budgets, rooms, must-dos

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `calendar_sources` | user_id, kind (device/oauth_google/oauth_microsoft/manual), oauth_tokens_enc (never selectable by app_user), token_expires_at, consent_tentative (doc delta: tentative events shared as `maybe`, opt-in), last_sync_at, status (active/error/disconnected) | uk (user_id, kind) | self | X | — | C3 | until disconnected |
| `calendar_days` | user_id, trip_id?, date, state (free/maybe/busy/unknown; doc delta: `maybe` replaces `tentative`, matching `set_availability`), source (manual/device_cal/oauth), guide_may_ask (only on `maybe` days) | uk (user_id, date) | self | X | — | C3 | trip end + 30 d |
| `availability_asks` | trip_id, target_user_id, asked_by_kind (guide), requested_by, option_id?, block_start, block_end, status (asked/replied/timed_out), intent (freed/not_movable), expires_at (48 h), replied_at (doc delta: block range, requested_by, option_id, timed_out, expires_at) | trip_id | sys / target self | X (target only) | — | C3 | trip end + 30 d |
| `budget_max_private` | trip_id, user_id, amount_minor, currency, amount_trip_minor + trip_currency (doc delta: converted server-side at submit through the FX snapshot), fx_snapshot_id, source (entered/profile_default) | uk (trip_id, user_id) | self write-only (read returns "set / not set" only) | X (INSERT/UPDATE own; SELECT denied even to owner via `app_user`; the owner's own device reads it through SECURITY DEFINER `app.my_budget_max(trip)` for `GET /v1/me/private/budget_max`) | — | C3 | trip archived + 30 d |
| `budget_defaults_private` | user_id, amount_minor, currency | uk user_id | self | X | — | C3 | acct |
| `trip_budget_aggregates` | trip_id, currency, maxes_count, member_count, band_low_minor, band_high_minor, step_minor, track_high_minor (the dots' track end: the highest max rounded up to ten steps), bucketed_dots jsonb (positions in [0, 1] standing half a minor unit off any amount), under_all_ok bool, infeasible bool, computed_at (doc delta: member_count, step_minor, infeasible; band, step, dots, under-all and infeasible only from 4 maxes, enforced by a CHECK, and a guard trigger refuses a band whose upper edge reaches the lowest current max) | uk trip_id; written by the `setup.budget_recompute` job through `@cp/cost-engine` `computeBudgetBand` (reads `budget_max_private` as app_system; band logic lives in one TS function); `maxes_count` also moves at submit | sys | T | trip | C1 (aggregate) | life |
| `budget_plans` | trip_id, target_minor, currency, band_low_minor/band_high_minor, breakdown jsonb (by category), stay_mix jsonb, planned_by_day jsonb, quote_version, is_stale (doc delta: dates moved since pricing), locked_at, locked_by, version | uk trip_id | org | T | trip | C1 | life |
| `room_plans` | trip_id, stay_option_id, rooms jsonb [{stay_key, stay_type, stay_nights, key, capacity, nightly_minor (per room per night), label}], currency, nights, stay_booking_id?, free_cancel_until, same_pairs_all_stays, is_stale, locked_at, locked_by, version (doc delta: stay_option_id, stay_key per room, currency, nights, same_pairs_all_stays, is_stale, version for `base_version`) | uk trip_id | org | T | trip | C1 | life |
| `room_assignments` | trip_id, stay_key, room_key, user_id, trait_label (light_sleepers/early_risers/night_owls/couple) | uk (trip_id, stay_key, user_id) (doc delta: stay_key) | org; self swap request | T | trip | C1 | life |
| `must_dos` | trip_id, owner_id, title, poi_id?, freeform, priority (0 = the member's one primary), co_owner_ids (duplicates merged), fit_status (fits/tight/clash/unknown; C44 no day numbers pre-draft), fit_note, target_day?, external_action (lottery/book_ahead/none), external_deadline, external_url, fit_checked_at, deleted_at, version (doc delta: priority, co_owner_ids, fit_note, external_url, fit_checked_at) | trip_id; uk (trip_id, owner_id) WHERE primary | self (owner writes title/place/priority; fit columns sys) | T | trip | C1 | life |
| `room_prefs` (doc delta) | trip_id, user_id, chips text[] (early_bird/night_owl/light_sleeper/snorer/dont_care), partner_id? (shares a bed) | uk (trip_id, user_id) | self | O | me | C2 | life |
| `price_quotes` | trip_id?, kind (flight/stay/activity/transfer), origin, destination_id, dates daterange, amount_minor, currency, source (travelpayouts/viator/user/estimate), fetched_at, frozen_at, version | (trip_id, kind) | sys | T or R (trip null) | trip | C1 | life |
| `cost_components` | trip_id, calc_version, component_key, kind, is_shared, unit (room/person/group), origin, member_ids, amount_minor (null = no price yet), currency, source, quote_id, seen_at, frozen_at | uk (trip_id, component_key); written by `cost.recompute` | sys | T | trip | C1 | life |
| `share_calcs` | trip_id, user_id, components jsonb, personal_option_deltas jsonb, total_minor, currency, version, fx_snapshot_id, is_missing, is_estimated_origin, is_stale | uk (trip_id, user_id, version) | sys | T (own row full; others see total only via `trip_share_totals`) | trip (own rows) | C1 total / C2 options | life |
| `trip_share_totals` | trip_id, user_id, total_minor, currency, calc_version, is_missing | uk (trip_id, user_id); written by `cost.recompute` (a table, not a view: PowerSync logical replication cannot carry views) | sys | T | trip | C1 | life |
| `destination_cost_indices` | destination_id, stay_type, nightly_minor_low/high (per person per night), food_pp_day_minor, fun_pp_day_minor, currency, source, source_url, sourced_on, reviewed_at | uk (destination_id, stay_type) | sys (editorial) | R (reviewed rows only) | catalog | C0 | life |

### 3.5 Proposals, RSVP, waitlist

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `proposals` | trip_id, version_id, format, show_cost, reply_by, sent_at, locked_at, stay_free_cancel_until (replaces "hold until"; decision 10) | uk trip_id (current) | org | T | trip | C1 | life |
| `proposal_versions` | proposal_id, recipient_id, slides jsonb, poster_key, postcard_key, highlights jsonb, savings_minor, lead_item_id, agent_job_id | uk (proposal_id, recipient_id) | sys | T: recipient sees own; org sees all | trip | C1 | life |
| `proposal_reactions` | proposal_id, user_id, kind, at | (proposal_id) | self | T | trip | C1 | life |
| `hype_aggregates` | proposal_id, hype_pct, reacted_count | uk | sys | T | trip | C1 | life |
| `engagement_events` | proposal_id, user_id, kind (opened/viewed/trailer_watched), local_hour, at | (proposal_id, user_id) | sys | S (never readable by peers or organiser; C28) | — | C2 | 90 d |
| `seat_waitlist_offers` | trip_id, user_id, invite_id?, offered_at, expires_at, status (offered/accepted/declined/expired) | (trip_id, status) | sys offer; self accept | T | trip | C1 | life |
| `rsvp_suggestions` (doc delta) | proposal_id, trip_id, kind (resend/offer/nudge), target_uid?, payload jsonb, copy, status (open/executed/dismissed/expired), dedupe_key | uk (proposal_id, dedupe_key) | sys; organiser executes/dismisses | T (organisers only) | trip_draft | C1 | life |
| `proposal_followups` (doc delta) | proposal_id, trip_id, user_id, kind (followup/resend), due_at, lead_item_id?, status (scheduled/delivered/cancelled), delivered_at | uk (proposal_id, user_id, kind) WHERE scheduled | sys | O (own `followup` rows) | — | C2 | life |
| `trip_dropouts` (doc delta) | trip_id, user_id, ops jsonb, members jsonb (before/after per member), cost_delta_minor, resolved_at, resolved_by | uk (trip_id, user_id) | sys build; organiser resolves | T | trip | C1 | life |

`proposals` adds `created_by, personal, options, status (building/sent/locked/superseded), reminded_at` (doc delta); `proposal_versions` adds `trip_id, status, shared, poster, postcard, savings, share_minor, currency, fallback_note, attempts`; `proposal_reactions`, `hype_aggregates` and `engagement_events` carry `trip_id` for policies and streams. `engagement_events` has no app_user grant: `app.record_engagement` writes the caller's own. An unattributed objection change set goes through `app.write_unattributed_changeset` (crew ≥ 4). Contracts: [api-contracts-proposal.md](./api-contracts-proposal.md).

RSVP and waitlist live on `trip_participants` (rsvp, waitlist_position) and `invites` (status `waitlisted`). `seatCap(t)` counts `holds_seat`. A seat freed by `out` produces an offer, never an auto-join.

### 3.6 Chat and guide threads

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `messages` | id (= the sender's `send_message` op_id), crew_id, trip_id?, seq bigint (per crew, gap-free, assigned by insert trigger from `crew_chat_counters`), sender_kind (user/guide/system), sender_id, guide_id, type (text/photo/voice/system/poll/expense/guide_offer/changeset/boost_card/meetup/proposal/supplier_order), body ≤4000, ref_kind, ref_id (system rows: member_joined/member_left/crew_renamed + member), reply_to_id, mentions uuid[], mentions_guide, attachments jsonb ([{media_id, media_key, kind photo\|voice, w, h, duration_ms, derived_key, peaks}]), edited_at, deleted_at (tombstone), hidden_at (moderation) | uk (crew_id, seq); (crew_id, seq desc); gin (attachments) | mem write own (active); former+keep_in_chat read; hidden rows invisible | M (chat variant) | crew_chat | C1 | acct/crew; soft delete |
| `message_reactions` | message_id, crew_id (copied from the message), user_id, emoji | uk (message_id, user_id, emoji); (message_id) | self insert; take back via `app.remove_message_reaction` | M | crew_chat | C1 | life |
| `crew_chat_counters` | crew_id pk, last_seq | row-locked by the message insert trigger | sys | S | — | C4 | life |
| `guide_threads` | user_id, trip_id?, guide_id, mode (private/group; doc delta) | (user_id, trip_id) | self | O | guide_chat | C2 | acct |
| `guide_messages` | thread_id, role (user/guide/tool), content, attachments jsonb (photo keys, OCR box ids), voice, meter_counted bool, trace_id | (thread_id, created_at) | self | O | guide_chat | C2 | 365 d then summarise-and-drop |
| `guide_crew_turns` (doc delta) | trip_id, thread_id, turn_no, role (user/guide), participant_id, content, thread_mode (private/group), tool_calls int, metadata jsonb | (thread_id, turn_no) | sys | T (via trip crew chat) | trip | C4 | 30 d |
| `private_guide_threads` | trip_id, proposal_id, owner_id, reason (cost/dates/plan/other), body_enc, offered_options jsonb, chosen_option, follow_up_at, anonymous_suggestion_id (the only link to the crew-visible line; doc delta) | (trip_id, owner_id) | self; organiser excluded | X | — (API + `user:#uid` channel) | C3 | trip archived + 30 d |
| `anonymous_suggestions` | trip_id, proposal_id, topic, text ("Someone asked about cost"); no source column (doc delta: the private thread holds the link) | trip_id; written only by `app.write_anonymous_suggestion` when crew ≥ 4 | sys | T | trip | C1 | life |
| `queued_guide_questions` | user_id, thread_id, trip_id, text, queued_at, answer_after, status (queued/answered/cancelled), answer_message_id | (answer_after) WHERE queued | self | O | guide_chat | C2 | 30 d |
| `custom_phrase_cards` (doc delta) | user_id?, trip_id, phrase_id?, audio_key, duration_ms, created_at | (trip_id, created_at) | mem (add/delete); self create personal | trip (personal rows owner-only) | C1 | trip archived + 1 y |
| `phrase_cards` | destination_id, lang, text, gloss, audio_key, contexts text[] | content | adm | R | catalog | C0 | content |

### 3.7 Bookings, imports, suppliers, insurance

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `bookings` | trip_id, owner_id, type (flight/stay/activity/boat/transfer/rail/car/other; doc delta: boat, car), title, starts_at, ends_at, tz, location (doc delta), traveller_ids uuid[], price_minor, currency, paid_by, source (forward/mailbox/scan/paste/viator/manual), supplier (agoda/trip_com/booking/viator/klook/gyg/airline/other; doc delta: airline), supplier_ref (confirmation code), free_cancel_until, cancel_policy_text (verbatim from the user's own confirmation), status (booked/cancelled/pending_operator), visibility (crew/personal), flight_crew_visible (doc delta: a personal flight's number and times reach the crew unless opted out), details jsonb (per-kind fields: room, meeting point, seat, baggage; doc delta), barcode_payload_enc?, barcode_format? (pdf417/aztec/qr/code128; doc delta), supplier_order_id?, deleted_at, version | (trip_id, starts_at); `expenses.booking_id` FK | self create; creator or organiser edit/delete | T + visibility (personal = owner; deleted hidden; barcode column not granted to app_user) | trip (explicit columns, never the barcode) | C1; barcode C2 | trip archived + 2 y |
| `booking_attachments` | booking_id, trip_id, owner_id and crew_visible (copied from the booking; doc delta), media_key (`booking_doc`), kind (pdf/voucher/image/boarding_pass), sha256 | cascade; uk (booking_id, media_key) | self | owner, or crew when crew_visible | trip | C2 | as booking |
| `flight_segments` | booking_id, trip_id, owner_id and crew_visible (copied; doc delta), segment_no, carrier, flight_no, dep_airport, arr_airport, sched_dep_at, sched_arr_at, est_dep_at, est_arr_at, act_dep_at, act_arr_at, boarding_at, boarding_estimated (dep − 40 min when the airline gave none), gate, terminal, status (scheduled/on_time/delayed/boarding/departed/landed/cancelled/diverted), delay_min, status_source (aerodatabox/flightaware/manual/schedule), status_at, la_phase, version (doc delta: seat and baggage live in `bookings.details`) | (carrier, flight_no, sched_dep_at); uk (booking_id, segment_no) | sys status; self edit | owner, or T when crew_visible | trip | C1 | as booking |
| `flight_watches` | flight_segment_id, provider (flightaware/aerodatabox), provider_alert_id, provider_flight_id, active_until, ended_at | uk (flight_segment_id, provider); index (provider, provider_alert_id) (doc delta: one alert serves every traveller on the flight) | sys | S | — | C2 | until landed + 1 d |
| `import_candidates` | user_id, crew_id?, trip_id?, source (forward/mailbox/scan/paste), extracted jsonb, confidence, dedupe_key (scope `crew:`/`user:` + supplier + code or title+start), status (parsing/pending/accepted/rejected/duplicate/failed; doc delta), crew_visible, needs_confirm (injection flag), failure_reason, duplicate_of_id, booking_id?, inbound_email_id?, resolved_by, resolved_at | uk dedupe_key (doc delta: global, scope inside the key) | self; crew resolves crew-visible | owner, or crew via `app.can_see_candidate` (mailbox finds need the owner's `mailbox_surfacing` consent) | me, crews (crew-visible) | C2 | 30 d after decision |
| `inbound_emails` | crew_id?, user_id?, address_id, sender_hash, message_id_hash, r2_key (raw, 7 d), size_bytes, dkim, spf, status (accepted/quarantined/parsed/failed), quarantine_reason (unknown_sender/auth_failed), raw_purged_at | (address_id, created_at); uk (address_id, message_id_hash) | sys | S | — | C3 raw / C2 meta | raw 7 d; meta 90 d |
| `crew_inbound_addresses` | crew_id, local_part (unique; the crew name as a slug, issued on crew create by trigger), status (active/retired), rotated_at (doc delta: linked senders moved to `inbound_sender_links`) | uk local_part; one active per crew | org rotate | M (active address only) | crews | C2 | life |
| `inbound_sender_links` (doc delta) | crew_id, user_id?, sender_hash, code_hash, code_expires_at, attempts, verified_at | uk (crew_id, sender_hash) | sys (the member proves the sender with the reply code) | S | — | C3 | acct |
| `mailbox_connections` | user_id, provider (gmail/microsoft; doc delta), scopes, refresh_token_enc, last_history_id (Gmail historyId / Graph delta link), status (active/paused/revoked/error), last_scan_at, last_error | uk (user_id, provider) | self | X (owner reads status; token and cursor never granted to app_user) | — | C3 | until disconnected; tokens revoked |
| `supplier_orders` | trip_id, buyer_id, supplier (viator; agoda/klook/trip_com behind flags), cart_ref, status (§ companion state machine), pricing_status (HOLDING/…), availability_status (HOLDING/HOLD_NOT_PROVIDED), hold_valid_until, total_minor, currency, supplier_booking_ref, voucher_booking_id, last_polled_at, cancel_quote jsonb | (status, last_polled_at) | self (buyer) | T read; O write | trip | C1 (status) / C5 amounts | 7 y (C5) |
| `supplier_order_items` | order_id, product_code, product_option_code, start_at, traveller_count, price_minor, participant_ids | cascade | self | T | trip | C1 | as order |
| `affiliate_clicks` | user_id, trip_id?, partner (agoda/trip_com/booking_cj/klook/gyg/kiwitaxi/gettransfer/grab/travelpayouts), sub_id (unique, opaque), target_kind, target_ref, clicked_at | uk sub_id | any | S (insert via API) | — | C2 | 13 months |
| `affiliate_conversions` | partner, sub_id, click_id?, status, commission_minor, currency, reported_at | uk (partner, external_id) | sys | S | — | C5 | 7 y |
| `ride_quotes` | trip_id, user_id, provider (grab/gojek), from_poi, to_poi, fare_low_minor, fare_high_minor, currency, eta_min, fetched_at | (trip_id, fetched_at) | self | T | trip | C1 | 7 d |
| `rides` | trip_id, leg_ref, provider_id?, mode (grab_link/transfer_booking/guide_driver), booking_id?, eta_text, status, price_minor, currency, expense_id? | trip_id | mem | T | trip | C1 | life |
| `providers` | trip_id, kind (driver/stay/restaurant/spa/clinic/tour_guide/boat), name, contact_enc (phone/whatsapp/email), vehicle jsonb, policies | trip_id | mem (added by user/ops) | T | trip (contact decrypted into `provider_contacts_offline` view for participants) | C1 | trip archived + 1 y |
| `insurance_policies` | user_id, trip_id?, provider, policy_no_enc, assistance_phone_enc, doc_media_key, share_with_clinic_consent_id?, deleted_at | user_id | self | X (owner reads provider and document key; sealed columns never granted) | — (owner offline cache via API) | C3 | acct |

Supplier content (descriptions, reviews, photos) is never stored: only ids, prices at time of display, status, and parsed user-owned confirmation fields.

### 3.8 Money

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `fx_snapshots` | base, quote, rate numeric(20,10), as_of date, source (frankfurter) | uk (base, quote, as_of, source) | sys | R | catalog (trip currencies) | C0 | 5 y |
| `expenses` | trip_id, crew_id, payer_id, amount_minor, currency, fx_snapshot_id (required when currency ≠ crew_currency; the snapshot's run (as_of, source) supplies cross rates), crew_amount_minor, crew_currency, split_mode (equal/weights/fixed/items), category (stays/food/transit/fun/other), description, merchant, local_date, trip_day, spent_at, poi_id?, booking_id?, ride_id?, boost_id?, receipt_id?, source (manual/receipt/booking/boost/ride), created_by, deleted_at/deleted_by (delete = hide + reverse), version (doc delta) | (trip_id, local_date) | par adds; edit/delete = creator, payer or organiser | T (+ payer); writes as app_system inside commands | trip (live rows) | C1 | trip + 7 y (C5 for boost IOUs) |
| `expense_shares` | expense_id, trip_id (copied), user_id, weight, fixed_minor, computed_minor (expense currency), crew_computed_minor, excluded_reason (doc delta) | uk (expense_id, user_id); cascade | as expense | T (+ own) | trip | C1 | as expense |
| `expense_edits` | expense_id, trip_id, editor_id, kind (created/edited/deleted), before jsonb, after jsonb, at (doc delta) | append-only (trigger: every role; only `app.pseudonymise_user` may swap editor_id) | sys | T (+ own) | trip | C1 | as expense |
| `receipts` | user_id, trip_id, crew_id, expense_id?, media_key (private), status (queued/parsed/partial/failed/committed), quality_issue (crumpled/blurry/glare/cut_off), ocr_source (device `l{n}` / server `s{n}`), ocr_lines jsonb (line id → text/box), parsed jsonb (validated lines, total, merchant), suggestions jsonb, failure_reason, parsed_at (doc delta) | user_id, trip_id | self | O; the trip's crew once committed | me | C2 | trip + 1 y |
| `ledger_entries` | crew_id, trip_id?, debtor_id, creditor_id, amount_minor (>0), currency (crew settlement currency), source_kind (expense/payment/boost_iou/adjustment/reversal), source_id, reverses_id? (unique: reversed once) | (crew_id, debtor_id, creditor_id); append-only for every role (trigger refuses UPDATE/DELETE/TRUNCATE; `app.pseudonymise_user(uid)`, app_system only, swaps debtor/creditor for a tombstone user on erasure and changes nothing else; it also rewrites expense_shares, expense_edits, expenses and payments; doc delta) | sys (written by expense/payment/boost commands) | M (+ rows naming the caller) | crews | C1 / C5 | 7 y |
| `payments` | crew_id, trip_id?, from_id, to_id, amount_minor, currency, method (bank/paynow/promptpay/vietqr/duitnow/wise/cash/other), status (pending/requested/marked_paid/confirmed/disputed/cancelled; doc delta: cancelled = re-issued after a recompute), requested_at, last_nudged_at, marked_at, confirmed_at, auto_confirmed, disputed_at, dispute_note, reissued_from_id, created_by, version | (crew_id, status) | from marks paid; to requests, confirms, disputes | M (+ rows naming the caller) | crews | C1 | 7 y |
| `payout_methods` | user_id, kind (bank/paynow/promptpay/vietqr/duitnow/wise_link/cash), country, label, details_enc (AES-GCM envelope; null for cash), deleted_at (doc delta) | uk (user_id, kind) live | self; reveal to payer of an open payment via `app.reveal_payout(payment_id)`, audited in `ops.reveal_audit` (doc delta) | X | — | C3 | acct |
| `member_balances` (view) | crew_id, user_id, net_minor | over `ledger_entries` | — | M | computed on client from ledger_entries | C1 | — |

No in-app money movement (C24). Boost split = IOU `ledger_entries(source_kind='boost_iou')` only. `ops.reveal_audit` (kind, subject_id, owner_id, viewer_id, at; RLS S) records every disclosure of a C3 value to someone other than its owner (doc delta).

### 3.9 Critters

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `critter_sets` | code, name, country, rank, set_group (0–3), tz, currency, languages, coverage, guide_slug, destination_id, hero_critter_key, month_hints jsonb, release_id — the 61-place destination index (doc delta) | — | adm | R (live release) | catalog | C0 | content |
| `critters` | key (`cp-###`), set_id, no, city, species, art_params jsonb, canonical_seed, note, release_id — no name columns: names live in `critter_names` and reach a user through their own `collection_entries.critter_name`/`form_name` once found (`app.set_collected_name`) (doc delta) | set_id | adm | R (live release) | catalog | C0 | content |
| `critter_forms` | critter_id, rarity (common/rare/epic/legendary), name, palette jsonb (f/dk/bl + optional accent/leaf/beak2/stripe/eye/pupil/ink), pose (idle/wave/cheer/think/point/sleep/crack/tilt/hop), edge (none/epic/legendary), note, requirement_copy, xp — palette/pose/edge validated by `@cp/critter-art`'s `paletteSchema`/`poseSchema`/`edgeStyleSchema` | 4 per critter | adm | R | catalog | C0 | content |
| `spawn_rules` | form_id, kind (presence/any_of/set_count/window/co_presence), poi_ids uuid[], n, geofences jsonb, dwell_s, hold_ms, windows jsonb (incl. solar after_dark/by_sunrise, legendary windows), min_members, destination_id | (destination_id) | adm | R | trip_pack | C0 | content |
| `eggs` | user_id, trip_id, granted_at, hatched_at, trigger (landed/arrived/manual), form_id (the destination set's starter: its hero critter's common form, else the lowest-numbered critter's; an unhatched egg follows the current starter; doc delta) — granted by `app.grant_egg`, hatched once by `app.hatch_egg` | uk (user_id, trip_id); `trip_participants.egg_id` FK | sys | O read; T read (hatch status on the trip hub) | me, trip | C1 | acct |
| `encounters` | id (client UUIDv7), user_id, trip_id (null only for a home-set encounter), spawn_rule_id, form_id, poi_id, state (accruing/befriended/wandered_off/abandoned), dwell_s, started_at, ready_at, resolved_at, offline bool, verification (null until befriended; pending/verified/revoked), verified_at — evidence moved to `encounter_evidence` (doc delta) | (user_id, trip_id); one active per user | self insert (OW) → server verifies | O | me | C1 | acct |
| `encounter_evidence` (doc delta) | encounter_id pk, user_id, evidence jsonb (dwell aggregates, samples hash, mock flags, device clock), attestation jsonb, skew_ms, score jsonb, received_at, expires_at | cascade | sys | X (no app_user, guide_reader or admin_reader grant; never published) | — | C3 | 30 d |
| `encounter_samples` | encounter_id, user_id, at, distance_band (0_10/10_25/25_50/50_plus), accuracy_m, speed_mps — no lat/lng/geometry column (doc delta) | cascade; uk (encounter_id, at) | sys | X | — | C3 | 7 d |
| `collection_entries` | user_id, form_id, critter_id, found_at, poi_id, trip_id, source (hatch/encounter/quest/grant), encounter_id, verification (pending/verified), critter_name, form_name (set only once verified), announced_at (set by `reward.fanout`) | uk (user_id, form_id) | sys (pending at befriend, verified by `critter.verify`) | O | me | C1 | acct |
| `crew_collection_counts` (doc delta: a table, not a view) | crew_id, user_id, critters, forms, updated_at | uk (crew_id, user_id); kept by `app.refresh_crew_collection_counts` (triggers on finds, `hide_collection`, membership) | sys | M read; no rows for a member with hide_collection | crew_people | C1 | acct |
| `guide_skins` (doc delta: created here) | user_id, guide_id, form_id (an owned form) | uk (user_id, guide_id) | self via `set_guide_skin` | O | me | C1 | acct |
| `stickers` | user_id?, crew_id?, trip_id, kind (settled/crew_level/special), level (crew_level only; doc delta), granted_at | not in dex (C38); uk (user_id, trip_id) for settled; uk (crew_id, level) for crew_level (a crew-owned row, user_id null, granted by `app.grant_xp`); created by the money phase, critters extend `kind` (doc delta) | sys | O / M (crew-wide rows) | me, crews | C1 | acct |
| `quests` | trip_id, local_date, slot (0–3), template, params jsonb, metric, target, reward jsonb `{xp, sticker, form_id}` (set by the validator), title, body (doc delta), scope (crew/optional), status (offered/active/completed/failed/expired), source (guide/fallback), starts_at, ends_at (the template's deadline or the day's end), completed_at, reveal_at, i18n jsonb? (doc delta: translations of the title and body per language, `{"<locale>": {"<field>": text}, "_src": hash of the source fields}`; written by `guide_text.translate`, read through `guideText`) | uk (trip_id, local_date, slot) | sys generate (`quests.generate`); mem sign up | T | trip | C1 | life |
| `quest_signups` | quest_id, trip_id (doc delta, for the stream), user_id | uk (quest_id, user_id) | self | T | trip | C1 | life |
| `quest_progress` | quest_id, trip_id (doc delta), value, counted text[] (the distinct places, travellers or expenses counted; doc delta), source_event_ids uuid[], updated_at | uk quest_id | sys | T | trip | C1 | life |
| `xp_ledger` | user_id? (null on the crew row), crew_id?, trip_id?, amount, source_kind (quest/form/visit/settle), source_id, granted_at | append-only (trigger; only an account merge re-points `user_id`); uk (source_kind, source_id) for crew rows, (source_kind, source_id, user_id) for member rows; written by `app.grant_xp` | sys | O / M | me, crews | C1 | acct |
| `crew_xp` (doc delta: a table, not a view) | crew_id, xp, level, updated_at | uk crew_id; moved by `app.grant_xp` in the same transaction as each crew ledger row; level curve `app.crew_level` = `packages/domain/src/quests/levels.ts` | sys | M | crews | C1 | acct |
| `visits` | id (client UUIDv7), user_id, trip_id, poi_id, arrived_at, left_at, source (geofence/expense/manual), detection_version smallint, expires_at (set to archive + 30 d by `visits.ttl`) | (user_id, trip_id) | self (opt-in `CONSENT(visit_detection)`) | X | — | C3 | TTL: trip archived + 30 d (outcomes kept as quest/award results) |
| `reminders` | user_id, target_kind (form_window/quiet_window/legendary/must_do; doc delta: must_do for a tracked lottery or book-ahead), target_id, fire_at, condition jsonb, status | (fire_at) WHERE pending | self | O | me | C2 | 30 d after fire |

### 3.10 Recap, stamps, album, postcards

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `recaps` | trip_id, status (queued/building/ready/failed), version, stats jsonb, route_legs jsonb (simplified from plan stops + ride legs; C25), receipt jsonb, cards jsonb, agent_job_id | uk (trip_id, version) | sys | T | trip | C1 | life |
| `recap_awards` | recap_id, user_id, kind, text, opted_out | recap_id | sys; self opt-out | T | trip | C1 | life |
| `recap_views` | recap_id, user_id, seen_at | uk | self | O | me | C2 | life |
| `stamps` | pass_id, user_id, kind (home/issued/trip/referral), seq_no, destination_id, dates daterange, iata, country, ink_colour, status (upcoming/stamped), stamped_at, trip_id (home stamp = No. 1; doc delta) | (user_id, seq_no) | sys | read shares-crew | me, crew_people | C1 | acct |
| `stamp_signatures` | stamp_id, signer_id, stroke_media_key | uk (stamp_id, signer_id) | self | T | trip | C1 | acct |
| `photos` | trip_id, uploader_id, media_key, thumb_key, taken_at, sha256, phash, width, height, quality, exif_gps_stripped bool, upload_state (pending/uploaded/failed), is_pick, faces_opt_in bool (detection on device only; no face data stored, C4) | (trip_id, taken_at) | self upload; mem read | T | trip (metadata; bytes via media-worker HMAC URLs) | C1 | trip album lifetime; uploader deletion removes |
| `album_picks` | trip_id, photo_id, picked_by (user/guide), rank | uk (trip_id, photo_id) | mem | T | trip | C1 | life |
| `memories` | trip_id, anchor_kind, anchor_id, author_id, text | trip_id | mem | T | trip | C1 | life |
| `memory_reactions` | memory_id, user_id, emoji | uk | self | T | trip | C1 | life |
| `postcards` | trip_id, photo_id, note, format, created_by | trip_id | mem | T | trip | C1 | life |
| `postcard_mailings` | postcard_id, recipient_ids uuid[], vendor (print-on-demand), vendor_ref, status (queued/sent/printed/shipped/failed), tracking | postcard_id | sys | T (status only) | trip | C2 | 2 y |
| `mailing_addresses` | user_id, fields_enc, country | user_id | self | X (never shown to crew) | — | C3 | acct |
| `anniversaries` | trip_id, fire_at (end + 365 d), status | (fire_at) | sys | S | — | C2 | life |
| `media_objects` | owner_id, r2_key, kind, bytes, sha256, trip_id?, purpose | (owner_id) manifest for export/deletion | sys | S | — | C2 | acct |

### 3.11 Notifications, devices, surfaces, alarms, action keys

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `devices` | user_id, platform (ios/android), os_version, app_version, locale, tz, permission_state jsonb (notif, time_sensitive, alarm, location level, precise, calendar, promoted), attribution jsonb, la_enabled, la_frequent, last_seen_at | (user_id) | self | O | me | C2 | 180 d inactive |
| `push_tokens` | device_id, kind (apns_alert/fcm), token, env (sandbox/prod), invalid_at | uk (kind, token) | self | O (write) | — | C2 | until invalid + 7 d |
| `la_push_to_start_tokens` | device_id, activity_type, token | uk (device_id, activity_type) | self | O | — | C2 | rotates |
| `widget_push_tokens` | device_id, widget_kind, token | uk | self | O | — | C2 | rotates |
| `installed_widgets` | device_id, kind, family, config jsonb (trip_id/crew_id) | device_id | self | O | — | C2 | 30 d unseen |
| `device_activities` | device_id, user_id, trip_id, kind (leave_by/crew_meetup/flight/encounter/vote_closing/sos/storm/alarm), ref_id, os_activity_id, activity_push_token, broadcast_channel_id?, started_via (local/scheduled/push_to_start), state (pending/active/stale/ended/dismissed), stale_at, ends_at, last_content_version | (state, ends_at) | self / sys | O | — | C2 | 7 d after end |
| `broadcast_channels` | kind (leave_by/meet_up/vote), ref_id, env (sandbox/prod), bundle_id, apns_channel_id?, storage_policy, delete_after, deleted_at | uk (kind, ref_id, env, bundle_id); uk apns_channel_id | sys | S | — | C2 | GC at delete_after |
| `la_object_states` | kind, ref_id, trip_id?, seq (content version), phase (live/ended), last_state jsonb (≤ 4 KB, the last frame sent), ended_at | pk (kind, ref_id) | sys | S | — | C2 | 7 d after ended |
| `device_action_keys` | key_id, device_id, user_id, secret_enc (HMAC-signing secret, AES-256-GCM envelope-encrypted, `packages/db/src/crypto`), scopes text[] (`ballot`, `readiness`, `trip_day`, `sos`, `money_nudge`, `money_mark`, `rsvp`, `changeset`, `chat_reply`, `inbox`, `read_snapshot`, `read_notification`; api-contracts-async §5), expires_at (30 d rolling), created_at, last_used_at, revoked_at | pk key_id | self create/revoke (app_system issues); revoked on sign-out, device removal, account deletion, uid merge, admin action | O | — | C3 (secret hash) | revoked + 30 d |
| `notifications` | user_id, crew_id?, trip_id?, category, class (always/budgeted/roundup_only), sender jsonb (kind/id), template_id, title, body, items jsonb, deep_link, collapse_key, thread_id, dedupe_key, llm_generated, not_before, expires_at, state (queued/sent/rolled_into_roundup/dropped/failed), sent_at | uk (user_id, dedupe_key); (state, not_before) | sys | O read | me (last 30 d) | C2 | 90 d |
| `notification_prefs` | user_id, budget_per_day (1–10, default 5), roundup_time, roundup_tz (trip/device), guide_tips, money, critters_nearby, crew_chat_mode, leave_by_dnd, quiet_hours | uk user_id | self | O | me | C2 | acct |
| `ping_ledger` | user_id, local_date, sent_budgeted, queued | uk (user_id, local_date) | sys | O read | me | C2 | 30 d |
| `roundups` | user_id, local_date, guide_id, notification_ids uuid[], lines jsonb, sent_at, fallback_used | uk (user_id, local_date) | sys | O | me | C2 | 30 d |
| `inbox_items` | user_id, crew_id?, trip_id?, kind, source (crew/guide/system), actor_id?, source_event_id (fan-out idempotency), resolve_key (settled from any surface), data jsonb (ids and short values for the kind renderer), needs_you, actions jsonb (`[{id, command?, payload?, style}]`), deep_link, expires_at, undo_until, resolved_at, read_at (doc delta: read ≠ resolved) | (user_id, resolved_at); uk (user_id, source_event_id); (resolve_key) WHERE open | sys create; self resolve / mark read | O | me | C2 | 30 d after resolve |
| `scheduled_deliveries` | user_id, kind (resend/ask_later/nudge), target_ref, send_at_local, tz, payload jsonb, status | (status, due_at) | self / sys | O | me | C2 | 30 d |
| `home_tips` (doc delta) | crew_id, guide_id?, kind (fare_drop/book_by/season_peak/crowd_dip), text ≤120, facts jsonb (the only numbers the text may carry), place_id?, dedupe_key, valid_until, status (active/dismissed/expired), dismissed_by?, dismissed_at | uk (crew_id, dedupe_key); (crew_id, status) | sys create; mem dismiss (`dismiss_tip`) | M read / S write | crews (active only) | C1 | 30 d after expiry |
| `nudges` (doc delta) | sender_id, target_id, crew_id, trip_id?, reason (vote/rsvp/readiness/payment/invite_open), context jsonb {kind,id}, channel (push/inbox/share_sheet), scheduled_delivery_id?, send_at, sent_at | (sender_id, target_id, created_at); (target_id, send_at) | mem via `send_nudge` (1/pair/24 h, 2 received/day) | sender or target read / S write | me | C2 | 90 d |
| `app_open_hours` (doc delta) | user_id, hour_local 0–23, opens, updated_at | pk (user_id, hour_local) | self via `record_app_open` (1/h) | X (not published, not in `llm`) | — | C2 | acct (hours unopened for 14 d are ignored by the send-time model) |
| `scheduled_events` | kind, ref_id, due_at (computed from local time + tz), tz, status, pgboss_job_id | (status, due_at) | sys | S | — | C2 | 30 d after fire |
| `leave_bys` | trip_id, plan_item_id, leave_at, pickup_at, tz, legs jsonb, progress_mode (time/location), alarm_policy jsonb (lead_min 10, only_if_not_up, snooze_limit 1), pickup jsonb, state (scheduled/window/alerting/departed/cancelled) | (trip_id, leave_at) | sys (from plan); org edit | T | trip | C1 | life |
| `readiness` | leave_by_id, user_id, state (not_up/up/ready/left), source (la/alarm/app/widget), snooze_count, knock_sent_at | uk (leave_by_id, user_id) | self (OW, action key) | T | trip | C1 | life |
| `alarms` | user_id, device_id, leave_by_id, fire_at, os_alarm_id, state (scheduled/alerting/snoozed/stopped/cancelled), sync_version | uk (device_id, leave_by_id) | self (device-authoritative mirror) | O | me | C2 | 7 d after fire |

### 3.12 Location, safety, day-of, disruptions

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `location_shares` | trip_id, user_id, reason (crew_map/help/sos), starts_at, ends_at (crew map: midnight of last day; help 1 h; sos until resolved), paused | (trip_id, reason) | self; help/sos override pause with copy | T | trip | C1 | life |
| `location_fixes` | user_id, trip_id, share_id, lat, lng, accuracy_m, activity, mock_flags smallint (1 simulated, 2 accessory, 4 implausible), at | (share_id, at desc); TTL job | self write (not via PowerSync; `POST /loc` + Centrifugo) | X; readable only via `app.can_see_location` fn | — | C3 | minutes (TTL 15 min; SOS: until resolved + 24 h) |
| `member_etas` | trip_id, meetup_id? (FK `meetups`), user_id, distance_m, eta_min, mode, estimate (doc delta), status_text (`key` or `key:place`), progress, sharing (live/paused/off), computed_at | uk (trip_id, user_id) | sys | T (rows with a meet-up gated by `app.crew_map_open`; help rows crew-visible) | — (Centrifugo `trip_locations:`; not published) | C1 | 1 d |
| `meetups` | trip_id, poi_id?, place_name, lat, lng, meet_at, created_by, status (active/done/cancelled), arrived jsonb (uid → at; doc delta), all_close_at (doc delta) | trip_id; one active per trip | mem (boost; `app.crew_map_open`: boosted ∧ in_trip ∧ before last-day midnight tz) | T + gate | trip (boosted trips) | C1 | life |
| `help_sessions` | trip_id, user_id, kind (help/sos), status (open/responding/resolved), responder_ids uuid[], summary, steps jsonb, opened_at, resolved_at | (trip_id, status) | self open; mem respond | T | trip | C1 (health detail C3 in `help_session_private`) | 1 y |
| `help_session_private` | help_session_id, health_notes_enc | 1:1 | self + responders | X | — | C3 | 90 d |
| `emergency_numbers` | country, general, police, ambulance, fire, tourist_police, verified_at | uk country | adm | R | catalog | C0 | content |
| `facilities` | destination_id, name, kind (clinic/hospital/pharmacy/embassy), hours jsonb, geo, insurance_networks text[], phone, verified_at | GIST geo | adm | R | trip_pack | C0 | content |
| `disruptions` | trip_id, kind (flight_delay/storm/weather/running_late/closure), affected jsonb, source_snapshot jsonb, detected_at, status, change_set_id? | (trip_id, status) | sys | T | trip | C1 | life |
| `watch_items` | trip_id, kind, target_ref, status (plan_b/watching/go/set), impact jsonb | trip_id | sys | T | trip | C1 | life |
| `briefings` | trip_id, user_id, local_date, agent_job_id | uk (trip_id, user_id, local_date) | sys | O (per viewer) | trip_me | C2 | life |
| `briefing_items` | briefing_id, icon, text, action (done/nudge/set/open), target_user_ids, status, source (daily_job/event), source_event_id, i18n jsonb? (doc delta: translations of the line, in its owner's language per language, `{"<locale>": {"<field>": text}, "_src": hash of the source fields}`; written by `guide_text.translate`, read through `guideText`) | cascade | sys; self check | O | trip_me | C2 | life |
| `packing_items` | trip_id, day?, owner_id? (null = shared), label, checked, checked_by, suggested_by | trip_id | mem | T (personal rows owner-only) | trip | C1 | life |
| `offline_bundles` (doc delta) | trip_id, local_date, version, content_hash, manifest jsonb (sections: briefing, briefing_items, packing, leave_bys, readiness, briefing_items, `days` with pointers to day-specific plan/cost data, media keys), built_at | uk (trip_id, local_date); partial (trip_id, local_date, version) | sys (built by worker) | T | trip | C1 | life |
| `weather_snapshots` | destination_id, point_key (`centroid`, `summit:<name>`, `g:<lat>,<lng>` 0.1° cell), lat, lng, elevation_m, date, hourly jsonb (day, hours, alerts), marine jsonb (centroid rows only), marine_fetched_at, source (weatherapi), fetched_at, checked_at (checked_at > fetched_at = last refresh failed, stale) | uk (destination_id, point_key, date, source) | sys | R | trip_pack | C0 | 30 d |
| `crowd_forecasts` | poi_id, dow, hourly smallint[24], source (besttime), fetched_at (no hourly source contracted yet; rows expire after 90 d) | uk (poi_id, dow) | sys | R | trip_pack | C0 | 90 d |
| `fare_cells` | origin_iata, dest_iata, destination_id, month (1st), depart_on, return_on, price_minor (null = never seen), currency (USD), transfers, duration_min, fastest_duration_min, days jsonb (cheapest per departure day), price_history jsonb (last 8 nights), found_at, fetched_at, checked_at | uk (origin_iata, dest_iata, month) | sys | R | — (HTTP only, not published) | C0 | content |
| `season_months` | destination_id, month, crowd_index, price_index, price_index_source (editorial/fares), highlight_tag, colour_role (cheapest/peak/normal), source, source_url, sourced_on, reviewed_at (null = draft, not served) | uk (destination_id, month) | adm (`upsert_season_editorial`) / sys (`season.ingest`) | R (reviewed only) | catalog | C0 | content |
| `season_events` | destination_id, key, kind (blossom/foliage/festival/ceremony/holiday/closure), name, starts_on, ends_on, confidence (typical/forecast/confirmed), source, source_url, sourced_on, forecast_updated_at, reviewed_at | uk (destination_id, key) | adm / sys | R (reviewed only) | catalog | C0 | content |
| `hazard_alerts` | destination_id, kind (volcano/weather_warning), subject, level 1–4, level_label, headline, source (magma/imo/jma/cenapred/gdacs), source_url, issued_at, expires_at, fetched_at | uk (destination_id, source, subject) | sys | R | trip_pack | C0 | content |

### 3.13 POI, map, content catalogue

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `pois` | destination_id, name, name_local, category, lat/lng double precision, location geography(Point,4326) (generated from lat/lng), address, hours jsonb, hours_verified_at, price_level, source_ids jsonb (fsq_os/overture/editorial), editorial jsonb, tags text[], fts tsvector, status, curation (auto/editorial), merged_into_id, geofence geography(Polygon,4326), visit_radius_m, timezone, last_live_check_at | GIST `location`; GIN fts, trgm name; partial unique on source_ids->>fsq_os / ->>overture | adm / content pipeline | R | trip_pack (trip destinations), explore (param) | C0 | content |
| `poi_embeddings` | poi_id, model, embedding vector(1024) | HNSW | sys | S (server search) | — | C0 | content |
| `poi_live_checks` | poi_id, is_open_now, closed_permanently, checked_at (Foursquare live flags only; no FSQ content) | uk poi_id | sys | R | — | C0 | 7 d |
| `place_tips` | poi_id, destination_id (copied from the POI by trigger, doc delta), author_id (hidden; set null on account deletion), text, lang, moderation_status | poi_id; destination_id where approved | adm / content pipeline | R, approved only (author column not granted to app_user, not in the stream) | explore | C0 | acct → anonymised |
| `place_qna_summaries` (doc delta) | trip_id, poi_id, text (≤280), source_message_id, source_at: the crew's one-line Q&A snippet from that trip's own chat | uk (trip_id, poi_id) | sys (`explore.place_qna_summary`) | T | — (place context route) | C1 | life |
| `sponsored_placements` (doc delta) | partner, poi_id, destination_id, offer_ref, list_kinds (picks/map_carousel/search), categories, starts_at, ends_at, impression_cap, status, created_by | destination_id where active | adm (ops console) | R, active only; writes app_system only | — (explore routes, gated by `sponsored(u,t)` and `explore.sponsored`) | C0 | content |
| `media_assets` (doc delta) | kind (photo/video), source (pexels/pixabay/wikimedia), source_id, source_url, download_url, subject_keys[] (`destination:<slug>`, `poi:<ref>`), rank (0 = hero), title, author, author_url, licence, licence_url, attribution_required, credit, width, height, duration_ms, colour, blurhash, variants jsonb [{key, format webp/mp4, w, h, bytes}] under the public `c/media/<id>/`, poster_key, status (pending/ready/failed), error, release_id | subject_keys (GIN, ready only) | content factory `media` batch → ops console → `content.publish` → `media.ingest` | R, ready only; writes app_system only | — (`GET /v1/media`) | C0 | content |
| `sponsored_event_counts` (doc delta) | placement_id, day, list_kind, kind (impression/click), count: no user, device or trip | uk (placement_id, day, list_kind, kind) | any (`record_sponsored_event`, counted as the server) | S | — | C0 | content |
| `content_releases` | kind (sets/critters/forms/spawns/windows/personas/places/phrases/taste_quiz/help/emergency/facilities/insurance), version, batch_key (uk), title, status (draft/review/blocked/approved/published/superseded/rejected), stage (brief…publish), gate, blocked_reason, ip_status, checksum, artifact jsonb (the checksummed release envelope), item_count, agent_job_id (cost roll-up from `ai_usage`), notes, approved_by, approved_at, published_at (doc delta) | uk (kind, version); one `published` per kind | adm | S | — | C0 | forever |
| `persona_packs` | guide_id, version, system_prompt_ref, style jsonb, lexicon jsonb, voice_settings | uk (guide_id, version) | adm | S (`llm` view) | — | C0 | forever |
| `help_articles` | slug, locale, title, summary, body_md, category, embedding vector(1024), fts tsvector, release_id | uk (slug, locale) | adm | R (live release) | help (param) | C0 | content |
| `critter_names` (doc delta) | critter_id, form_id?, locale, name, name_native, release_id | uk (critter_id, form_id, locale) nulls not distinct | adm | S (no app_user/powersync_repl/guide_reader/admin_reader grant) | — | C0 | content |
| `legendary_windows` (doc delta) | key, form_id, place_line, rule jsonb (annual_range/month_part/any_day), months smallint[], solar, challenge, source_url, release_id | uk key | adm | R (live release) | catalog | C0 | content |
| `phrase_cards`, `emergency_numbers`, `facilities` (doc delta) | phrase_cards: key, language, context, text, romanisation, gloss, audio_key, audio_status, native_reviewed_on (emergency/allergy need it); emergency_numbers: country, numbers jsonb, source_url, retrieved_on, verified_at NOT NULL; facilities: key, destination_id, kind, name, lat, lng, address, phone, open_24h, source_url, retrieved_on, verified_at NOT NULL; each with release_id | uk key / country | adm | R (live release) | catalog / trip_pack | C0 | content |
| `poi_hours_proposals` (doc delta) | poi_id, hours jsonb, source_url, fetched_at, batch_key, status (proposed/verified/rejected), decided_by, decided_at | uk (poi_id, batch_key) | adm | S | — | C0 | content |
| `map_regions` | destination_id, pmtiles_key, bytes, version | destination_id, uk (destination_id, version) | adm | R | trip_pack | C0 | content |
| `cities` (doc delta) | name, country, lat/lng double precision, location geography(Point,4326) (generated from lat/lng), population, iata_nearby text[], source_id (Overture) | uk source_id; GIST `location`; trgm name | adm / content pipeline | R | — (not synced; served via `/v1/geocode*`) | C0 | content |

`pois`/`cities` geo columns (doc delta): `lat double precision, lng double precision` are kept
alongside `location geography(Point,4326)` (a `STORED GENERATED ALWAYS AS` column, PostGIS confirmed
available on the local/test image and on PlanetScale staging) so synced clients keep reading plain
numbers while near-me ranking, reverse geocoding and KNN ordering use `location`'s GiST index
instead; `pois.geofence` and `destinations.geofence` (§3.3) are `geography(Polygon,4326)`/
`geography(MultiPolygon,4326)`, per the architecture. `pois.curation`, `hours_verified_at`,
`merged_into_id`, `geofence`, `visit_radius_m` and `timezone` are additive columns beyond the
original row above.

### 3.14 Entitlements, purchases, boosts, codes, meters

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `products` | key (pass_monthly/pass_yearly/boost_trip/boost_crew_year/gift_pass_3m), store_ids jsonb, type (auto_renew_sub/consumable/non_renewing), grants jsonb | uk key | adm | R | catalog | C0 | forever |
| `perks` | key, tier (pass_plus/boost/ftf/crew_year), copy_key, is_shipped, sort | uk key | adm | R | catalog | C0 | forever |
| `ops_config` (in `ops` schema, public subset `client_config` view) | key, value jsonb (e.g. `guide.free_daily_limit=30`, `seat.cap_free=6`) | uk key | adm | R (view) | catalog | C0 | forever |
| `subscriptions` | user_id, platform (app_store/play/promo/gift), rc_customer_id, original_transaction_id, product_key, status (active/grace/billing_retry/on_hold/paused/cancelled_active/expired/revoked), auto_renew, period_start, period_end, grace_ends_at, paused_from, resume_at, storefront, environment, last_event_at | (user_id, status) | sys (RevenueCat webhook + store verification) | O read | me | C2 | acct |
| `store_transactions` | user_id (nullable after anonymisation), platform, transaction_id, original_transaction_id, product_key, purchased_at, price_minor, currency, storefront, quantity, signed_payload, revoked_at, revocation_reason, refunded_at, boost_intent_id?, code_id? | uk (platform, transaction_id) | sys | S | — | C5 | 7 y |
| `billing_events` | source (revenuecat/app_store/play), event_id, type, payload jsonb, processed_at | uk (source, event_id) | sys | S | — | C5 | 2 y |
| `boost_intents` | trip_id, crew_id, buyer_id, product_key, split_mode (cover/split), split_member_ids, status, expires_at (~10 min) | partial uk (trip_id) WHERE status IN ('open','purchasing') | par | T | trip | C1 | 30 d |
| `trip_boosts` | trip_id, crew_id, buyer_id, source (purchase/first_trip_free/crew_year/moved/promo), transaction_id?, crew_year_grant_id?, starts_at, ends_at (= trip end + 7 d, recomputed on date change), status (scheduled/active/ended/moved/revoked/credit), moved_from_trip_id, expense_id? | (trip_id, status) | sys | T | trip | C1 | 7 y |
| `boost_credits` | crew_id?, user_id?, reason (trip_cancelled/duplicate_purchase), from_boost_id, expires_at, consumed_by_boost_id | — | sys; mem apply | M / O | crews | C2 | 7 y |
| `crew_year_grants` | crew_id, buyer_id, subscription_id?, transaction_id?, valid_from, valid_to | crew_id | sys | M | crews | C2 | 7 y |
| `ftf_grants` | crew_id (unique), trip_id, starts_at (trip enters setup), ends_at, member_overlap_hash, abuse_decision | uk crew_id | sys | M | crews | C2 | forever (abuse) |
| `codes` | code_hash, code_prefix, kind (gift/promo/partner), grant jsonb, sender_id?, message, funded_by_txn_id?, partner_id?, platform_restriction, max_redemptions, redeemed_count, expires_at, status | uk code_hash | sys / adm | S | — | C2 | 2 y after expiry |
| `code_redemptions` | code_id, user_id, redeemed_at, applied_as (server_grant/store_extension/offer_code), new_period_end | uk (code_id, user_id) | self | O | me | C2 | 7 y |
| `user_entitlements` | user_id, pass_plus bool, sources jsonb, expires_at, guide_unlimited_global bool, icon_styles text[], computed_at | uk user_id (materialised by `packages/entitlements`) | sys | O | me | C2 | acct |
| `trip_entitlements` | trip_id, boost_active, seat_cap, redraft_limit, live_map, sponsored, computed_at | uk trip_id | sys | T | trip | C1 | life |
| `usage_counters` | subject_kind (user/trip), subject_id, metric (guide_answers/redrafts/map_opens), period_key, count, limit_at_time, reset_at | uk (subject_kind, subject_id, metric, period_key) | sys (atomic increment in command txn) | O / T | me, trip | C2 | 90 d |
| `redraft_reservations` | trip_id, agent_job_id (uk; the redraft's job), status (reserved/committed/released; settled once), free_reason (late_must_do), quota_period_key, settled_at; view `redrafts` (doc delta, security_invoker) = `agent_jobs(kind=redraft)` + reservation + `candidate_version_id`, so `redraft_id` is the agent job id | (trip_id, status) | sys (redraft commands and the worker, as app_system) | T organiser-only (doc delta) | trip_draft (doc delta) | C1 | life |
| `fair_use_counters` | user_id, metric (guide_tokens/voice_seconds/vision_calls/redrafts), window_start, count, cap | uk (user_id, metric, window_start) | sys | S (silent; never shown) | — | C2 | 30 d |
| `paywall_impressions` | user_id, trip_id?, entry_point, shown_at, outcome (purchased_pass/purchased_boost/dismissed/quiet_no), suppressed_until | (user_id, shown_at) | sys | O | me | C2 | 1 y |
| `rating_prompts` | user_id, shown_at, outcome | user_id | sys | O | me | C2 | 1 y |

### 3.15 Community, feedback, help

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `shared_plans` | trip_id, version_id, share_token_hash, toggles jsonb (names_off, cost_rounded, photos_blurred, no_chat), projection jsonb (materialised public copy), status (draft/pending_consent/published/unpublished), published_by, consent_ids uuid[] | uk share_token_hash | org + `CONSENT(multi_member_publish)` from each named member | R when published; T when draft | community (param) | C0 | until unpublished |
| `shared_plan_copies` | shared_plan_id, copied_by, new_trip_id | shared_plan_id | any | O | — | C2 | acct |
| `ratings` | shared_plan_id?, poi_id?, user_id, stars, text, moderation_status | uk (target, user_id) | any | R (author anonymised) | community | C0 | acct → anonymised |
| `ideas` | title, body, status (open/planned/building/shipped), embedding, votes_count | — | adm curate; any submit | R | help | C0 | forever |
| `idea_votes` | idea_id, user_id | uk | self | O | me | C2 | acct |
| `feedback_tickets` | user_id, ticket_no, mood, category, body, device_info jsonb (opt-in), screenshot_key, status | (status) | self create | O | me | C2 | 2 y |
| `moderation_reports` | reporter_id? (null only for `source = compliance`), source (user/compliance), target_kind, target_id, reason, status, report_count, last_reported_at, verdict, decided_by, decided_at, author_id? (the kind handler's author at intake), assignee_admin_id?, due_at (first filing + `moderation.sla_hours`, default 24), reason_counts jsonb (filings per reason) | (status, last_reported_at); open rows by (target_kind, target_id); author_id; open rows by due_at | any | S | — | C2 | 1 y |

### 3.16 Ops, concierge, vendor messaging (`ops` schema)

| Table | Key columns | Authz | RLS | Class | Ret |
|---|---|---|---|---|---|
| `ops.concierge_tasks` | trip_id, kind (vendor_message/clinic_handoff/partner_booking/review), status, assignee_admin_id, requested_by, approval_id, due_at | adm | S | C2 | 2 y |
| `ops.vendor_threads` | trip_id, provider_id, channel (whatsapp_business), wa_contact_hash, status | adm | S | C2 | 1 y |
| `ops.vendor_messages` | thread_id, direction, body, template_name, approved_by_user_id, approved_at, wa_message_id, status | adm (send only after user approval) | S | C2 | 1 y |
| `ops.approvals` | user_id, subject_kind, subject_id, text_shown, approved_at, op_id | self (via API) | S | C2 | 2 y |
| `ops.partner_adapters` | partner (agoda_demand/klook_activity/trip_com_at/viator_booking/gyg_api), enabled, copy_mode, approved_at, notes | adm | S (`client_config` exposes flags) | C0 | forever |
| `ops.admin_audit` | admin_id, action, target_kind, target_id, reason, at, ip_hash, op_id, detail jsonb = `{summary, changes: [{field, before, after}], via: admin\|cli, roles, …command keys}` (`auditDetailSchema`; a handler that writes its own row gets op_id and detail from the pipeline's `app.admin_audit_context` through an insert trigger, so the table stays insert-only); indexes op_id, (action, at), `detail->>'key'` | sys | S | C2 | 2 y |
| `ops.supplier_calls` | supplier, endpoint (fixed label, never a URL), method, attempt, outcome (ok/http_error/timeout/network_error), status, latency_ms, cost_units, at (no bodies) | sys | S | C0 | 90 d |
| `ops.moderation_filings` | report_id, reporter_id, reason, note? (≤ 280, contact details and links cut out at intake), filed_at; uk (report_id, reporter_id) — one row per user filing behind a report (daily report limit, repeat reports count once) | sys | S | C2 | 1 y |
| `ops.work_claims` | queue, item_id, admin_id, claimed_at; pk (queue, item_id) — who is working an item of a console queue (`claim_work_item`); mirrored into the source's own assignee column where it has one | adm | S | C2 | while the item is open |
| `ops.entitlement_grants` | user_id, perk (pass_plus), until, reason, granted_by, granted_at, revoked_at?, revoked_by?, revoke_reason?; active grants read only through `app.active_entitlement_grants(uid)` (SECURITY DEFINER: app_system any uid, app_user own) by the entitlement loader | adm | S | C2 | 2 y |
| `ops.content_reviews` | release_id, item_ref, render_key, verdict, reviewer, notes | adm | S | C0 | forever |
| dead letters (pg-boss `<queue>.dlq`, read through the pg-boss API, no view) | queue, job id, original id, last error (`sourceOutput`), attempts, payload (redacted before any console response) | adm | S | C2 | 30 d |

### 3.17 Consent, deletion, export

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `consents` | user_id, purpose (dietary_visibility/faces/mailbox_surfacing/insurance_to_clinic/help_auto_share/multi_member_publish/visit_detection/crew_phone_visible/analytics/marketing/ai_voice), scope jsonb, granted_at, revoked_at, copy_version | (user_id, purpose) | self | O | me | C2 (audit) | acct + 3 y (audit, anonymised) |
| `account_deletions` | user_id, reason, balances_snapshot jsonb, requested_at, purge_at (+30 d), restored_at, purged_at, source (app/web) | uk user_id WHERE open | self | O | me | C2 | 3 y (anonymised) |
| `data_exports` | user_id, status (queued/building/ready/expired), r2_key, expires_at (7 d) | user_id | self | O | me | C2 | 7 d |

### 3.18 Infrastructure tables

| Table | Key columns | Notes | RLS | Stream | Ret |
|---|---|---|---|---|---|
| `cmd_log` | op_id (pk), uid, cmd, payload_hash, result jsonb, created_at | Server idempotency ledger for **all** commands (HTTP, `/sync/upload`, `/v1/actions`, system). Same op_id + same hash → stored result (`duplicate`); different hash → `IDEMPOTENCY_MISMATCH`. Contract: api-contracts §2.4 | S | — | 30 d |
| `cmd_results` | op_id (pk), uid, cmd, status (applied/rejected/duplicate), code? (UPPER_SNAKE from `packages/domain/src/errors.ts`, e.g. `VOTE_CLOSED`, `VERSION_CONFLICT`, `SEAT_LIMIT`, `QUOTA_EXHAUSTED`), detail jsonb?, result_ref jsonb (created ids, new version), server_ts | Per-command outcome synced to the owner; rejects return HTTP 2xx on `/sync/upload` | O | me | 14 d |
| `rt_outbox` | id bigserial, channel, payload jsonb, idem_key uuid, kind (publish/unsubscribe/disconnect), created_at, published_at, attempts | Written in the command txn; worker relays with `FOR UPDATE SKIP LOCKED` to Centrifugo server API | S | — | 7 d after send |
| `domain_events` | id, type, aggregate_kind, aggregate_id, actor_kind, actor_id, payload jsonb, occurred_at | Append-only internal event log; consumers enqueue pg-boss jobs in the same txn (`boss.send` with the txn client) | S | — | 400 d (analytics export, recap) |
| `ai_usage` | user_id?, trip_id?, job_id?, model, tier (fast/pro/jev: the DeepSeek tiers, and `jev` = a decision call billed on input tokens), route? (the gateway route, e.g. `guide.chat`, `draft.skeleton`; index (route, at); null on rows before it was recorded), tokens_in, tokens_out, cache_read, cost_micros, langfuse_trace_id, at | Cost accounting + fair-use feed | S | — | 1 y |
| `pgboss.*` | pg-boss 12 schema (job, queue, schedule, archive) | Owned by `app_system`; queues named `<domain>.<action>` (full catalogue: api-contracts-async §2, e.g. `rt.relay`, `notify.route`, `push.send`, `ai.draft`, `maint.purge`); DLQ `<queue>.dlq` | none | — | pg-boss archive 7 d |

Client-only (PowerSync local, never replicated up as tables): `commands` insert-only local table ({op_id, type, payload, summary, attempts}) drained by `uploadData` → `POST /sync/upload`; `local_private` local-only table for owner C3 data fetched over HTTPS (insurance card, own dietary, own budget max "set" flag). The local database is SQLCipher-encrypted.

---

## Unresolved questions

1. Better Auth stores `phone_number` plaintext in `auth.user`; encrypt via a custom adapter hook, or accept schema isolation (`auth` not granted to `app_user`)?
2. Crew chat sync depth: full history per crew (current choice; ≤16 members) vs a rolling window + API pagination if payload size hurts first sync.
3. Former members (`status='former'`, `keep_in_chat`) — which trip tables remain readable (plans/expenses they were part of)? Current rule: chat + ledger rows naming them.
4. Embedding dimension 1024 assumes the chosen embedding model; confirm model (Claude has no embedding model — Voyage vs self-hosted) in the AI phase.
5. `trip_participants` vs crew-level visibility of a trip the user opted out of (`rsvp='out'`): still crew-visible (current) or hidden?
6. Retention for C5 (7 y) assumes Singapore tax rules; counsel to confirm.
