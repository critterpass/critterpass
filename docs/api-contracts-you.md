# Critterpass API contracts: You

Companion to [api-contracts.md](./api-contracts.md): profile, synced settings, the app icon choice and self-reported travel history. Tables live in [data-model.md](./data-model.md) §3.1 and §3.17; streams in [data-model-sync-and-privacy.md](./data-model-sync-and-privacy.md) §4 (`me`).

Status: server contract for the profile and settings screens (3n-1…3n-8). Stack: Hono + Zod, commands through the one registry (`/v1/cmd`, `/sync/upload`). Account deletion is covered below; data export is not covered here yet.

## Commands

| Command | Payload → result | Authz | Ent | Events | Surfaces |
|---|---|---|---|---|---|
| `update_profile` | `{name?, username?, languages?}` (at least one) → `{display_name, username, languages, username_changed_at, changed[]}`. The name follows the pass's given-name rules (`VALIDATION{field: name, reason}`; a blocked word → `CONTENT_REJECTED{field: name}`). The username is stored lower case, 3–20 of `[a-z0-9_.]`, no leading, trailing or doubled dot, not reserved (`VALIDATION{field: username, reason: too_short\|too_long\|invalid_chars\|dots\|reserved}`); unique regardless of case (`STATE_INVALID{reason: username_taken}`; of two racing users exactly one wins); one change every 30 days after the first (`STATE_INVALID{reason: username_cooldown, until}`). Languages are ISO 639 codes, at most 12, deduplicated in order | self | – | `profile.updated` (field names only) | A, O |
| `set_settings` | `{patch}` → `{changed[]}`. `patch` holds at least one of `chattiness` (quiet\|normal\|chatty), `talk_out_loud`, `leave_by_through_dnd`, `crew_chat_mode` (all\|mentions\|off), `price_display` (home\|local\|both), `time_format` (12h\|24h), `distance_unit` (km\|mi), `home_currency_override` (ISO 4217 or null), `hide_lockscreen_details`, `hide_taste_tags`, `hide_collection`, `audio`. Any other key → `VALIDATION`. `audio` (`music_enabled`, `music_volume`, `theme_mode`, `theme_id`, `sfx_volume`, `sfx_stickers`, `critter_voices`, `quiet_on_road`, `haptics`) is merged key by key, so two devices changing different sound settings offline keep both. The app language is not a setting here: `set_app_locale` writes it | self | – | `settings.changed` (keys only) | A, O |
| `set_app_icon` | `{icon_id, appearance?: auto\|light\|dark\|tinted}` → `{icon, changed}`. Records the icon the device switched to; the device's OS state stays the truth for what shows. A Pass+ style without Pass+ → `ENTITLEMENT_REQUIRED`; an earned icon not yet unlocked → `FORBIDDEN{reason: icon_locked}`. Choosing an earned icon marks its unlock seen | self | `icon_styles_all` for Pass+ styles | `profile.icon_changed` | A |
| `add_past_trip` | `{past_trip_id (uuid v7, client-made), place_id?, country (ISO 3166-1 alpha-2), month (YYYY-MM)}` → `{past_trip_id, added}`; a replay returns `added: false` | self | – | `past_trip.added` | A, O |
| `remove_past_trip` | `{past_trip_id}` → `{past_trip_id, removed}`; a soft delete, the row leaves the `me` stream. Not the caller's → `NOT_FOUND` | self | – | `past_trip.removed` | A, O |

Every command is open to anonymous accounts. A self-reported trip counts toward a person's trips and countries and shows as a self-reported stamp; it never counts toward critters (`travelHistory` in `packages/domain/src/you/history.ts`).

## Routes

| Route | Auth | Source | Cache |
|---|---|---|---|
| `GET /v1/me/username-available?u=` | S | `{username, available, reason: too_short\|too_long\|invalid_chars\|dots\|reserved\|taken\|null}` for the normalized name; the caller's own current username reads as available. Rate-limited per uid | none |

## Account deletion

| Command | Payload → result | Authz | Ent | Events | Surfaces |
|---|---|---|---|---|---|
| `request_account_deletion` | `{reason?: trips_over\|too_many_pings\|crew_moved_apps\|privacy\|something_else, source?: app\|web}` → `{deletion_id, requested_at, purge_at, instant, contact: {kind: email\|phone\|none, masked}}`. Closes the account at once: `users.status = closed`, an `account_deletions` row with the balances snapshot and `purge_at` (now + 30 days), open trips and crews the caller organises alone handed to the longest-standing member, live location stopped, push tokens parked, device action keys revoked, realtime disconnected, Apple and Google tokens revoked, every session ended (this request's included). An account nobody can sign back into (no verified phone, no Apple or Google link) gets `instant: true`: `purge_at` is now and its purge is queued | self | – | `account.closed`, `trip.organiser_transferred` | A |
| `restore_account` | `{}` → `{deletion_id, status: anonymous\|registered}`. Inside the grace window only (`STATE_INVALID{reason: not_closed\|grace_over}`); the account, its memberships and its push tokens come back as they were | self (the only command a closed account may run) | – | `account.restored` | A |

While an account is closed every other command answers `ACCOUNT_CLOSED` (403) on every door; after the purge the uid has no account left.

| Route | Auth | Source | Cache |
|---|---|---|---|
| `GET /v1/me/account` | S (answered while closed) | `{status: anonymous\|registered\|closed\|purged, deletion: {requested_at, purge_at} \| null}` | none |
| `POST /v1/me/deletion/purge-now` | S | For test devices that need to start again as a new person. Closes the caller's account if it is still open, then runs the purge at once: `{purged: true, user_id, deletion_id, purged_at}`. Every session of the account is ended, so the next call is 401. `FORBIDDEN{reason: production}` (403) whenever the server's `APP_ENV` is `production`. Six tries an hour per uid | none |

### The purge

`account.purge` runs hourly and erases every closed account whose `purge_at` has come, one transaction per account, through `purgeAccount` (`packages/db/src/account/purge.ts`); the purge route runs the same routine. What happens to each column that names a user is listed in `packages/domain/src/account/purge-policy.ts`, and a database test fails when a new column has no rule.

- The person's own rows are deleted: pass, stamps, critters and eggs, taste, avatar, settings, devices and push tokens, notifications and inbox, saved places, location, calendar, private budget and dietary data, guide threads, past trips, command log.
- In shared crews the membership becomes `former`; trips, plans, votes, expenses and the ledger stay under the same uid, which is now a `purged` user with no name, username, home or avatar ("former member").
- Chat messages the person sent keep their place with an empty body.
- Join codes and open invites the person handed out are revoked.
- What crewmates still owed the person is written off with one `adjustment` ledger entry per crew, currency and crewmate; what the person owed stays on the crew's balances. Every crew still sums to zero.
- Store and usage ledgers keep their amounts with the user column cleared.
- The sign-in identity is deleted (Better Auth user, sessions, linked Apple and Google accounts, verifications), so the same phone number or provider account signs up as a new person with a new uid.
- A crew or trip only that person was in stays in the database, unreachable by anyone.
- `media_objects` rows stay as the list of stored objects still to erase.

## Data deltas

- `users.languages text[]` (at most 12), `users.username_changed_at`.
- `user_settings.audio jsonb` (an object), `user_settings.home_currency_override` (ISO 4217).
- `app_icon_unlocks` (owner reads, system writes), `past_trips` (owner reads and writes, soft delete), `data_exports` (owner reads, system writes). All three sync on the `me` stream.
