# Critterpass data model: sync, privacy, state machines

Companion to [data-model.md](./data-model.md) (conventions, roles, per-table schema). This file: private-field strategy, LLM context views, state machines, PowerSync Sync Streams, Centrifugo channels, retention jobs, table → creating-phase map.

---

## 1. Private-field strategy

Rule: **privacy is decided by table, never by column.** A C3 value never shares a row with C1 data, so publication, RLS, `llm` views and exports can reason per table.

| Mechanism | Applies to | How |
|---|---|---|
| Split table | every C3 field | `user_private`, `dietary_profiles`, `budget_max_private`, `budget_defaults_private`, `calendar_sources`, `calendar_days`, `availability_asks`, `invite_prefill`, `private_guide_threads`, `payout_methods`, `mailbox_connections`, `mailing_addresses`, `insurance_policies`, `location_fixes`, `visits`, `encounter_samples`, `help_session_private`, `action_keys`, `inbound_emails` (raw) |
| Not published | all split tables above + `engagement_events`, `store_transactions`, `billing_events`, `codes`, `fair_use_counters`, `affiliate_*`, `ops.*`, infra tables | `CREATE PUBLICATION powersync FOR TABLE <explicit list>` (never `FOR ALL TABLES`); a CI check diffs the publication list against the allow-list in `packages/db/publication.ts` |
| Owner-only RLS (`X`) | split tables | `USING (user_id = app.uid())`; `budget_max_private` additionally has no SELECT policy (write-only) |
| No `guide_reader` grant | split tables, `engagement_events`, `guide_messages` of other users | `llm` views are the only surface (§2) |
| Field encryption | phone, email copy, passport, payout details, postal address, insurance numbers, calendar/mailbox OAuth tokens, provider contacts, health notes, invite prefill | AES-256-GCM envelope; HMAC hash for lookup (`phone_hash`, `code_hash`, `seat_token_hash`, `key_hash`) |
| Derived C1 projections | the few C3 facts crews may see | SECURITY DEFINER writers produce a C1 row only under the rule: `trip_budget_aggregates` (k ≥ 4, band edge rounded down, never equals lowest max), `availability_summaries` (counts only), `participant_dietary_flags` (with consent), `crew_contact_cards` (with consent), `anonymous_suggestions` (crew ≥ 4, never names), `crew_collection_counts` view (unless hidden), `member_etas` (ETA only) |
| Reveal functions | one-off disclosure | `app.reveal_payout(payment_id)` → caller must be `from_id` of a non-confirmed payment; `app.share_insurance(help_session_id)` → needs `CONSENT(insurance_to_clinic)` and writes `ops.approvals` |
| Offline C3 (owner) | insurance card, own dietary, emergency info | fetched over HTTPS into PowerSync `local_private` local-only table (SQLCipher DB); never replicated |
| Lock-screen / widget snapshots | App Group / DataStore | never budget maxes, never coordinates; money widgets `privacySensitive` |
| Logs & analytics | all | pino redaction list generated from the split-table columns; PostHog events carry ids and enums only; Sentry `beforeSend` strips bodies |
| Supplier content | Viator/Agoda/Klook/etc. descriptions, reviews, photos | never persisted, never in `llm` views; only ids, status, price-at-display |
| Deletion | per account | `account_deletions.purge_at` → purge job: C3 tables hard-delete, `media_objects` → R2 delete, C1 authored rows re-attributed to "former member" (`users.status='purged'`, display_name cleared), C5 `user_id` set NULL, SIWA/Google tokens revoked |

Crew-visibility matrix (master §10.4, C36) maps to: `users`/`avatars`/`passes`/`stamps` (C1), `taste_profiles` (C1 unless `hide_taste_tags`), `crew_collection_counts` (unless `hide_collection`), `trip_participants.rsvp`, `recap_awards` (opt-out), `member_etas` inside windows, `crew_contact_cards` (consent), and nothing else.

---

## 2. LLM context views (`llm` schema, `guide_reader`)

