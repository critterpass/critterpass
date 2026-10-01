---
phase: 38
title: Help hub & crew SOS
status: in_progress
depends_on: [11, 14, 18, 20, 32, 34, 35, 39]
wave: 17
features: [F-119, F-120]
screens: [3k-6, 3k-10, 5a-2]
tasks: 7
owns:
  - infra/powersync/streams/safety.yaml
  - packages/domain/src/safety/**
  - packages/db/src/schema/safety.ts
  - packages/db/migrations/*_help_sessions_sos.sql
  - packages/db/test/permissions/{help-sessions,help-session-private,help-session-messages}.test.ts
  - packages/ai/src/routes/{sos,help}/**
  - packages/ai/evals/{sos,help}/**
  - services/api/src/commands/safety/**
  - services/api/src/routes/help-context.ts
  - services/api/test/safety/**
  - services/worker/src/jobs/safety/**
  - apps/mobile/src/app/(trip)/{help,sos}/**
  - apps/mobile/src/features/safety/**
  - packages/i18n/locales/en/safety/**
  - e2e/safety/**
---
# Phase 38 — Help hub & crew SOS

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | C11 (SOS + Help sharing always free), C45 (session map free, teaser/governor suppressed), C18 (sender avatars), D10 (clinic = human handoff, no AI calling), D13; §4 rows "Alarm/SOS breaks through DND", "Help tiles, SOS, 1-h location share" (guideline 5.1.5); supplier copy row 3k-10; Q-22 (limited coverage), Q-54 (SOS without data), Q-5C (crew phones), Q-85; datasets row (emergency numbers, insurance guidance, phrase packs) |
| `docs/system-architecture.md` | §4.3, §4.5 push routing, §5 authz, §9 perf budgets (SOS fan-out) |
| `docs/data-model.md` | §3.12 `location_shares`, `location_fixes`, `help_sessions`, `help_session_private`, `emergency_numbers`, `facilities`; §3.7 `insurance_policies`; §3.16 ops tickets |
| `docs/data-model-sync-and-privacy.md` | §1 C3 fields, §4 `catalog`/`trip_pack`/`trip`, §6 retention, §7 row 38 |
| `docs/api-contracts.md` | §4.12 `start_help_share`, `stop_help_share`/`extend_help_share`, `trigger_sos`, `respond_sos`, `send_sos_message`, `resolve_sos`; §5.5 `/v1/help/context`, `/v1/me/private/{kind}`; §6 tools `help_context`, `phrase_card` |
| `docs/api-contracts-async.md` | §1.2 `sos:{id}`, `trip_locations:`; §2.2 `sos.orchestrate`; §3.4 `cp.sos`, `cp.help`; N-24, N-25, N-48 |
| Phase files | 20 (location engine, `POST /v1/loc`, fixes TTL, SOS retention), 39 (map layers reused — earlier wave), 32 (guide chat, phrase cards), 34 (insurance policy card), 35 (ops desk), 11 (ALWAYS class, channels `cp_sos`) |
| Reports | `design-analysis-260926-1143-during-trip-report.md` §3 3k-6, 3k-10, F11, F12, F16, F17, F18, §8 risk 2; master §2 F-119, F-120, §8 AI-30, R6 |
| Renders | `docs/design-renders/screens/3k-6_Help.png`, `3k-10_Crew_SOS.png` |

## Overview

Goal: a Help hub one long-press away that knows where you are, has the right numbers and words, shows the nearest facility and shares your location with the crew for an hour; and a crew SOS that reaches every crewmate within seconds through Do Not Disturb, coordinates responders with walking directions, and hands clinic contact to a human — all free, deterministic, and worded as crew coordination (never as emergency dispatch).

Done when: long-pressing the guide button opens Help with reverse-geocoded street, country numbers and nearest facility, and a 1-h share visible to the crew on a free session map that auto-stops; an SOS sent with slide-to-send + 5 s cancel reaches 5 test devices via ALWAYS push and in-app takeover within 3 s p95 with the LLM disabled; I'M GOING shows walking directions; resolve notifies everyone; with no data the SMS composer opens prefilled.

## Requirements

### F-119 Help hub (3k-6)
| Item | Behaviour |
|---|---|
| Entry | long-press guide button anywhere (phase-07 tab bar `onGuideLongPress`), Help row in guide chat quick actions (PHARMACY), notification `cp.help`; hero "← {GUIDE}" |
| Location share | opening Help starts `start_help_share{reason: help, ttl_min: 60}` only after explicit opt-in: first Help open shows the consent sheet with toggle "Share where I am with {crew} for 1 hour when I open Help" DEFAULT OFF; the user must tap it on (GDPR/PDPL opt-in); choice stored in `consents` (purpose `help_location_share`) and remembered; while off, Help works fully and a "Share my location · 1 h" button starts a one-off share; revocable in Settings > Privacy; indicator "CREW CAN SEE YOU · 1H" blinking 1400 ms; STOP / +1 H controls (design in code); overrides paused crew-map share with copy; auto-off server (`location.expire`) + client; N-25 BUDGET to crew |
| Headline | "NEED A HAND?" + "You're on {street}, {area}. {Guide} has the numbers and the words." (reverse geocode online via phase-14 geocoding; offline = nearest itinerary place label) |
| Numbers | CALL {general} primary tile ("Ambulance, police, fire") + tourist police tile from `emergency_numbers` (catalog stream, verified_at); `tel:` plain dialer link (iOS confirm); toast "Calling 112. Your location is going to the crew." only if share active |
| Problem tiles | HURT OR SICK, LOST OR STOLEN, I'M LOST, MISSED A RIDE → checklist screens (undesigned, design in code): curated template per problem × country (content phase 18), AI-30 (Haiku) localises/personalises wording only; right phrase card on top |
| Checklists | Hurt: nearest clinic + GO, phrase "I need a doctor", insurance assistance line, "Ops desk can call the clinic with you" (human handoff ticket, user approves data). Lost/stolen: freeze cards steps, police report steps, embassy facility, phrase. I'm lost: pin sent to crew (share), "stay where you are", walking route to last itinerary place. Missed a ride: Grab quote + deep link (phase 35), driver message draft (needs a yes) |
| Facility row | nearest `facilities` by travel time (Valhalla car), open now from hours, "takes your insurance" only when policy network matches; GO → ride quote sheet (phase 35) |
| Phrase card | Caveat text + gloss + play (offline audio from bundle; TTS fallback online); SHOW IT full-screen large-text mode (design in code, landscape, max brightness) |
| Insurance footer | from owner-only `local_private` insurance (phase 34 wallet card); "No insurance on file · add" when absent |
| Metering | Help questions to the guide unmetered (system guide work) |
| States | location denied ("Share needs location" + Settings, dial/text still work), offline (numbers, phrases, checklists from synced/bundled data), no facility found, no insurance, sharing extend/stop/expired, guest-guide/unsupported country ("limited coverage", generic 112 + embassy), entry variants, call failed |

### F-120 Crew SOS (3k-10, sender flow undesigned)
| Item | Behaviour |
|---|---|
| Sender trigger (design in code) | red SOS button on Help hub + SOS row in guide long-press sheet; slide-to-send, then 5 s cancel countdown (Q-54); optional quick text + preset chips ("I fell", "I'm lost", "Need a ride"); location attached; sender screen: "Crew alerted · {n} seen", responders, I'M OK (resolve) and CALL {general} |
| Deterministic fan-out | `trigger_sos` commits incident + `sos.orchestrate` enqueued in same tx; fan-out first: ALWAYS push N-24 (iOS Time Sensitive + communication notification with sender avatar; Android high-priority FCM on `cp_sos` channel with DND-bypass request; full-screen intent only when server flag `android_fsi_sos` is on (after Play FSI declaration approval) and `canUseFullScreenIntent()`, else heads-up notification), Centrifugo `sos:{id}` + `user:#uid` takeover event; no LLM on this path; escalation timer 2 min without responder → re-push + prompt sender "No one's answered — call {general}?" (no auto-dial) |
| Receiver takeover | global listener; full-screen `rise` takeover + long vibration (Core Haptics / VibrationEffect waveform); hero "● SOS · {time}" dot blink 900 ms until someone responds, "{distance} FROM YOU", avatar + "{NAME} NEEDS HELP" |
| Summary | AI-30 (Haiku, 3 s hard timeout) from sender text + place; fallback raw text; sender messages thread (`send_sos_message`) |
| Steps card | "{GUIDE}'S ON IT": "SOS sent to all {n} of you" (on fan-out ack), "His location stays live until he's safe" (share reason sos), "Ops desk is calling the clinic with you" (only when sender requested; human ops ticket via phase 35 desk — D10), "Share his insurance details?" (sender consent prompt; sent by ops only after yes) — dashed pending → green tick on real events |
| Responders | I'M GOING → `respond_sos{coming}` (flaps "GOING ✓", toast "Jordan knows you're coming. 7 minutes on foot."), session map switches to walking directions; responder row "Alex is going. 4 minutes away on foot." ETA via Valhalla pedestrian every 60 s; arrived at ≤ 50 m |
| Actions | CALL {NAME} (`tel:` when number visible per Q-5C), See him on the map → session map |
| Resolve | sender I'M OK or responder "He's safe" → `resolve_sos` → N-48 ALWAYS; false alarm variant; location share ends; incident retained 1 y, `help_session_private` 90 d |
| Offline sender | no data → native SMS composer prefilled to crewmates' numbers with maps link (user sends); queued `trigger_sos` also replays when data returns (dedupe by op_id). Staleness guard: server compares op `created_at` (client UUIDv7 ts, clamped by device clock skew) with receipt; age > `ops_config.sos.stale_after_min` (default 10) → NO takeover/ALWAYS fan-out; the sender's app shows "Your SOS from {time} didn't send — are you still in trouble?" SEND NOW / I'M OK; SEND NOW issues a fresh `trigger_sos`; I'M OK records `false_alarm` with no crew alert. If the sender resolved locally while offline, the queued resolve cancels it |
| LA | crew SOS LA face is phase 48 (data from `sos:` payloads) |

### Session map (C45)
Free on any trip: sender pin, responders, walking route; built from phase-39 map components with gate bypass (`helpMap(u,t)`); teaser and paywall governor suppressed; ends with the session.

### Wording (guideline 5.1.5 / counsel)
Help and SOS are "tell your crew" features; copy never says we contact emergency services; CALL tiles are plain dialer links; disclaimer line in Help footer "Critterpass tells your crew. For emergencies call {general}."

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration `*_help_sessions_sos.sql` | `help_sessions`, `help_session_private` per data-model §3.12; add `help_session_messages(help_session_id, sender_id, body, at)` (T scoped to trip crew, 90 d) and `help_sessions.escalated_at`, `false_alarm bool`, `share_id` **(doc delta)**; `location_shares.reason` values already include help/sos |
| RLS | `help_sessions`: T; `help_session_private`: sender + responders (X), not synced, not in `guide_reader`; messages: trip crew |
| Streams | `trip`: `help_sessions`, `help_session_messages`; `emergency_numbers` (catalog) and `facilities` (trip_pack) already synced |
| Commands | §4.12 set; `request_ops_clinic_call{sos_id\|help_session_id, share_insurance: bool}` → phase-35 desk ticket **(doc delta)**; all SOS commands `offline: true` queueable |
| HTTP | `GET /v1/help/context?lat&lng&trip_id` → `{place_label, emergency_numbers, facilities[{id, minutes, open_now, insurance_match}], phrases[]}` |
| Realtime | `sos:{id}` (`sender.fix`, `responder`, `step`, `message`, `resolved`), `user:#uid` `sos.takeover`, fixes via phase-20 `/v1/loc` with share reason sos |
| Jobs | `sos.orchestrate` (10 fast retries; fan-out, summary, escalation timer), `sos.responder_eta` (60 s while responders coming), `location.expire` handles help TTL |
| Push | N-24, N-48 ALWAYS; N-25 BUDGET; categories `cp.sos` (COMING, CALL, OPEN), `cp.help` (STOP_SHARE); action-key scope `sos` |
| AI | AI-30 routes `packages/ai/src/routes/sos/` (summary) and `help/` (checklist wording), evals incl. "never invents facility, number or medical advice" |

## Tasks

### T1 — Safety schema and permission tests
- Files: `packages/db/src/schema/safety.ts`, `packages/db/migrations/<ts>_help_sessions_sos.sql`, `packages/db/test/permissions/{help-sessions,help-session-private,help-session-messages}.test.ts`, `infra/powersync/streams/safety.yaml`.
- Steps: 1. Tables/columns, FORCE RLS, grants. 2. Matrix: sender, responder, other crew, crew non-participant, outsider, guide_reader, powersync_repl.
- Tests: `pnpm --filter @cp/db test -- permissions/help-sessions permissions/help-session-private permissions/help-session-messages`
- Done when: only sender + responders read private health notes; nothing private in publication.

- Status: done — 70e1cfb9

### T2 — Help context API, help share commands, AI-30 checklist wording
- Files: `services/api/src/routes/help-context.ts`, `services/api/src/commands/safety/{start-help-share,stop-help-share,extend-help-share,request-ops-clinic-call}.ts`, `packages/domain/src/safety/{checklists,help-context,share-policy}.ts`, `packages/ai/src/routes/help/**`, `packages/ai/evals/help/**`, `services/api/test/safety/help.test.ts`.
- Steps: 1. Context from curated tables + geocode + Valhalla; insurance match. 2. Share commands (override pause, TTL 60, extend +60). 3. Checklist template resolver + Haiku wording with fallback. 4. Ops ticket with consent flag.
- Tests: `pnpm --filter @cp/api test -- safety/help`; `pnpm --filter @cp/ai eval -- help`
- Done when: share auto-expires in test clock; eval proves no invented numbers/facilities.

- Status: done — d9853a05 (routes `/v1/help/context`, `/v1/help/checklist`, `/v1/help/shares/{id}/fixes`; the Help share expiry runs as `help.share_expire`)

### T3 — Help hub, checklists, phrase show mode
- Files: `apps/mobile/src/app/(trip)/help/{index,[problem]}.tsx`, `apps/mobile/src/features/safety/help/{screen,share-indicator,call-tiles,problem-tiles,facility-row,phrase-card,show-it-mode,insurance-footer,checklist,consent-sheet,states/*}.tsx`, `apps/mobile/src/features/safety/use-help-context.ts`, `packages/i18n/locales/en/safety/help.po`.
- Steps: 1. Online/offline context (synced tables + bundle labels). 2. Share start/stop/extend UI. 3. Four checklist screens with tile→page shared-element transform. 4. Show-it mode. 5. All states.
- Tests: `pnpm --filter @cp/mobile test -- features/safety/help`
- Done when: RNTL covers each state; offline render uses only local data (network mocked off); consent toggle renders OFF on first open and no `start_help_share` is queued until the user turns it on.

- Status: done — 5711cf36 (tile→page transform: plain push; states logged in `docs/undesigned-states.md`)

### T4 — SOS backend: commands, orchestrator, escalation, responder ETAs
- Files: `services/api/src/commands/safety/{trigger-sos,respond-sos,send-sos-message,resolve-sos}.ts`, `services/worker/src/jobs/safety/{sos-orchestrate,sos-escalate,sos-responder-eta}.ts`, `packages/ai/src/routes/sos/**`, `packages/ai/evals/sos/**`, `services/api/test/safety/sos.test.ts`, `services/worker/test/safety/sos-latency.test.ts`.
- Steps: 1. Incident + share(sos) + outbox in one tx. 2. Fan-out push (ALWAYS, bypass budget/quiet hours) + channel events before any AI. 3. Summary with 3 s timeout, fallback. 4. Escalation timer, responder ETAs, arrival. 5. Resolve → N-48, share end.
- Tests: `pnpm --filter @cp/api test -- safety/sos`; `pnpm --filter @cp/worker test -- safety/sos-latency` (LLM stubbed to hang; asserts pushes enqueued < 500 ms)
- Done when: fan-out timing test passes with LLM unavailable; replayed trigger creates one incident; a `trigger_sos` op aged > 10 min on upload produces no fan-out/takeover and a `cmd_results` `stale` row that drives the sender confirm prompt.

- Status: done — 4aef230f (contract detail in `docs/api-contracts-safety.md`; the `sos` Centrifugo namespace is declared in `infra/centrifugo/config.json`)

### T5 — SOS sender flow (undesigned)
- Files: `apps/mobile/src/app/(trip)/sos/{send,[id]}.tsx`, `apps/mobile/src/features/safety/sos/sender/{slide-to-send,cancel-countdown,quick-text,sender-status,im-ok,sms-fallback}.tsx`, `packages/i18n/locales/en/safety/sos.po`.
- Steps: 1. Slide + 5 s cancel (haptic ticks). 2. Status view with seen/responders. 3. I'M OK / false alarm. 4. No-data SMS composer (expo-sms) prefilled to visible crew numbers + maps link. 5. Stale-SOS confirm prompt (SEND NOW / I'M OK) from `cmd_results`.
- Tests: `pnpm --filter @cp/mobile test -- features/safety/sos/sender`
- Done when: cancel within 5 s sends nothing (command queue empty); SMS fallback opens when offline.

- Status: done — 276bd741 (stale prompt and I'M OK live on the SOS screen, 1a9b5efe)

### T6 — SOS receiver takeover and session map
- Files: `apps/mobile/src/features/safety/sos/receiver/{takeover-host,sos-screen,steps-card,responder-row,im-going,long-buzz}.tsx|ts`, `apps/mobile/src/features/safety/session-map/{session-map,walking-route,use-session-map}.tsx|ts`.
- Steps: 1. Root-level takeover host listening to `user:#uid` `sos.takeover` + push open. 2. Screen per design (blink until responded). 3. I'M GOING → walking route; CALL; map link. 4. Session map reusing phase-39 layers with gate bypass; governor suppressed.
- Tests: `pnpm --filter @cp/mobile test -- features/safety/sos/receiver features/safety/session-map`
- Done when: takeover appears over any route in RNTL navigation test; unboosted trip still renders session map.

### T7 — Notification actions and e2e
- Files: `apps/mobile/src/features/safety/notification-actions.ts`, `e2e/safety/{help-share.yaml,help-offline.yaml,sos-send-cancel.yaml,sos-receive-respond.yaml,sos-resolve.yaml}`, `tools/scripts/seed-sos-crew.ts`.
- Steps: 1. Register handlers for `cp.sos` COMING/CALL/OPEN and `cp.help` STOP_SHARE (action keys scope `sos`). 2. Android `cp_sos` channel DND-bypass request flow + FSI permission explainer. 3. Maestro flows with second simulated crew device via API.
- Tests: `maestro test e2e/safety/`
- Done when: all flows green on iOS 26 + Android 36.

## Phase acceptance criteria
- [ ] Help works fully offline for numbers, phrases, checklists; online shows geocode + nearest facility
- [ ] Help share 1 h auto-off enforced server and client; stop/extend work; overrides paused map share with copy
- [ ] SOS fan-out p95 < 3 s end-to-end with LLM disabled; pushes use ALWAYS class and bypass budget/quiet hours
- [ ] Responders, walking directions, resolve; clinic contact only via human ops ticket with consent
- [ ] Everything free on unboosted trips; no paywall/teaser on Help, SOS or session map
- [ ] Copy reviewed against 5.1.5 wording rules; permission tests green; evals ≥ 95 %; Maestro green

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| iOS cannot break through silent mode for remote SOS | Time Sensitive + communication notification + repeated push at escalation; in-app takeover |
| Android FSI denied | high-priority heads-up notification on `cp_sos`; explainer to grant |
| Wrong emergency numbers | curated with `verified_at`, ops re-verification job in content factory; generic 112 fallback |
| False alarms | 5 s cancel, false-alarm resolve, rate limit 3/day |

## Non-code dependencies
- Counsel review of Help/SOS wording (5.1.5, liability) — ships with current conservative copy.
- Curated emergency numbers, facilities, checklists, phrases per country (phase 18) — missing country → limited-coverage state.
- Ops desk staffing hours (phase 35) — outside hours the clinic row shows the facility phone for the user to call.

## Open questions
1. Doc deltas: `help_session_messages`, `help_sessions.escalated_at/false_alarm/share_id`, `request_ops_clinic_call` — default add.
2. plan.md delta: depends_on now [11, 14, 18, 20, 32, 34, 35, 39] (all earlier waves; wave 15 unchanged). Doc delta: `consents.purpose help_location_share`, `ops_config.sos.stale_after_min`, flag `android_fsi_sos`.
3. Help share consent default — resolved: OFF until the user explicitly opts in on the first sheet; choice remembered and revocable (counsel to confirm wording).
4. SOS rate limit — default 3 per user per day, then confirm dialog.
