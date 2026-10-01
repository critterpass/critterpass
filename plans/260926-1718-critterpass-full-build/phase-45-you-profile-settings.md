---
phase: 45
title: "You: profile, settings, icons, export, deletion"
status: in_progress
depends_on: [5, 12, 22, 33, 43, 47, 49]
wave: 21
features: [F-141, F-142, F-143, F-144, F-145, F-146, F-147, F-148, F-191]
screens: [3n-1, 3n-2, 3n-3, 3n-4, 3n-5, 3n-6, 3n-7, 3n-8, 3n-9, 3n-10, 3n-11, 3g-3]
tasks: 12
owns:
  - packages/domain/src/you/
  - packages/domain/src/account/
  - packages/db/src/schema/you.ts
  - packages/db/migrations/*_profile_settings_icons_history.sql
  - packages/db/migrations/*_data_exports.sql
  - packages/db/test/permissions/{app-icon-unlocks,past-trips,data-exports,user-settings-audio}.test.ts
  - packages/db/test/purge/
  - packages/content/voice-samples/settings/
  - tools/scripts/render-settings-voice-samples.ts
  - services/api/src/commands/you/
  - services/api/src/commands/account/
  - services/api/src/routes/me-account.ts
  - services/api/src/account/
  - services/api/src/admin/account/
  - services/api/test/you/
  - services/api/test/account/
  - services/worker/src/jobs/account/
  - services/worker/src/jobs/icons/
  - services/worker/test/account/
  - apps/admin/src/modules/account/
  - apps/mobile/modules/cp-app-icon/
  - apps/mobile/modules/cp-audio-session/
  - apps/mobile/src/lib/audio/
  - apps/mobile/src/features/you/          # except you/ping-settings/ (phase 49), you/android-permissions/ (phase 50)
  - apps/mobile/src/app/(tabs)/pass/index.tsx
  - apps/mobile/src/app/you/          # except you/plan/ (phase 46), you/pings.tsx + you/widgets.tsx (phase 49)
  - apps/mobile/src/app/account-closed.tsx
  - packages/i18n/locales/en/you/        # except pings.po (phase 49)
  - e2e/you/
---
# Phase 45 — You: profile, settings, icons, export, deletion

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2, D5 (voice samples via ElevenLabs owned voices), D11 (undesigned flows in code), D13, D17 (Resend), D18; C7 (stamp ink), C12 (settings voice samples free), C22, C23 (icons/avatars), C33, C36 (crew visibility copy on 3n-3), C38, C39; §3 icon styles row, lifecycle "expired = Pass+ styles revert on next foreground"; §7 Q-49, Q-86, Q-93, Q-94, Q-95 |
| `docs/data-model.md` | §3.1 (`users`, `user_private`, `user_settings`, `taste_profiles`, `passes`, `avatars`, `app_icon_unlocks`, `past_trips`, `saved_items`); §3.10 `stamps`; §3.8 `ledger_entries` (preflight); §3.17 (`account_deletions`, `data_exports`, `consents`) |
| `docs/data-model-sync-and-privacy.md` | §1 Deletion row (purge cascade), field encryption, logs redaction; §3.6 Account machine; §4 stream `me`, `crew_people`; §6 `account.purge`; table → phase (45) |
| `docs/api-contracts.md` | §4.1 `update_profile`, `set_avatar`, `set_settings`, `set_app_icon`, `request_data_export`, `request_account_deletion`, `restore_account`; §4.9 `write_off_debt`; §5.4 media presign (avatar); §5.5 `GET /v1/me/deletion/preflight`, `GET /v1/me/export/{id}`; §5.6 `GET /account/delete` (web, P51); §5.1 `/v1/auth/apple/authorization-code`; §3 `ACCOUNT_CLOSED` |
| `docs/api-contracts-async.md` | §2.2 `export.build`; §2.3 `account.purge`; §3 N-40, N-52; §5 device action keys revoke; §6 App Group (clear on deletion) |
| `docs/system-architecture.md` | §4 commands, §5 authz, extensions/native modules rules |
| `docs/design-system.md` | odometer, stamp slam, hold ring, toggle knob spring, alternate icons row (FACE, PASSPORT default, STAMP Pass+, STICKER × light/dark/tinted + earned) |
| Reports | `design-analysis-260926-1143-you-community-help-report.md` §2 3n-1…3n-11, §4–§8; master §2 F-141…F-148, F-191, §0.2 C23/C35/C36, §9 native row "Alternate app icons", §6.2 transactional email row; `researcher-260926-1143-native-platform-monetization-report.md` (alternate icons, Android activity-alias) + fact-check claim 31 (icon alert, Icon Composer) |
| Phase inputs | P05 `exportPng` + icon bake (`APP_ICON_IDS`, 10 icons × 3 appearances; Android adaptive/monochrome); P06 feedback bus (SFX/haptics categories) + motion presets; P07 settings rows, toggles, segmented, sheets, hold ring; P09 sessions, `revokeApple(uid)`, `account_deletions` table + `ACCOUNT_CLOSED` guard; P12 `usePriceFormatter`, entitlements (icon styles); P20 `PermissionsSection`; P22 `set_avatar` handler, airport search, taste retake, passes; P33 balances, `write_off_debt` contract; P40 collection (owned forms), earned icon triggers; P43 stamps; P46 `you/plan` route, billing source for preflight |
| Renders | `docs/design-renders/screens/3n-1_Profile.png` … `3n-11_Account_closed.png`, `3g-3_Crews.png` |

## Overview
Goal: the PASS tab becomes a living passport (stats, stamps, taste, crews, MRZ) with full profile editing, a settings framework (synced vs device prefs), guide sound and music, in-place language/currency switching, alternate app icons, GDPR data export, and store-compliant account deletion with a 30-day undo and a verified purge.
Done when: every 3n screen and its designed motion runs on iOS and Android against real synced data; locale switches in place without restart; icons switch on both platforms with Pass+/earned gating and lapse revert; an export zip is delivered by link (push + email/SMS); a deleted account is closed immediately, restorable within 30 days, and a Testcontainers purge test proves C3 rows deleted, C1 rows anonymised as "former member" and SIWA revoked.

## Requirements
### F-141 Profile (3n-1)
- Passport layout per render: ← HOME, EDIT / SETTINGS pills; 84 px avatar with rarity ring (C6: rare blue `#4f86ff`, epic pink, legendary gold; render's green ring is a fixture error); name 44 px Archivo 70 %; "@username · home city"; PASS+ chip (P46 route; hidden for free — design in code: subtle "GET PASS+" outline chip, explicit navigation, governor-exempt) + avatar form chip; stat tiles TRIPS / COUNTRIES / CRITTERS (odometer count-up 700 ms ease-out cubic); STAMPS row (P43 stamps, rotated −8/6/−4/9°, overlap −6 px, destination colour C7; upcoming dashed "IN n DAYS" stamps itself on arrival); HOW YOU TRAVEL chips + RETAKE (P22 retake sheet); YOUR CREWS rows (stacked initials, status line from crew/trip state); MRZ footer `P<{ISO3}{NAME}<<{PASSNO}` + "SINCE {member_since year}".
- Motion: avatar sticker `bob` 2600 ms, eyes follow scroll offset (P05 eye-target param), stamps land staggered 80–120 ms with thud SFX + haptic (respect 3n-7 toggles); Reduce Motion → static.
- Undesigned states (design in code): new user 0 trips (home stamp No.1 only, empty-stats copy), anonymous unsaved pass banner "Save your pass" (→ P09 upgrade), no crews ("Start a crew" row), loading skeleton, offline cached, many stamps (ALL n › → stamps list screen), stamp tap → trip recap (P43) or trip hub.
- Crew visibility (C36): co-members see profile via `crew_people`; hidden taste/collection per `user_settings`.

### F-191 Travel history & stats (3n-1, 3g-3)
- Counts computed from in-app data: trips = trips with participant RSVP in and phase post/in; countries = distinct destination countries of those + home; critters = distinct locals (C22). Stamps list screen (undesigned): chronological, filter by year, each opens recap.
- Manual back-fill (Q-49): "Add a past trip" (place search P14/P22, country, month) → `past_trips` → stamp marked **self-reported** (dashed outline + "SELF-REPORTED" micro label), counts toward trips/countries, never critters; edit/delete; "SINCE {year}" = min(member_since, earliest past trip).
- 3g-3 crew list past-trip lines read the same history helper (P23 owns 3g-3 UI; this phase exports `useTravelHistory`).

### F-142 Edit profile (3n-3) + avatar (3n-4)
- 3n-3: fields NAME, USERNAME (live availability, debounced 300 ms; rules 3–20 `[a-z0-9_.]`, reserved words; change limited to once per 30 d → `STATE_INVALID{username_cooldown}`), HOME AIRPORT (P22 airport search; side effects: home country/currency default, sheet explains prices by home airport), LANGUAGES (multi-select from 16 app locales + ISO-639 list; feeds guide phrase behaviour); LOOK: app icon row "{style} · {k} of {n} unlocked" (fixture "Classic/5 of 9" replaced by real catalog counts); footer C36 copy; SAVE → `update_profile` → toast "Profile saved."; unsaved-changes guard; offline → queued command with pending chip.
- 3n-4: big preview + "HOW THE CREW SEES IT" (chat bubble + map pill minis); INITIALS / CRITTER / PHOTO tabs. CRITTER grid of owned forms (P40 `collection_entries`) with rarity rings; locked tiles = silhouettes with unlock hint toast + shake 420 ms; pick animates scale .85→1.06→1 420 ms. INITIALS (design in code): initials + colour from the 6 accents. PHOTO (design in code): system photo picker (limited access), square crop, upload via presign `purpose=avatar`, moderation (P17 queue; pending shows initials to others), "Photos only show inside your crews." Zero critters → initials default. DONE → `set_avatar` (P22 handler) → avatar render job produces static PNG for OS surfaces (communication notifications, LA, widgets) → toast "New avatar. Your crews see it everywhere." Avatars never gated (C23).

### F-143 Settings framework (3n-2, 3n-6)
- Registry `features/you/settings/registry.ts`: each row `{key, scope: synced|device, section, component, owner}`; synced → `user_settings` via `set_settings` (optimistic, offline queue); device → MMKV. Sections: YOUR GUIDE (chattiness QUIET/NORMAL/CHATTY + voice sample, Talk out loud), NOTIFICATIONS (leave-by alarms "Can ring through Do Not Disturb", crew chat level, "How much we ping ›" → P49, Widgets › → P49), PRIVACY (Location › → P20, Find bookings in my email → P34 (Pass+ locked state → 4e-1 explicit), Budget max read-only "Private", hide taste tags, hide collection, lock-screen details Q-86), OFFLINE (P36 pack row: downloading/failed/out-of-storage/none), SOUND ›, APP (music summary with live bars, sound effects toggle, Language and currency ›), HELP AND FEEDBACK (P47 rows), ACCOUNT (Download my data, Sign out, Delete account), footer Tokek wiggle + version; tap Tokek 5× plays his theme (easter egg).
- Plan chip "PASS+ · YEARLY ›" → P46 `you/plan`.
- Chattiness sample: pre-rendered TTS per guide × level × locale (AI-41), played on change; loading/offline state falls back to text bubble.
- Permission-denied rows: mount P20 `PermissionsSection` ("Off in iOS Settings" + deep link), AlarmKit/exact-alarm denied state.
- Sign out: confirm sheet; anonymous unsaved account → strong warning "This pass isn't saved. Signing out erases it." with Save first CTA; sign-out calls Better Auth signOut, PowerSync `disconnectAndClear()`, clears App Group snapshots, unregisters push token.
- Header collapses large → inline 44 px on scroll; toggles knob spring overshoot ~1.1.

### F-144 Sound & music themes (3n-7)
- Audio engine `apps/mobile/src/lib/audio/`: expo-audio, iOS session ambient + mixWithOthers (respects silent switch, never stops user audio), Android `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` equivalent → mix; no background audio.
- Music: toggle, volume slider (sample phrase while dragging), theme carousel (one per live guide + guest theme; follow-guide default: changes on landing via trip phase; tapping a card previews with 700 ms equal-power crossfade and pins it; "Follow my guide" chip restores), themes streamed from R2 and cached; missing themes (Q-94) show "Coming with {guide}" disabled card only if the asset is absent in content release.
- Effects: volume, Stickers and stamps, Critter voices, Quiet on the road (mutes 22:00–07:00 in trip tz while on a trip, and while inside a place-of-worship POI geofence detected in foreground via P20 visits/POI category), Haptics toggle — all consumed by P06 feedback bus.
- States: silent switch on hint (iOS), another app playing (mix, lowered volume), theme not downloaded/offline, music off (carousel disabled). Title bars animate with playing theme tempo (stagger 140 ms, 900 ms).

### F-145 Language & currency (3n-8)
- 16 app locales (P03 list). Pick → Lingui `activate` in place (text crossfade, no navigation), persisted in `user_settings.app_locale`; native strings/extensions read locale from App Group; iOS per-app system language changes are respected on next launch (in-app choice wins when set). Guide speaks one sample line in that language (pre-rendered, AI-41). RTL locales flip layout with `I18nManager` requiring reload → design in code a one-tap "Restart to switch direction" state.
- Currency: home currency picker (ISO-4217 list, default from home airport), HOME / LOCAL / BOTH segmented → `price_display`; sample "Rp 75.000 ≈ S$6.40 · Tirta Empul" re-rolls with odometer; every price in app follows via P12 `usePriceFormatter`; FX as-of label when stale (> 48 h) or never fetched offline.
- FORMATS: 12/24-hour, km/mi pickers (design in code). Footer: "Balances split in the crew's currency. Rates work offline." Explanatory state when home ≠ crew currency.

### F-146 Alternate app icons (3n-5, 4e-3)
- Catalog `packages/domain/src/you/app-icons.ts`: styles FACE (free), PASSPORT (default, Q-93), STAMP (Pass+), STICKER (free) × appearances AUTO/LIGHT/DARK/TINTED (AUTO = Icon Composer layered `.icon` following system; LIGHT/DARK/TINTED = forced variants shipped as separate alternate icons); earned: TEMPLE, SARDI, HOME SET, PON, GOLDEN, crew icon (e.g. BALI SIX) with unlock rules from content release; all bundled in binary (P05 bake).
- `cp-app-icon` module: iOS `setAlternateIconName` (system alert is unavoidable; show preview squash animation before), Android `activity-alias` enable/disable with themed monochrome icons (warn once that some launchers drop pinned shortcuts), unsupported → hide screen section with explanation.
- Gating: STAMP requires Pass+ (tap without → 4e-1 explicit); earned locked → shake + "how to earn" toast; "none of them can be bought". Unlocks: worker job `icons.unlock` on `collection.form_found`, `crew.achievement` (crew icon unlocks for all members at once), `stamp.home_set` → `app_icon_unlocks` → "NEW" badge + celebration on next visit.
- Lapse: on foreground, if current icon is Pass+ and `passPlus` false (expired, not paused) → revert to PASSPORT + toast; paused keeps styles.
- Motion: preview swap scale .82→1.08→1 420 ms + squash once per selection; tile pop; locked shake.
- `set_app_icon` records choice (server audit + restore on reinstall); device OS state is the source of truth for the actual icon.

### F-147 Data export (3n-6, 3n-9)
- `request_data_export` (1 active at a time, 1 per 24 h) → `export.build`: JSON per domain (profile, settings, taste, crews, trips, plans authored, chat messages authored, expenses/ledger involving user, bookings, stamps, critters, consents, feedback) + user media (avatars, photos uploaded) + chat transcript per crew (own messages + context lines as permitted: own only) → zip to R2 `exports/{uid}/{id}.zip` (encrypted at rest), signed link via media Worker, expires 7 d.
- Delivery: N-40 push + email (Resend) or SMS/in-app inbox for phone-only; UI states queued/building (progress via `user:#uid job.progress`)/ready/expired/failed with retry.
- Excludes other users' C3 data and supplier content.

### F-148 Account deletion (3n-9, 3n-10, 3n-11)
- 3n-9 preflight (`GET /v1/me/deletion/preflight`): GOES list with real counts; THE CREW KEEPS list; per-crew balances (owed to you → "Settle up first, or {crew} keeps it"; you owe → "You owe {amount}. It stays on the crew's balances under 'former member'."), organiser roles on active/upcoming trips (auto-transfer to the longest-standing IN member at close; sole member crews archived), active trip warning, Boost IOUs outstanding, subscription source copy (App Store / Google Play / gift: "Deleting doesn't cancel it" + Manage subscription), anonymous account → instant delete path; Tokek rock loop; lists reveal 460 ms stagger 80 ms; owed card slides last + nudge; "Download my data first".
- 3n-10 hold sheet: optional reason chips (+ SOMETHING ELSE free text, design in code), 86 px hold ring 3000 ms linear, stickers peel at thresholds with rip SFX, early release drains 450 ms + slap back + haptic, completion heavy haptic; a11y alternative: explicit "Delete account" confirm button with VoiceOver; offline/failure → error state, never shows 3n-11.
- `request_account_deletion`: `users.status=closed`, `account_deletions` row (purge_at = now + 30 d), revoke all sessions (Better Auth), `rt_outbox` disconnect, revoke device action keys, end LAs, disable push tokens, stop location shares, organiser transfer, crews render "former member" at purge (name kept during grace, status dot "away"). Confirmation N-40 email or SMS (phone-only) + N-52 reminder at purge − 3 d.
- 3n-11: paper page, EXIT stamp slam + page thud, date purge "Nothing is erased until {date}" + retention line "Encrypted backups roll off within 35 days after that" (off-provider pg_dump 35 d, PITR ≤ 30 d; system-architecture Backups row), masked email/phone, critter row fading to 50 %, UNDO → `restore_account` → ENTRY stamp over EXIT → Home; Close → signed-out splash.
- Relaunch or sign-in while closed → `account-closed` restore interstitial (design in code); sign-in after purge → fresh-account message.
- Purge job (`account.purge`, hourly): C3 tables hard-delete; media R2 delete; C1 authored rows re-attributed to former member (`users.status=purged`, display_name cleared, avatar removed); C5 `user_id` NULL (`store_transactions`); amounts owed **to** the user written off via `write_off_debt` (system); debts owed by the user stay as former-member balances; SIWA + Google tokens revoked; `consents` anonymised audit; PostHog person deletion; Sentry user data none by design. External stores, each a purge step with retry: Langfuse traces deleted by `userId` (Langfuse API); Linear issues/attachments from P47 feedback redacted (reporter identity + description replaced, attachments deleted) and their R2 media deleted; R2 `exports/{uid}/*` deleted; Better Auth `user`/`session`/`account`/`verification` (+ phone/anonymous plugin rows) deleted; PowerSync bucket data for uid invalidated (rows deleted → buckets drop them; `me` stream checksum reset); Resend contact/log deletion via API; Twilio Verify / Prelude records — no stored PII beyond provider log retention (provider-side, documented in privacy copy). Backups: not rewritten; restore procedure re-runs purge for every `account_deletions.status=purged` uid before a restored DB serves traffic.
- Web deletion `GET /account/delete` page is P51; it calls the same command after sign-in.

## Architecture & contracts
| Area | Delta |
|---|---|
| Migration `<ts>_profile_settings_icons_history.sql` | `app_icon_unlocks`, `past_trips` (data-model §3.1); expand `users.languages text[]`, `users.username_changed_at`; expand `user_settings`: `audio jsonb {music_enabled, music_volume, theme_mode, theme_id, sfx_volume, sfx_stickers, critter_voices, quiet_on_road, haptics}`, `home_currency_override`, `app_icon` (last chosen); **doc delta** (data-model §3.1) |
| Migration `<ts>_data_exports.sql` | `data_exports` (§3.17) |
| RLS | `app_icon_unlocks` O read / S write; `past_trips` O; `data_exports` O read / S write; username uniqueness via citext uk |
| Streams | `me` already lists `app_icon_unlocks`, `past_trips`, `data_exports`, `account_deletions` |
| Commands | `update_profile`, `set_settings`, `set_app_icon`, `request_data_export`, `request_account_deletion`, `restore_account`, `write_off_debt` (system path); **doc delta**: `add_past_trip {place_id?, country, month}`, `remove_past_trip {id}`, `check_username` read `GET /v1/me/username-available?u=`, `sign_out_device {}` |
| Routes | `services/api/src/routes/me-account.ts`: preflight, export fetch, username availability |
| Jobs | `export.build`, `account.purge` (hourly), `account.purge_reminder` (N-52, doc delta), `icons.unlock`, `avatar.render` (P22 job reused) |
| Push/email | N-40 (email + push; SMS for phone-only via P09 sender router), N-52 |
| Native | `cp-app-icon` (Swift + Kotlin); audio via expo-audio; `cp-audio-session` only if expo-audio cannot set ambient + mixWithOthers (T5 step 1 decides) |
| Admin | `apps/admin/src/modules/account/` deletion panel (requested, purge_at, restored, purged; force-purge for legal requests with reason) registered into P17 user detail slot |
| Content | `packages/content/voice-samples/settings/manifest.json` (guide × chattiness × locale, language lines) rendered by `tools/scripts/render-settings-voice-samples.ts` via ElevenLabs owned voices → R2 |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Support.dc.html`, `docs/design-renders/pages/Ops-Support.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-queues-people-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| Deletion panel states NONE → REQUESTED → RESTORE 30 D → PURGED, last export | panel reads `account_deletions` + `data_exports`, laid out as in the render |
| Force-purge for legal requests | name it `force_purge_account {uid, reason}` (owner) and add to §4.17 |

## Tasks
### T1 — Schema deltas, commands, permission tests
- Goal: data + write paths for profile, settings, icons, history.
- Files: `packages/db/src/schema/you.ts`, `packages/db/migrations/<ts>_profile_settings_icons_history.sql`, `packages/db/test/permissions/{app-icon-unlocks,past-trips,user-settings-audio}.test.ts`, `packages/domain/src/you/{settings-schema,username,app-icons,history}.ts`, `services/api/src/commands/you/{update-profile,set-settings,set-app-icon,add-past-trip,remove-past-trip}.ts`, `services/api/src/routes/me-account.ts` (username availability), `services/api/test/you/*.test.ts`.
- Steps: 1. Expand migrations. 2. zod schemas (settings patch whitelist). 3. Handlers with authorize/entitle (STAMP needs Pass+ or unlock). 4. Username rules + cooldown + availability endpoint.
- Tests: `pnpm --filter @cp/db test -- permissions/past-trips permissions/app-icon-unlocks`; `pnpm --filter @cp/api test -- you`.
- Done when: handler tests cover happy, deny, idempotent replay, sync-door validation reject; username race resolves to one winner.

### T2 — Profile 3n-1, stats, stamps list, travel history back-fill
- Goal: the PASS tab.
- Files: `apps/mobile/src/app/(tabs)/pass/index.tsx`, `apps/mobile/src/app/you/{stamps,past-trip}.tsx`, `apps/mobile/src/features/you/{profile,history}/*`, `apps/mobile/src/features/you/index.ts` (exports `useTravelHistory`), tests, `e2e/you/profile.yaml`.
- Steps: 1. Compose layout with P07/P05 components. 2. `useTravelHistory` over synced rows. 3. Motion (odometer, stamp thuds, eye-follow). 4. Empty/anonymous/offline states. 5. Back-fill form + self-reported stamps.
- Tests: `pnpm --filter @cp/mobile test -- you/profile you/history`; `maestro test e2e/you/profile.yaml`.
- Done when: motion-freeze screenshot matches `3n-1_Profile.png` with fixture data; counts match a seeded Testcontainers scenario; self-reported stamps never add critters.

### T3 — Edit profile 3n-3 + avatar picker 3n-4
- Goal: identity editing with all tabs.
- Files: `apps/mobile/src/app/you/{edit,avatar}.tsx`, `apps/mobile/src/features/you/{edit-profile,avatar}/*`, tests, `e2e/you/edit-avatar.yaml`.
- Steps: 1. In-place fields, availability check, unsaved guard. 2. Languages multi-select. 3. Avatar tabs (CRITTER from collection, INITIALS colour, PHOTO pick/crop/upload/moderation pending). 4. Crew preview minis. 5. `set_avatar` + PNG render trigger.
- Tests: `pnpm --filter @cp/mobile test -- you/edit-profile you/avatar`; `maestro test e2e/you/edit-avatar.yaml`.
- Done when: avatar change appears in crew chat on a second device; locked tile shake + hint; photo upload offline retries.

### T4 — Settings framework 3n-2 / 3n-6, sign-out, voice samples
- Goal: one registry-driven settings screen.
- Files: `apps/mobile/src/app/you/settings/index.tsx`, `apps/mobile/src/features/you/settings/{registry,rows,device-prefs,sign-out}/*`, `tools/scripts/render-settings-voice-samples.ts`, `packages/content/voice-samples/settings/manifest.json`, tests, `e2e/you/settings.yaml`.
- Steps: 1. Registry + synced/device storage. 2. Rows from render; rows owned by P20/P34/P36/P46/P47/P49 import those phases' public APIs (all precede this phase: P47 `features/help/settings-rows.tsx`, P49 `/you/pings` + `/you/widgets` routes; hence wave 18). 3. Chattiness sample playback. 4. Sign-out flows incl. anonymous warning + full local clear. 5. Collapsing header, easter egg.
- Tests: `pnpm --filter @cp/mobile test -- you/settings`; `maestro test e2e/you/settings.yaml`.
- Done when: a synced toggle changed offline on device A appears on device B after reconnect; sign-out leaves no local DB, App Group snapshot or push token.

### T5 — Sound 3n-7 + audio engine
- Goal: music themes and effects with correct audio session behaviour.
- Files: `apps/mobile/src/lib/audio/{session,music-player,crossfade,theme-cache,quiet-rules}.ts`, `apps/mobile/src/app/you/sound.tsx`, `apps/mobile/src/features/you/sound/*`, tests.
- Steps: 1. Verify expo-audio supports ambient + mixWithOthers on iOS and mix on Android; if not, implement `cp-audio-session` minimal module (else delete it from owns). 2. Theme cache from R2 + follow-guide logic (trip phase). 3. Equal-power crossfade. 4. Quiet-on-road rules (trip tz window, place-of-worship foreground geofence). 5. Wire toggles into P06 feedback bus.
- Tests: `pnpm --filter @cp/mobile test -- lib/audio you/sound`.
- Done when: device check: podcast keeps playing while theme plays; silent switch mutes music; quiet rules unit-tested across tz boundaries.

### T6 — Language & currency 3n-8 (in-place switch)
- Goal: switch locale and price mode without restart.
- Files: `apps/mobile/src/app/you/language.tsx`, `apps/mobile/src/features/you/language/*`, `apps/mobile/src/features/you/language/__tests__/*.test.tsx`, `e2e/you/language-currency.yaml`.
- Steps: 1. Locale list + in-place `activate` + persist + App Group write. 2. RTL restart state. 3. Voice line playback. 4. Currency picker, price mode segmented with odometer sample, formats pickers. 5. Stale FX label.
- Tests: `pnpm --filter @cp/mobile test -- you/language`; `maestro test e2e/you/language-currency.yaml`.
- Done when: switching to 日本語 re-renders current and back-stack screens without navigation reset; LOCAL/HOME/BOTH changes a Balances price on the Wallet tab.

### T7 — Alternate app icons 3n-5 + `cp-app-icon` + unlock job
- Goal: icon picker with free/Pass+/earned gating on both platforms.
- Files: `apps/mobile/modules/cp-app-icon/{ios/*.swift,android/src/**/*.kt,index.ts,expo-module.config.json,plugin/*}`, `apps/mobile/src/app/you/app-icon.tsx`, `apps/mobile/src/features/you/app-icon/*`, `services/worker/src/jobs/icons/unlock.ts`, `services/worker/test/account/icons-unlock.test.ts`, `e2e/you/app-icon.yaml`.
- Steps: 1. Config plugin registers alternate icons (iOS asset names from P05 bake; Android activity-aliases + monochrome). 2. Module API `getCurrent/set/isSupported`. 3. Screen with appearance segmented + previews + motion. 4. Gating + paywall entry (explicit). 5. Unlock job + NEW badge. 6. Lapse revert on foreground.
- Tests: `pnpm --filter @cp/worker test -- icons-unlock`; `pnpm --filter @cp/mobile test -- you/app-icon`; XCTest/JUnit in module; `maestro test e2e/you/app-icon.yaml`.
- Done when: FACE/STICKER switch on both platforms; STAMP without Pass+ opens 4e-1; expired Pass+ reverts to PASSPORT; crew achievement unlocks the crew icon for every member.

### T8 — Data export pipeline + UI
- Goal: downloadable zip of the user's data.
- Files: `packages/db/migrations/<ts>_data_exports.sql`, `packages/db/test/permissions/data-exports.test.ts`, `services/api/src/commands/account/request-data-export.ts`, `services/worker/src/jobs/account/{export-build,export-sections}.ts`, `services/worker/test/account/export-build.test.ts`, `apps/mobile/src/features/you/export/*`.
- Steps: 1. Table + RLS. 2. Section writers per domain using `withSystem` scoped to uid, own-authored only. 3. Streamed zip (archiver) to R2 multipart; signed link. 4. Notify N-40 (email/SMS/push). 5. UI row states.
- Tests: `pnpm --filter @cp/worker test -- export-build`; `pnpm --filter @cp/db test -- permissions/data-exports`.
- Done when: Testcontainers scenario with two crewmates exports only the requester's rows (asserted absence of crewmate C3 and messages), link expires after 7 d.

### T9a — Deletion backend: preflight, close, restore
- Goal: store-compliant immediate close with undo.
- Files: `services/api/src/commands/account/{request-account-deletion,restore-account}.ts`, `services/api/src/account/{preflight,close,organiser-transfer}.ts`, `services/api/src/routes/me-account.ts` (preflight), `services/api/test/account/*.test.ts`.
- Steps: 1. Preflight aggregation (balances per crew, organiser roles, active trip, boost IOUs, subscription source). 2. Close txn: status, deletion row, sessions revoke, rt disconnect, action keys revoke, LA end events, push tokens off, location shares stop, organiser transfer. 3. Restore within grace.
- Tests: `pnpm --filter @cp/api test -- account`.
- Done when: restore within grace brings memberships back; `ACCOUNT_CLOSED` returned to closed sessions; close side effects each asserted.

### T9b — Deletion backend: purge, reminder, admin
- Goal: verified purge across DB and external stores.
- Files: `services/worker/src/jobs/account/{purge,purge-external,purge-reminder}.ts`, `packages/db/test/purge/account-purge.test.ts`, `services/worker/test/account/purge-external.test.ts`, `services/api/src/admin/account/*`, `apps/admin/src/modules/account/*`.
- Steps: 1. Purge cascade per privacy §1 + `write_off_debt` for amounts owed to the user + SIWA/Google revoke (P09). 2. External purge steps (PostHog, Langfuse, Linear redaction, R2 `exports/{uid}` + feedback media, Resend) each idempotent with retry + DLQ. 3. Reminder N-52. 4. Admin panel.
- Tests: `pnpm --filter @cp/db test -- purge`; `pnpm --filter @cp/worker test -- account/purge-external`.
- Done when: purge test asserts every C3 table empty for uid (enumerated from the privacy registry, incl. Better Auth `user`/`session`/`account`/`verification`), C1 authored rows show former member, ledger still balances to zero across crew, `store_transactions.user_id` NULL; external purge test asserts one delete/redact call per store (recorded HTTP fixtures) and retries on failure.

### T10 — Deletion UI 3n-9 / 3n-10 / 3n-11 + restore interstitial
- Goal: the designed exit flow.
- Files: `apps/mobile/src/app/you/delete/{index,hold}.tsx`, `apps/mobile/src/app/account-closed.tsx`, `apps/mobile/src/features/you/delete/*`, tests, `e2e/you/delete-restore.yaml`.
- Steps: 1. Preflight screen with all variants. 2. Hold sheet (P07 hold ring, peel thresholds, a11y confirm). 3. Closed page with stamps + undo. 4. Restore interstitial on relaunch/sign-in. 5. Settle-up and manage-subscription hand-offs.
- Tests: `pnpm --filter @cp/mobile test -- you/delete`; `maestro test e2e/you/delete-restore.yaml`.
- Done when: early release never deletes; offline hold shows error not 3n-11; undo returns to Home with data intact.

### T11 — Cross-area e2e + a11y sweep
- Goal: phase-level verification.
- Files: `e2e/you/{full-journey,a11y}.yaml`, `apps/mobile/src/features/you/__tests__/a11y.test.tsx`.
- Steps: 1. Journey: profile → edit → avatar → icon → language → export → delete → restore. 2. AX3 font scale, VoiceOver labels, Reduce Motion variants. 3. Android run.
- Tests: `maestro test e2e/you/`.
- Done when: all `e2e/you` flows green on iOS and Android.

## Phase acceptance criteria
- [ ] 3n-1…3n-11 render per design with motion; undesigned states listed above exist and are reachable in the dev gallery
- [ ] Permission tests for `app_icon_unlocks`, `past_trips`, `data_exports`, settings expansion pass
- [ ] Locale switch in place, price mode app-wide, FX stale label
- [ ] Icons: free/Pass+/earned gating, lapse revert, Android alias switch
- [ ] Export contains only requester's data; delivered via push + email/SMS; expires 7 d
- [ ] Deletion: immediate close, sessions revoked, restore within 30 d, purge test green, SIWA revoked, N-52 reminder scheduled
- [ ] Maestro `e2e/you/*` pass on iOS + Android

## Risks & rollback
| Risk | Mitigation |
|---|---|
| iOS icon-change system alert annoys users | preview first, single change per tap; documented in UI |
| Android alias switch kills task / drops shortcuts | apply on next background, warn once |
| In-place locale switch leaves stale strings in cached components | Lingui `I18nProvider` key remount of stacks; Maestro check on back-stack |
| Purge misses a table | purge test enumerates C3 tables from `packages/domain/privacy.ts` registry; CI fails on unregistered table |
| Ledger imbalance after purge | write-offs through P33 command; test asserts crew net = 0 |
| Rollback | purge job can be paused (pg-boss queue pause) without losing requests; icon module behind capability check |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| ElevenLabs owned voices per guide (Q-94) | samples render with text-bubble fallback; script re-runnable |
| 3 missing music themes (Q-94) | carousel shows available themes only |
| Resend domain (DKIM/DMARC on critterpass.app, D20) | push + in-app inbox confirmation; SMS for phone-only |
| SIWA key for token revoke (Apple developer account) | deletion still closes; revoke retried by job until key exists |
| Counsel: deletion copy, retention of C5 (7 y), backup roll-off window (35 d) | copy keys server-editable |

## Open questions
1. Doc delta: `guide_skins` is listed as created by phase 45 but used by phase 40 (earlier wave) — default: phase 40 creates it; this phase does not.
2. Doc delta: add `add_past_trip`, `remove_past_trip`, username availability route, `account.purge_reminder` job, `user_settings.audio` columns.
3. Debts the deleting user owes — default: remain as former-member balances; payees may `write_off_debt`; no block.
4. Organiser transfer target — default: longest-standing member with RSVP in on that trip, else crew's longest member; notified via crew system message.
5. Free-user PASS+ chip on 3n-1 — default: small outline "GET PASS+" chip (explicit navigation).
7. Wave move: P45 now depends on P47 + P49 (settings rows, ping/widget routes) and runs in wave 18 — plan.md phase table/wave list needs the matching update (not editable here).
6. Route ownership: PASS tab index at `(tabs)/pass/index.tsx` — default owned here; Critterdex lives under its own `critters/` routes (P40).