| View | Contents | Excludes |
|---|---|---|
| `llm.trip_context` | trip header, dates, tz, destination, participants (display name, taste tags unless hidden, RSVP), seat cap, budget **band** | budget maxes, calendars, engagement |
| `llm.plan_items` | current + (for organiser jobs) draft version items, POI refs, costs from `cost-engine` outputs | — |
| `llm.pois` | curated POI DB (`pois`, `poi_live_checks` flags) | supplier content |
| `llm.bookings` | type, title, location, times, tz, status, free_cancel_until, cancel_policy_text; visibility=crew only (doc delta: title, location, policy text) | barcodes, attachments, prices, confirmation codes, personal bookings (own included) |
| `llm.money_summary` | per-member net balances, category totals | payout methods |
| `llm.chat_window` view + `llm.chat_window(crew, n)` (last n ≤200, oldest first) | seq, author kind (member/guide), author display name, type, body of visible `text` rows of crews the asker is an active member of; callers wrap rows as untrusted user data | attachments, every card payload (poll, expense, supplier_order, proposal, changeset, boost_card, meetup), system rows, hidden and deleted rows, private guide threads |
| `llm.persona_packs`, `llm.phrase_cards`, `llm.help_articles` | content | — |
| `llm.user_prefs` | chattiness, dietary **flags** only when consented | dietary profile, health notes |
| `llm.my_personal_plan_ops` (doc delta) | the asking user's own active personal plan ops on the trip in context (`app.uid` + `app.trip`) | anyone else's rows; the base table |

View ownership: a view is created by the migration of the area that owns its base tables. The AI area created `llm.trip_context`, `llm.persona_packs` and `llm.user_prefs`; places created `llm.pois`. `llm.plan_items`, `llm.bookings`, `llm.money_summary`, `llm.chat_window`, `llm.phrase_cards` and `llm.help_articles` are added by their base-table owners, and a column that needs a later table (taste tags, budget band, dietary flags) is appended by that table's owner with `CREATE OR REPLACE VIEW`. Every such migration grants SELECT to `guide_reader` on the view only, never on its base tables, and the `guide_reader` contract test runs in every area.

The AI context builder runs `SET LOCAL ROLE guide_reader` + `app.uid` + `app.trip`; views filter by those settings. Numbers, times and prices in prompts come from `cost-engine`/`planner` outputs, and the guide writes only `change_sets` / `guide_offers` / messages through command handlers.

---

## 3. State machines

Transitions are enforced in command handlers (`packages/domain/state/*.ts`, one table-driven machine each) and backstopped by a `CHECK` on allowed values plus a trigger rejecting illegal `(old, new)` pairs for `trips.status`, `polls.status`, `trip_boosts.status`, `supplier_orders.status`.

### 3.1 Trip (`status` + derived `phase` + `setup_step`)

| From | To | Trigger | Side effects |
|---|---|---|---|
| — | `voting` | pitch / WHERE NEXT / reunion (anniversary) | destination Poll (stage board) |
| — | `setup` | solo trip | — |
| `voting` | `won` | poll closes (all voted or `closes_at` job; tie → cheaper for majority origin, frozen quotes) | reveal flags; loser back in deck |
| `won` | `setup` | organiser SET UP | `setup_step='when'`; FTF grant if crew's first trip (window starts) |
| `setup` | `drafting` | organiser DRAFT MY TRIP | `agent_jobs(kind=draft)` |
| `drafting` | `draft_review` / `setup` | job succeeded / failed or inputs changed | push if backgrounded |
| `draft_review` | `redrafting` | change a day; `redraft_reservations` reserved | diff card |
| `redrafting` | `draft_review` | KEEP or revert; reservation committed (released on failure) | — |
| `draft_review` | `proposed` | organiser SEND | per-recipient `proposal_versions`; reply_by timer |
| `proposed` | `draft_review` | organiser edits and re-sends | — |
| `proposed` | `confirmed` | reply_by passes with ≥ 2 IN (organiser included), or organiser locks with ≥ 1 recipient IN | proposed plan version → `current`. Organiser lock: maybe → waitlisted, unanswered → out, their open Viator holds released. Reply-by: unanswered → maybe, nobody moved off the trip |
| `confirmed` | `pre_trip` | T − 14 d job | day bundles, flight watches |
| `pre_trip` | `in_trip` | first member lands (flight webhook / geofence / manual) | egg hatch; location trip mode on |
| `in_trip` | `post_trip` | destination-tz midnight after last day (or return landing) | crew-map shares end; recap job; settle nudges |
| `post_trip` | `archived` | boost/FTF window end (end + 7 d) | perks pause; content kept |
| `setup`,`proposed`,`confirmed`,`pre_trip` | `cancelled` | organiser | boost → next trip or `boost_credits`; Viator cancel |

