# Progress and upcoming waves (2026-09-28 01:15)

## Where we are

- **Tasks:** 151 of 573 done on `main` once PR #57 (the last two LLM gateway tasks) merges.
- **Phases:** 8 of 57 done. 2 more have all tasks done and wait on founder device runs. 7 are in progress.
- **Staging** (Railway SG + Cloudflare), everything live on current `main`:
  - api, worker, Centrifugo (internal server API), PowerSync (api + replication + daily compaction)
  - Postgres (PowerSync storage), Redis
  - media Worker, website with link pages on `go.staging`, ops console at `admin.staging` behind Cloudflare Access
- **Merged since yesterday evening (#42–#56):**
  - Features:
    - links and deferred deep links
    - notifications and push (APNs live; FCM waits for Firebase)
    - the app shell and component library, with 35 screenshots
    - durable AI jobs, autonomy with undo, and the eval gate
    - the ops console
    - the end-to-end sync harness and App Group outbox
    - sign-out disconnecting realtime
  - Staging and dev: Centrifugo's API made internal; the staging realtime/sync services; DeepSeek wired for development; Langfuse.
  - Decisions: Mapbox terms (build now, legal before launch), WeatherAPI.com, hourly crowds on hold, the spike decisions index.
- **Bugs caught while integrating, all fixed and tested:**
  - the api never mounted its realtime token routes
  - a migration would have dropped link event types
  - an AI citation crash on non-Anthropic replies
  - two time-of-day and race-dependent tests (feedback bus, evening roundup)
  - a console grant drift

| Phase | State | What is left |
|---|---|---|
| 1, 3, 4, 8, 9, 12 | done | — |
| 10 Offline sync, commands, realtime | done (this PR) | — |
| 13 LLM gateway, personas, autonomy | done when #57 merges | — |
| 2 Platform spikes | all 15 tasks done | founder device runs; spike tables dropped from staging |
| 5 Sticker renderer, bake, share | all 10 tasks done | founder device run (60 fps grid, mid-range Android); Android Maestro |
| 6 Motion, feedback, gestures | 8/10 | cp-haptics Android build + native unit tests; motion Maestro flows (tap-through, not openLink) |
| 7 App shell, components, a11y | 16/18 | running: iOS crash in 4 components, headline clipping (Vietnamese diacritics), gift-code overflow, comparison table, Pass tab icon, full recapture |
| 11 Jobs, notifications, push | 9/11 | iOS Notification Service Extension; Android messaging + tap routing |
| 14 POI data, maps, routing | 7/8 | region-pack Maestro run |
| 15 Fares, weather, season, crowds | running (0/7) | Travelpayouts + WeatherAPI.com; hourly crowds on hold |
| 17 Back-office & ops console | 4/8 | moderation queue, support tools, ops desk, audit viewer |
| 21 Links & deferred deep links | 7/9 | funnel verification (needs analytics), App Clip |

## Upcoming waves

The critical path runs 16 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 …, so one lane stays on it whenever its inputs are ready.

**Wave A: now to the next few hours (parallel lanes):**

1. **Phase 15:** fares, weather/marine, season, hazards (running).
2. **Phase 7 fixes + full screenshot recapture** (running), then phase 7 done.
3. **Phase 17 T5–T8:** moderation intake and queue, support tools, concierge/ops desk, audit viewer (start now).
4. **App root wiring** (after the phase 7 fixes), which makes a staging build usable end to end:
   - mount deep-link routing and deferred links
   - the extension outbox drain and endpoints file
   - staging endpoints for PowerSync, the api and realtime in the staging build profile
5. **Native batch** (after the phase 7 fixes; one simulator at a time):
   - Scope:
     - Notification Service Extension
     - Android messaging + tap routing
     - App Clip
     - cp-haptics Android
     - the outstanding Maestro sweeps (motion, region packs, sticker lab)
   - Then **one** iOS EAS build for the new native fingerprint, plus a local Android arm64 build. That build doubles as the first TestFlight build for your device runs.

**Wave B: after A.**
- **Phase 16:** cost and constraint engine, after 15. It's on the critical path.
- **Phase 19:** analytics, experiments and observability, after 17.
- **Phase 18:** content factory, after 17.
- **Phase 20:** permissions, location engine and POI visits, after the native batch.
- **Phase 39:** crew live map, after 20.

**Wave C:** 22 onboarding → 23 invites/crews/referral → 24 crew chat and 51 website → 25 home/inbox → …

## Founder items for these waves

| When | Item | Blocks |
|---|---|---|
| Wave A (native batch) | Google Play Console ($25 once) + Firebase project | Android push (FCM) and Play Integrity; emulator tests use FCM test sends |
| After the first TestFlight build | Device runs for phases 2 and 5 (checklists in each phase file) | phases 2 and 5 → done |
| Wave B (phase 19) | PostHog EU org, Grafana Cloud stack (+ OnCall); on-call phone number optional | real analytics and alerting (code ships against recorded fixtures without them) |
| Wave B (phase 19) | Langfuse: keep the US project or add an EU one (the plan names EU for GDPR) | trace residency |
| Wave B (phase 18) | ElevenLabs account + voices; accept the FSQ OS Places / Overture licences; native-speaker review of phrases | phrase audio (text-only until then); places batch |
| Any time | Undesigned states review (`docs/undesigned-states.md`) | nothing; founder review |

## Unresolved questions

1. Langfuse region: keep the current US project, or move traces to EU as phase 19 assumes?
2. Production AI provider: the decisions still say Claude-only at launch, while development runs on DeepSeek.
