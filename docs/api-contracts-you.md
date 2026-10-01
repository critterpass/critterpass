# Critterpass API contracts: You

Companion to [api-contracts.md](./api-contracts.md): profile, synced settings, the app icon choice and self-reported travel history. Tables live in [data-model.md](./data-model.md) §3.1 and §3.17; streams in [data-model-sync-and-privacy.md](./data-model-sync-and-privacy.md) §4 (`me`).

Status: server contract for the profile and settings screens (3n-1…3n-8). Stack: Hono + Zod, commands through the one registry (`/v1/cmd`, `/sync/upload`). Data export and account deletion are not covered here yet.

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

## Data deltas

- `users.languages text[]` (at most 12), `users.username_changed_at`.
- `user_settings.audio jsonb` (an object), `user_settings.home_currency_override` (ISO 4217).
- `app_icon_unlocks` (owner reads, system writes), `past_trips` (owner reads and writes, soft delete), `data_exports` (owner reads, system writes). All three sync on the `me` stream.