Lifecycle moves (doc delta): every move after setup and drafting goes through `moveTripStatus` (`packages/db/src/trips/status.ts`): a compare-and-set update the status guard still checks, plus `trip.status_changed` in the same transaction. The timed moves run in `trips.lifecycle` every 10 minutes on the trip's clock (`trips.tz`, else the destination's, else UTC), and the `proposed → confirmed` reply-by rule runs there too. `pre_trip → in_trip` is signalled by `trips.lifecycle_signal`, which fires on the first inbound final landing from the day before the first day or on a device arrival (`hatch_egg` `arrived`) from 00:00 on the first day. The organiser's `start_trip` can also start it, and 12:00 local on the first day is the fallback. The return landing counts only when the final leg lands where the traveller's first leg on the trip left from, on or after the last day; an earlier one (a member leaving early) waits for midnight. Side effects today: `trip.status_changed` queues egg grants (`critter.grant_eggs`) and the leave-by recompute, which arms the day bundles. Flight watches are armed when a flight is added, not at `pre_trip`. Location trip mode, the crew-map window and Home read the synced status. Not built yet: the recap job, settle nudges at `post_trip`, perks pausing at `archived`, and the reply-by close's RSVP sweep and Viator hold conversion.

`setup_step`: `when → budget → rooms → must_dos → done` (rooms skippable; organiser locks each). `phase` (generated): `planning` (voting…confirmed), `pre` (pre_trip), `in` (in_trip), `post` (post_trip, archived), `cancelled`.

### 3.2 Poll

| State | Next | Notes |
|---|---|---|
| `open` (stage `board`) | `open` (stage `final`), `closed`, `cancelled` | destination only has stages; board → final rule is server config |
| `open` | `closed` | `closes_at` job, all eligible voted, or decider policy satisfied (C41); `closes_at ≤` earliest Viator hold expiry |
| `closed` | — | `winner_option_id` set; late ballots → `cmd_results.code='VOTE_CLOSED'` |
| `open` | `cancelled` | organiser, or referenced ChangeSet went `stale` |

### 3.3 Boost

`boost_intents`: `open → purchasing → fulfilled | expired | cancelled` (one open per trip). `trip_boosts`: `scheduled → active → ended`; `active|scheduled → moved` (trip cancelled; new row `source='moved'` on next trip) or `→ credit` (no next trip → `boost_credits`); `active → revoked` (refund/revoke webhook; IOUs already settled stay settled, a reversal ledger entry is written for unsettled IOUs). `ends_at` recomputed on trip date change.

### 3.4 Encounter

`idle → accruing` (enter radius; dwell counts in background) `→ ready` (dwell ≥ `dwell_s`) `→ befriended` (optional hold ceremony or accessible tap; evidence queued). `accruing|ready → draining` (left radius; grace then slow drain) `→ accruing` (return) or `→ wandered_off` (ring drained to 0). Server verification: `befriended.verification = pending → verified` (creates `collection_entries`) or `→ revoked` (UX: "this one slipped away", entry removed). The device reducer is `reduceEncounter` in `packages/domain/src/critters/encounter-machine.ts`; the server row keeps `accruing → befriended | wandered_off | abandoned` (doc delta; contracts in [api-contracts-critters.md](./api-contracts-critters.md)).

### 3.5 Viator supplier order

