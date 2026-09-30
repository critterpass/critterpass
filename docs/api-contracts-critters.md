# Critterpass API contracts: critters

Companion to [api-contracts.md](./api-contracts.md) §4.13 (hatch, Critterdex, encounters, legendaries). Shapes live in `packages/domain/src/critters/` (`commands.ts`, `evidence.ts`, `events.ts`, `queues.ts`, `realtime.ts`, `reminders.ts`); tables in [data-model.md](./data-model.md) §3.9.

**Privacy rules that every surface keeps**

- No command, event, realtime payload or table carries a coordinate from an encounter. The device evaluates spawns on its own (rules, windows and forms come from `trip_pack` and `catalog`). The server sees POI ids, times, distance bands (`0_10`, `10_25`, `25_50`, `50_plus` m) and aggregates.
- Evidence (the signed bundle and the attestation claim) lives in `encounter_evidence`. That table is C3, kept 30 days, never published, and has no `app_user`, `guide_reader` or `admin_reader` grant. `encounter_samples` is C3, kept 7 days, never synced, and has no lat/lng/geometry column.
- A crew sees counts only (`crew_collection_counts`), never anyone's entries. A member with `user_settings.hide_collection` has no counts rows at all.
- Names reach a user only on their own **verified** `collection_entries` rows (`critter_name`, `form_name`). A pending entry never carries a name.

## 1. Commands

Every command is idempotent by `op_id` and allows anonymous sessions. Rejections through `/sync/upload` return 2xx plus a `cmd_results` row (api-contracts §2.2).

| Command | Payload | Authz | Result | Events | Surfaces |
|---|---|---|---|---|---|
| `hatch_egg` | `{trip_id, trigger: arrived\|manual}` | on the trip (RSVP not `out`, or its organiser). `arrived`: trip `pre_trip`/`in_trip`. `manual`: trip `in_trip` and the caller's local date (device tz) ≥ `trips.start_date`; otherwise `STATE_INVALID` | `{egg_id, form_id, hatched}`. `hatched:false` means it had already hatched (another trigger or device). Grants the egg first if the traveller boarded without one | `egg.hatched` (N-15); the hatched form is filed as a verified `collection_entries(source='hatch')` and announced through `reward.fanout` | A, O |
| `start_encounter` | `{encounter_id (client UUIDv7), trip_id \| null, spawn_rule_id, poi_id \| null, started_at, offline}` | trip: on the trip, trip `pre_trip`/`in_trip`, rule in the trip's destination. `trip_id: null` = home set only: the rule's set country = `users.home_country` and `user_settings.explore_at_home`. `poi_id` must be one of `rule.poi_ids` (null only for a geofence-only rule) | `{encounter_id, started}`. Starting a new encounter marks any other active one `abandoned` (one active at a time). A replay returns `started:false` | `encounter.started` (trip encounters) | A, O |
| `report_encounter_samples` | `{encounter_id, samples[1..500]{at, distance_band, accuracy_m, speed_mps}, mock_flags}` | owner; encounter not yet befriended | `{stored}`. Duplicates (same `at`) are skipped. Cap is 5,000 samples per encounter (`PAYLOAD_TOO_LARGE` after) | – | O |
| `end_encounter` (doc delta) | `{encounter_id, outcome: wandered_off\|abandoned, ended_at, dwell_s}` | owner | `{encounter_id, ended}`. Only an active (`accruing`/`ready`) encounter ends | – | A, O |
| `befriend_critter` | `{encounter_id, ready_at, befriended_at, via: hold\|accessible, evidence_bundle, attestation}` (§2) | owner; encounter `accruing`/`ready` (or already `befriended`, which is a no-op); `started_at − 60 s ≤ ready_at ≤ befriended_at ≤ now + 5 min` | `{encounter_id, verification: 'pending'}`. Stores evidence, sets the encounter `befriended` / `pending`, files a pending entry (except `co_presence` rules) and queues `critter.verify` in the same transaction | `critter.befriended` once verified (see §3) | A, O |
| `set_guide_skin` (doc delta) | `{guide_id, form_id \| null}` | the form must be a verified entry of the caller (`NOT_ELIGIBLE` otherwise). `null` reverts to the canonical look | `{guide_id, form_id}` | – | A, O |
| `set_explore_at_home` (doc delta) | `{on}` | self | `{explore_at_home}` | – | A, O |
| `set_legendary_reminder` | `{window_id, on}` | self. `on` for an any-day or year-round window → `VALIDATION window_always_open` (`nextWindowSpan` returns `null`; every scan is bounded) | `{reminder_id, fire_at}`. One pending reminder per window; it fires 30 days before the next window start, at 09:00 in the device tz (the next morning when the window is less than 30 days away). `on:false` cancels it | `legendary.reminder_set`; N-30 via `legendary.reminder_due` | A, O |
| `grant_egg` (S, doc delta) | job `critter.grant_eggs {trip_id, user_id?}` | system | One egg per boarded traveller (RSVP `in`, or organiser not `out`) per trip. The form is the destination set's starter: the lowest-numbered critter's common form in the live release (`app.grant_egg`). Unhatched eggs of members now `out` are removed | `egg.granted` | S |