| State | Next | Trigger / copy rule |
|---|---|---|
| `cart_draft` | `holding`, `hold_not_provided` | `/bookings/cart/hold` (≤16 items); `HOLDING` + `validUntil` → "Price held until 14:32" / "Seats held until …" only if availability `HOLDING` |
| `holding`, `hold_not_provided` | `awaiting_payment`, `hold_expired` | payer opens Viator payment iframe (3DS); `hold_valid_until` job |
| `awaiting_payment` | `booking`, `payment_failed` | iframe result |
| `booking` | `confirmed`, `pending_operator`, `rejected` | book response; `pending_operator` → "Waiting for the operator" |
| `pending_operator` | `confirmed`, `rejected` | `/bookings/status` poll (≥ 3 min interval) |
| `confirmed` | `cancel_requested → cancelled` | cancel quote then cancel; "Cancelled · full refund" only after success |
| `confirmed` | — | voucher → `bookings(source='viator')` + expense (paid_by payer) |

### 3.6 Other one-line machines

- **RSVP** (`trip_participants.rsvp`): unopened → opened → maybe | in | out; waitlisted → in (offer accepted). `out` frees a seat → `seat_waitlist_offers`.
- **ChangeSet**: draft → proposed → voting → approved → applied | rejected; applied → reverted; any → stale (base version superseded).
- **GuideAction**: planned → needs_approval → running → done | failed; done → undone (compensation).
- **LeaveBy**: scheduled → window (LA live) → alerting → departed | cancelled.
- **Subscription**: active → grace | billing_retry → on_hold → expired; paused; cancelled_active → expired; revoked.
- **Account** (`users.status`): anonymous → registered → closed (30 d) → purged | restored → registered.
- **Help session**: open → responding → resolved.
- **Photo upload**: pending → uploaded | failed (retry queue).

---

## 4. PowerSync Sync Streams

Service: self-hosted PowerSync Open Edition (Railway SG), Postgres bucket storage, JWKS from Better Auth (`aud` includes `sync`, 15-min EdDSA JWT). Config is authored per area in `infra/powersync/streams/<area>.yaml` and merged by `infra/powersync/build-config.ts` into the generated `infra/powersync/sync-streams.yaml` (never hand-edited); exact YAML syntax is pinned during the sync spike against the PowerSync version in use. Every query filters `deleted_at IS NULL` where the table has it. Streams contain only published tables.

| Stream | Subscribe | Parameters | Tables (rows) |
|---|---|---|---|
| `me` | auto | `auth.user_id()` | own rows: `users`, `user_settings`, `taste_profiles`, `passes`, `avatars`, `app_icon_unlocks`, `guide_skins`, `saved_items`, `saved_lists` (doc delta), `past_trips`, `phrase_progress`, `referrals`, `poll_reveals`, `room_prefs` (doc delta), `import_candidates`, `receipts`, `eggs`, `encounters`, `collection_entries`, `stickers` (user), `xp_ledger` (user), `reminders`, `recap_views`, `stamps`, `devices`, `alarms`, `notifications` (30 d), `notification_prefs`, `ping_ledger`, `roundups`, `inbox_items`, `scheduled_deliveries`, `nudges` (sent and received), own `trip_participants` (countdown), `subscriptions`, `code_redemptions`, `user_entitlements`, `usage_counters` (user), `paywall_impressions`, `rating_prompts`, `idea_votes`, `feedback_tickets`, `consents`, `account_deletions`, `data_exports`, `cmd_results` |
| `crews` | auto | crews where caller has active `crew_members` | `crews`, `crew_members`, `crew_contact_cards`, `crew_inbound_addresses`, crew-visible `import_candidates` (doc delta), `trips` (headers), `ledger_entries` (every entry of the crew, trip or not; doc delta), `payments`, `boost_credits`, `crew_year_grants`, `ftf_grants`, `stickers`/`xp_ledger` (crew), `home_tips` (active) |
| `crew_people` | auto | users sharing an active crew | co-members' `users` (C1 columns only — `users` has no C2/C3 columns beyond settings in separate tables), `taste_profiles` (unless hidden), `passes`, `avatars`, `stamps`, `crew_collection_counts` rows (a table kept server-side; none for members hiding their collection) |
| `crew_invites` | auto | same crews | `invites` (status fields), `join_codes` |
| `crew_chat` | auto | same crews (active, or former with keep_in_chat) | `messages`, `message_reactions` |
| `crew_polls` | auto | same crews | every `polls`, `poll_options`, `ballots` and `pitches` row of the crews (a trip poll is readable by the whole crew, like a crew poll; Home and chat need them without opening the trip) |
| `trip` | client subscribes per trip (auto for all non-archived trips from `crews`; archived on open, ttl 7 d) | `subscription.parameter('trip_id')` + `app.is_trip_member` equivalent subquery | `trips`, `trip_participants`, `pitches`, trip `polls`/`poll_options`/`ballots`, `date_window_options`, `availability_summaries`, `trip_budget_aggregates`, `budget_plans`, `room_plans`, `room_assignments`, `must_dos`, `price_quotes`, `cost_components`, `share_calcs` (own), `proposals`, `proposal_versions` (own; all if organiser), `proposal_reactions`, `hype_aggregates`, `seat_waitlist_offers`, `anonymous_suggestions`, `itinerary_versions`/`plan_days`/`plan_items`/`change_sets` (visibility=crew), `guide_actions`, `guide_offers`, `guide_offer_claims`, `comments`, `comment_plus_ones`, `swipe_sessions`, `swipe_yes_votes`, `swipe_matches` (never `swipe_votes`: a "no" stays its voter's; doc delta), `activity_events`, `bookings` (crew + own personal), `booking_attachments`, `flight_segments`, `supplier_orders`/`_items`, `ride_quotes`, `rides`, `providers`, `expenses`, `expense_shares`, `expense_edits`, `quests`, `quest_signups`, `quest_progress`, `recaps`, `recap_awards`, `stamp_signatures`, `photos`, `album_picks`, `memories`, `memory_reactions`, `postcards`, `postcard_mailings`, `leave_bys`, `readiness`, `location_shares`, `meetups`, `help_sessions`, `disruptions`, `watch_items`, `packing_items` (shared + own), `participant_dietary_flags`, `boost_intents`, `trip_boosts`, `trip_entitlements`, `usage_counters` (trip), `eggs` (hatch status), `eggs` (hatch status; doc delta) |
| `trip_draft` | client subscribes when caller is organiser | trip_id + organiser check | `itinerary_versions`/`plan_days`/`plan_items`/`change_sets` with visibility=organiser, `agent_jobs` for the trip, `redraft_reservations` (doc delta) |
| `trip_me` | with `trip` | trip_id + `auth.user_id()` | `briefings`, `briefing_items` (per viewer), `personal_plan_ops` (own; doc delta) |
| `trip_pack` | with `trip` (pre_trip/in_trip) | destination of trip | `pois` (destination, editorial only: the open-data long tail stays server-side for HTTP search), `facilities`, `weather_snapshots`, `crowd_forecasts`, `map_regions`, `spawn_rules` (as `trip_spawns`) |
| `catalog` | auto | none (global) | `guides`, `destinations`, `phrase_cards`, `emergency_numbers`, `critter_sets`, `critters`, `critter_forms`, `legendary_windows` (name-free: names stay in `critter_names` and reach a user only through their own `collection_entries` once found; doc delta), `products`, `perks`, `client_config` |
| `fx` | auto | uid (home, crew settlement and trip currencies) | `fx_snapshots` for the user's own currencies: a per-user filter can't share a stream with the parameterless `catalog` queries, and streams can't filter on `now()`, so the currency filter bounds volume instead of a 30-day window |
| `explore` | on demand | destination_id | `pois` (editorial only), `place_tips` (approved, filtered on its own `destination_id`, every column but `author_id`; doc delta) |
| `community` | on demand | shared_plan_id / destination | published `shared_plans`, `ratings` |
| `help` | on demand | locale | `help_articles`, `ideas` |
| `guide_chat` | auto | own | `guide_threads`, `guide_messages` (last 90 d), `queued_guide_questions`, `custom_phrase_cards` (own), `phrase_progress` (doc delta: synced here) |

Write path: all client writes go to the local insert-only `commands` table → `uploadData` → `POST /sync/upload` (batch) → each op runs its command handler in `withUser`; results land in `cmd_results` (stream `me`). Optimistic local rows are written to local-only overlay tables and reconciled when the server row replicates. Account switch (uid change) → `disconnectAndClear()`.

Failure rules: migrations are expand/contract; never drop or rename a published column before the stream config stops referencing it; publication changes ship in their own migration; the sync spike includes a PlanetScale failover drill (logical slot survives).

---

## 5. Realtime channels (Centrifugo)

Presence/ephemeral data never touches PowerSync. Channel auth via subscribe proxy to `api` (same policy fns).

Canonical catalogue: [api-contracts-async.md §1.2](./api-contracts-async.md). Data-model-relevant rules:

| Namespace | Data source | Privacy rule |
|---|---|---|
| `user:#<uid>` | `rt_outbox` (job progress from `agent_jobs.steps`, private guide thread events, entitlement/usage change, `cmd.result`) | only channel allowed to carry owner-only hints |
| `crew:`, `crew_chat:`, `crew_money:`, `crew_bookings:`, `crew_collection:` `<crew_id>` | `rt_outbox`; typing via publish proxy on `crew_chat` | hints only; rows sync via PowerSync |
| `trip:`, `trip_setup:`, `trip_draft:`, `trip_plan:`, `trip_dayof:`, `trip_watch:`, `trip_quests:`, `trip_album:`, `trip_copresence:` `<trip_id>` | `rt_outbox` | budget only as band (k ≥ 4); copresence counts, no coordinates |
| `trip_presence:<trip_id>` | client publish proxy (≤5 Hz) | ephemeral, no history |
| `trip_locations:<trip_id>` | worker from `location_fixes` / `member_etas` | subscribers need open `location_shares` window or Help/SOS session; boost-gated for crew map |
| `poll:`, `swipe:`, `proposal:`, `guide_thread:`, `disruption:`, `sos:`, `recap:`, `memory:` `<id>` | `rt_outbox` / worker | `proposal` never carries per-person opens (C28) |

Membership change → `rt_outbox(kind='unsubscribe'|'disconnect')` in the same txn.

---

## 6. Retention and purge jobs (pg-boss, catalogue in api-contracts-async §2.3)

| Queue | Cadence | Action |
|---|---|---|
| `maint.purge` | `30 3 * * *` SGT + minute-level sweep for `location_fixes` | fixes older than 15 min (except open SOS), visits/encounter-sample TTL, `invite_prefill`, `inbound_emails` raw, receipts/menu images, `cmd_log` 30 d, `cmd_results` 14 d, `rt_outbox` 7 d after send, `domain_events` 400 d, `notifications` 90 d, R2 objects without `media_objects` row |
| `location.expire` | share TTL / last-day midnight | end `location_shares` past `ends_at`, purge fixes |
| `account.purge` | at `account_deletions.purge_at` | cascade purge (§1 Deletion) |
| `maint.anon_gc` | `0 4 * * *` | anonymous users inactive 90 d with no crew → purge |
| `maint.tokens` | `0 */6 * * *` | APNs broadcast channels past `delete_after`, LA token hygiene |
| `ops.backup` | `0 20 * * *` UTC | off-provider `pg_dump` → R2 |

---|---|---|
| `location.fixes_ttl` | every minute | delete fixes older than 15 min (except an SOS share open or ended < 24 h ago) |
| `share_windows.close` | every 5 min | end `location_shares` past `ends_at` |
| `visits.ttl`, `critter.retention` (encounter samples 7 d, encounter evidence 30 d), `invite_prefill.ttl`, `inbound_emails.raw` | hourly | per data-model retention |
| `cmd_results.gc`, `rt_outbox.gc`, `domain_events.gc`, `notifications.gc` | daily | per retention |
| `account.purge` | hourly | due `account_deletions` |
| `anon_user.gc` | daily | anonymous users inactive 90 d with no crew → purge |
| `media.orphans` | daily | R2 objects without `media_objects` row |
| `broadcast_channels.gc` | hourly | delete APNs channels past `delete_after` |
| `pg_dump.offsite` | nightly | dump to R2 (off-provider) |

---

## 7. Table → creating phase

Phase owns the migration that creates the table (later phases may add columns via expand migrations).

| Phase | Tables / objects created |
|---|---|
| 08 Core schema, authz + RLS backstop | roles, `app` helpers, `withUser`/`withSystem`, publication scaffold, `users`, `user_settings`, `crews`, `crew_members`, `trips`, `trip_participants`, `destinations`, `guides`, `activity_events`, `domain_events`, `cmd_log`, `cmd_results`, `rt_outbox`, `consents`, `media_objects`, `ops.admin_audit`, `ops_config` |
| 09 Auth, identity, anti-abuse | `auth.*`, `user_private`, `install_attributions` (skeleton), `account_deletions` |
| 10 Offline sync, commands, realtime | `infra/powersync` streams (initial), client `commands`/`local_private`, Centrifugo proxy |
| 11 Jobs, notification router, push | `pgboss` schema, `scheduled_events`, `devices`, `push_tokens`, `notifications`, `notification_prefs`, `ping_ledger`, `roundups`, `inbox_items`, `scheduled_deliveries`, `device_action_keys`, `ai_usage`, `ops.dead_letters` |
| 12 Entitlements, money & FX primitives | `products`, `perks`, `user_entitlements`, `trip_entitlements`, `usage_counters`, `fair_use_counters`, `fx_snapshots` |
| 13 LLM gateway, personas, tools | `llm` schema views, `agent_jobs`, `persona_packs`, `change_sets`, `guide_actions`, `guide_offers`, `guide_offer_claims` |
| 14 POI, map, routing | `pois`, `poi_embeddings`, `poi_live_checks`, `map_regions` |
| 15 Fares, weather, crowds | `price_quotes`, `fare_cells`, `weather_snapshots`, `crowd_forecasts`, `season_months`, `season_events`, `hazard_alerts`, `ops.supplier_calls` |
| 16 Cost & constraint engine | `cost_components`, `share_calcs` |
| 17 Back-office & ops | `ops.concierge_tasks`, `ops.approvals`, `ops.partner_adapters`, `ops.moderation_filings`, `ops.entitlement_grants`, `moderation_reports` |
| 18 Content factory | `content_releases`, `critter_sets`, `critters`, `critter_forms`, `critter_names`, `legendary_windows`, `spawn_rules`, `phrase_cards`, `emergency_numbers`, `facilities`, `help_articles`, `poi_hours_proposals`, `ops.content_reviews` |
| 20 Permissions, location, visits | `location_shares`, `location_fixes`, `member_etas`, `visits` |
| 21 Link resolver, deferred links | `join_codes`, `install_attributions` (claim fields) |
| 22 Onboarding | `taste_profiles`, `passes`, `stamps`, `avatars` |
| 23 Invites, crews, referral, seat cap | `invites`, `invite_prefill`, `referrals`, `seat_waitlist_offers`, `crew_contact_cards` |
| 24 Crew chat | `messages`, `message_reactions` |
| 25 Home, inbox, nudges | `saved_items`, `reminders`, `home_tips`, `nudges`, `app_open_hours` (doc delta); `inbox_items` fan-out columns |
| 26 Polls & destination vote | `pitches`, `polls`, `poll_options`, `ballots`, `poll_reveals` |
| 27 Trip setup | `calendar_sources`, `calendar_days`, `availability_asks`, `availability_summaries`, `date_window_options`, `budget_max_private`, `budget_defaults_private`, `trip_budget_aggregates`, `budget_plans`, `room_plans`, `room_assignments`, `must_dos`, `dietary_profiles`, `participant_dietary_flags` |
| 28 Drafting agent | `itinerary_versions`, `plan_days`, `plan_items`, `redraft_reservations` |
| 29 Plan views, collaboration | `comments`, `comment_plus_ones`, `personal_plan_ops`, `calendar_feed_tokens` (C3, server-only; doc delta) |
| 30 Explore | `swipe_sessions`, `swipe_votes`, `swipe_yes_votes`, `swipe_matches`, `place_tips`, `place_qna_summaries`, `saved_lists`, `sponsored_placements`, `sponsored_event_counts` |
| 31 Proposal, RSVP | `proposals`, `proposal_versions`, `proposal_reactions`, `hype_aggregates`, `engagement_events`, `private_guide_threads`, `anonymous_suggestions` |
| 32 Guide chat, metering | `guide_threads` (doc delta: group mode), `guide_messages`, `queued_guide_questions`, `phrase_progress`, `custom_phrase_cards` (doc delta), `guide_crew_turns` (doc delta) |
| 33 Money | `expenses`, `expense_shares`, `expense_edits`, `receipts`, `ledger_entries`, `payments`, `payout_methods`, `stickers` (doc delta: created here; critters extend its kinds), `ops.reveal_audit` |
| 34 Bookings wallet, imports, flights | `bookings`, `booking_attachments`, `flight_segments`, `flight_watches`, `import_candidates`, `inbound_emails`, `crew_inbound_addresses`, `inbound_sender_links` (doc delta), `mailbox_connections`, `insurance_policies` |
| 35 Supplier layer, rides, vendor comms | `supplier_orders`, `supplier_order_items`, `affiliate_clicks`, `affiliate_conversions`, `ride_quotes`, `rides`, `providers`, `ops.vendor_threads`, `ops.vendor_messages` |
| 36 Trip hub, day-of, leave-by | `briefings`, `briefing_items`, `packing_items`, `leave_bys`, `readiness`, `alarms`, `offline_bundles` (doc delta) |
| 37 Disruptions | `disruptions`, `watch_items` |
| 38 Help & SOS | `help_sessions`, `help_session_private` |
| 39 Crew live map | `meetups` |
| 40 Critters | `eggs`, `encounters`, `encounter_samples`, `collection_entries` (and new `stickers` kinds) |
| 41 Quests, XP | `quests`, `quest_signups`, `quest_progress` (trip), `xp_ledger` (own rows on me, crew rows on crews), `crew_xp` (crews; doc delta: a table) — `infra/powersync/streams/quests.yaml` |
| 43 Recap, stamps | `recaps`, `recap_awards`, `recap_views`, `stamp_signatures`, `anniversaries` |
| 44 Album, postcards | `photos`, `album_picks`, `memories`, `memory_reactions`, `postcards`, `postcard_mailings`, `mailing_addresses` |
| 45 You: profile, export, deletion | `app_icon_unlocks`, `guide_skins`, `past_trips`, `data_exports` (+ purge jobs) |
| 46 Monetization | `subscriptions`, `store_transactions`, `billing_events`, `boost_intents`, `trip_boosts`, `boost_credits`, `crew_year_grants`, `ftf_grants`, `codes`, `code_redemptions`, `paywall_impressions` |
| 47 Help centre, feedback, ideas | `feedback_tickets`, `ideas`, `idea_votes`, `rating_prompts` |
| 48 Live Activities | `device_activities`, `broadcast_channels`, `la_push_to_start_tokens` |
| 49 Notifications actions, widgets | `widget_push_tokens`, `installed_widgets` |
| 52 Community | `shared_plans`, `shared_plan_copies`, `ratings` |

Phases 01–07, 19, 42, 50, 51, 53, 54 create no tables (42 uses `guide_messages`/`phrase_progress`; 19 exports to PostHog/Grafana).

Note: `trip_participants.egg_id`, `bookings.supplier_order_id`, `expenses.boost_id` etc. are added as expand migrations by the phase that creates the referenced table.

---

## Unresolved questions

1. PowerSync Sync Streams: confirm subquery support for `crew_people` (users sharing a crew) on the pinned service version; fallback = denormalised `crew_member_users` table maintained by trigger.
2. `critter_public` projection vs streaming `critters` with names nulled per user: per-user name reveal needs a per-user row (`collection_entries` join on client) — confirm the client join is acceptable offline.
3. Offline C3 cache (`local_private`) refresh cadence and wipe on sign-out/account switch — confirm with the sync spike.
4. Budget band "k ≥ 4" and anonymous-suggestion "crew ≥ 4" thresholds are master [P] proposals; founder confirmation pending (Q-18 family).
5. Viator hold length in practice (`validUntil`) may be shorter than a group vote — poll `closes_at` clamps to it; confirm UX when `HOLD_NOT_PROVIDED` dominates.