Error codes: `NOT_FOUND` (trip, encounter, spawn rule, guide, window; another user's encounter reads as not found), `NOT_ELIGIBLE` (`not_on_trip`, `not_home_set`, `explore_at_home_off`, `form_not_owned`), `STATE_INVALID` (`trip_not_travelling`, `trip_not_started`, `before_start_date`, `encounter_ended`, `encounter_resolved`), `VALIDATION` (`spot_not_in_rule`, `spawn_not_in_trip_destination`, `times_out_of_order`, `started_in_future`, `encounter_id_taken`, `window_always_open`), `PAYLOAD_TOO_LARGE` (`samples_full`).

## 2. Evidence bundle and attestation

```ts
evidence_bundle = {
  samples_hash: string;          // sha256 hex over the encounter's sample rows, in order
  dwell: { count, mean_accuracy_m, max_speed_mps, duration_s, inside_s };
  mock_flags: number;            // bitmask: 1 simulated, 2 external accessory (accepted), 4 implausible
  device_ts: string;             // device clock at capture
}
attestation =
  | { status: 'signed'; kind: 'app_attest' | 'android_keystore'; key_id; signature /* base64 */; integrity_token? }
  | { status: 'unavailable'; reason? }
```

- **What is signed:** `evidenceSigningPayload(encounter_id, bundle)` from `@cp/domain`. It is canonical JSON of `{encounter_id, evidence}` with sorted keys and no whitespace. iOS signs it with App Attest `generateAssertion` (`clientDataHash = sha256(payload)`) using the key attested at install. This needs no network.
- **Android:** the Keystore key is not registered with the server yet. Android sends `attestation.status = 'unavailable'` (or `signed` with an `integrity_token` added at upload). Both count as a soft signal, never a revoke.
- **Verification (`critter.verify`):**
  - Hard signals revoke:
    - a simulated or implausible mock flag;
    - a signature that does not verify against the key registered for `key_id`;
    - ground speed above 350 km/h since the traveller's previous verified find, with no flight of theirs landing in between;
    - `inside_s` < 90 % of the rule's `dwell_s`;
    - mean accuracy worse than 50 m.
  - Soft signals only flag the find for ops review:
    - attestation unavailable;
    - a GPS accessory;
    - clock skew above 10 min;
    - an upload more than 72 h after capture.
  - Thresholds live in `ops.ops_config` key `critters.verify`, and the defaults are in `packages/domain/src/critters/config.ts`.
- **Encounter constants:** radius 50 m, accuracy gate 35 m, hysteresis max(20 m, accuracy), grace 90 s, drain ⅓ of the fill speed, high accuracy within 150 m, co-presence overlap 60 s. The device reads them from `client_config` key `encounter`. Every field is optional, and invalid fields fall back to the defaults (`resolveEncounterConfig`).

## 3. Outcomes the app reads (PowerSync)

| Stream | Rows |
|---|---|
| `me` | own `eggs`, `encounters` (no evidence columns exist), `collection_entries`, `guide_skins`, `reminders`, `user_settings.explore_at_home` |
| `crew_people` | `crew_collection_counts {crew_id, user_id, critters, forms}` of the caller's crews |
| `trip` (`trip_id`) | every traveller's `eggs` on the trip (hatch status for the hub; all columns are C1) |
| `trip_pack` | `spawn_rules` of the trip's destination |
| `catalog` | `critter_sets`, `critters`, `critter_forms`, `legendary_windows` (all name-free) |

**Encounter row lifecycle:**

- `state`: `accruing` → `befriended` | `wandered_off` | `abandoned`.
- `verification`: `null` until befriended, then `pending` → `verified` | `revoked`.
- **Revoked:** the pending entry is deleted, so the app shows "This one slipped away".
- **Verified:** the entry flips to `verified` and gets its names. It keeps `found_at` = `befriended_at`.
- **`any_of` with `n > 1`:** the entry is only verified once `n` distinct places of the rule each have a verified dwell. Until then it stays pending.
- **`co_presence`:** no per-member entry at befriend. The crew grant writes every member's entry at once, all with one `found_at`.

## 4. Realtime

| Channel | Type | Payload |
|---|---|---|
| `crew_collection:{crew_id}` | `critter.befriended` | `{user_id, form_id, critter_id, entry_id}` (not sent for members hiding their collection) |
| `crew_collection:{crew_id}` | `first_spotter` | same, when nobody else in the crew had that critter |
| `trip_copresence:{trip_id}` (trip participants; history 10 for 24 h) | `copresence.progress` | `{rule_id, here, needed, missing[]}`. `missing` lists the trip's members who have not been there yet (participation, never location). No coordinates |
| `trip_copresence:{trip_id}` | `copresence.completed` | `{rule_id, form_id}` |

## 5. Jobs

| Queue | Trigger | Does |
|---|---|---|
| `critter.grant_eggs` | `rsvp.changed`, `participant.boarded`, `participant.declined`, `trip.status_changed` (hooked in the api and the worker) | grants the missing eggs of boarded travellers; removes unhatched eggs of members now `out` |
| `critter.hatch` | `flight.landed` | hatches each traveller on the leg unless they have another leg departing within 24 h of landing (a connection) |
| `critter.verify` | `befriend_critter` | scores the evidence (§2); verified → entry + names + `reward.fanout`; revoked → entry removed + `critter.revoked`; `co_presence` rules → `copresence.evaluate` |
| `copresence.evaluate` | verified co-presence befriend | grants all needed members (in participants who have hatched their egg or landed) when their verified dwells overlap ≥ 60 s; publishes `copresence.progress` |
| `reward.fanout` | every verified find | once per entry (`announced_at`): `critter.befriended` event (N-49 to the crew), crew hints and first spotter, then every registered reward handler with the same `granted_at` |
| `critter.crew_counts` | repair | recomputes one member's `crew_collection_counts` (triggers keep them current on finds, `hide_collection` and membership changes) |
| `reminders.conditional` | reminder timer | fires N-30 only while the condition holds (`window_active_not_found`: the window still starts on the stored date and the form is still unfound) |
| `reminders.reschedule` | content publish | moves pending legendary reminders whose window start changed |
| `critter.retention` | hourly | deletes samples after 7 days and evidence after 30 |
