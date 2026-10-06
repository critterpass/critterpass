---
phase: 52
title: "Community: crew plans, copy, rate, publish"
status: in_progress
depends_on: [17, 28, 29, 30, 43, 44, 46, 51, 58]
wave: 21
features: [F-149, F-150, F-151, F-152]
screens: [3o-1, 3o-2, 3o-3, 3o-4, 3d-1, 3e-1, 3m-1]
tasks: 12
owns:
  - packages/domain/src/community/
  - packages/db/src/schema/community.ts
  - packages/db/migrations/*_shared_plans_ratings.sql
  - packages/db/test/permissions/{shared-plans,shared-plan-copies,ratings}.test.ts
  - packages/planner/src/community/
  - packages/planner/test/community/
  - packages/ai/src/routes/community/
  - packages/ai/evals/community/
  - services/api/src/commands/community/
  - services/api/src/routes/shared-plans.ts
  - services/api/src/admin/community/
  - services/api/test/community/
  - services/worker/src/jobs/community/
  - services/worker/test/community/
  - apps/admin/src/modules/community/
  - apps/mobile/src/features/community/
  - apps/mobile/src/app/community/
  - packages/i18n/locales/en/community/
  - e2e/community/
---
# Phase 52 — Community: crew plans, copy, rate, publish

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (guide proposes ChangeSets only; numbers from code), D6 (curated POI DB; supplier content never in community copy), D10, D11; C3, C13 (copy vs redrafts), C25 (no coordinate trails), C28, C36, C44 (draft privacy); §3 "always free: community"; §7 Q-41, Q-69, Q-80, Q-81 |
| `docs/data-model.md` | §3.15 (`shared_plans`, `shared_plan_copies`, `ratings`, `moderation_reports`); §3.3 itinerary tables; §3.10 photos/album; §3.1 `taste_profiles`, `saved_items`; §3.17 `consents` (`multi_member_publish`, `faces`) |
| `docs/data-model-sync-and-privacy.md` | §1 derived projections; §4 streams `community`, `explore`, `trip_draft`; §2 LLM views (no supplier content) |
| `docs/api-contracts.md` | §4.16 `rate_places`, `publish_shared_plan`, `update_shared_plan`, `unpublish_shared_plan`, `create_plan_link`, `revoke_plan_link`, `save_shared_plan`; §5.5 `GET /v1/shared-plans`, `GET /v1/shared-plans/{id}/guide-note`; §5.6 link routes (`/p/` plan target) |
| `docs/api-contracts-async.md` | §2.2 `community.prepare`; §1.2 `trip_draft:` (merge progress), `user:#uid job.progress` |
| Reports | `design-analysis-260926-1143-you-community-help-report.md` §2 3o-1…3o-4, §5, §7, §8; master §2 F-149…F-152, §8 AI-35, AI-36, §6.2 face-blur row; fact-check native report omission 3 (UGC age-rating) |
| Phase inputs | P17 moderation queue + panel slots; P28 draft/redraft infra (`agent_jobs`, redraft reservation, private draft), P29 ChangeSet review + plan SHARE pill; P43 recap (Rate-the-trip entry), P44 album + curation (AI-35) + face tags/consents; P51 web `/p/{token}` read-only viewer + OG; P21 link registry (plan target); P14 POIs; P16 cost engine (per-person rounding); P22 taste profiles; P30 `place_tips`, Explore entry "CREW PLANS" (3d-1) |
| Renders | `docs/design-renders/screens/3o-1_Crew_plans.png`, `3o-2_Shared_plan.png`, `3o-3_Rate_the_trip.png`, `3o-4_Share_the_plan.png`, `3d-1_*.png` (entry "CREW PLANS ›"), `3e-1_*.png` (SHARE pill), `3m-1_Recap.png` |

## Overview
Goal: crews publish finished (or in-progress) plans with every participant's consent and granular privacy (names, costs, face-blurred photos; chat never leaves), other crews browse them ranked by taste match, copy a whole plan or one day into their private draft through a fit-checked merge job, and travellers rate visited places and leave anonymous tips that pass moderation. The corpus is organic only: no seeded or fake plans.
Done when: a trip published by crew A (after all consents) appears for crew B's Kyoto browse with a correct match score, copying "Day 3 only" produces an organiser-only ChangeSet in B's draft after a constraint check, faces in published photos are blurred on every public derivative, rating a place creates a moderated tip visible on the place's detail, and the web read-only link resolves via P51 without private data.

## Requirements
### F-152 Publish plan with privacy controls (3o-4)
- Entry: plan SHARE pill (3e-1, P29), recap "SHARE THE PLAN TOO" (3o-3), trip hub. Any participant may request publishing (Q-80); `publish_shared_plan` creates `shared_plans(status=pending_consent)` and asks every other participant in-app (card in crew chat + Inbox: preview + toggles summary, APPROVE / NOT THIS ONE); publish happens when all consent; any decline blocks with neutral copy (never names who, C28 spirit) "Not everyone's in. The plan stays with the crew."; consents recorded as `consents(purpose=multi_member_publish, scope={shared_plan_id})`.
- Sheet per render: live preview card "HOW OTHER CREWS WILL SEE IT" (generated title, "A crew of {n} · {d} days · {Month Year}", guide sticker, chips DAYS / PHOTOS / FORMS found), toggles: Our names (default OFF → "a crew of six"), What it cost (ON, per person rounded to $10 via P16, in viewer's display currency on read), Best photos (ON, "Picked by {guide}, faces blurred"), The chat (locked "Private"); PUBLISH TO CREW PLANS; "Copy a read-only link instead" (`create_plan_link` → unlisted token URL via P21/P51, toast "Read-only link copied.").
- Motion: toggles rewrite preview (text crossfade, chips in/out); publish folds card into an envelope (2–3 panels rotateX) and flies off (~900 ms); sheet 540 ms.
- `community.prepare` job before publish: PII scrub of titles/notes (regex for booking refs, phones, emails, addresses + Haiku pass; supplier descriptions never included), photo pick (reuse P44 AI-35 curation, max 12, exclude photos where a tagged person has not consented, Q-69), face blur derivatives (server detection in the worker: YuNet face detector ONNX (OpenCV Zoo, MIT — verify at T2) via `onnxruntime-node`, score threshold 0.6, boxes held in memory only and never stored (C4); blur with sharp; fail-closed: photo excluded if the detector errors or finds fewer faces than P44's on-device `face_count`), title + taste/pace tags (Sonnet structured output from plan skeleton + highlights, AI-36), critter highlight line from trip events, match vector (taste tags + pace + budget band + month).
- Undesigned states (design in code): consent pending (who's in count only), declined, already published (stats: copies, saves, rating; edit toggles → `update_shared_plan`; UNPUBLISH), photos processing / blur failed (publish without photos option), fewer than 12 photos, trip in progress (allowed; label "Planned, not travelled yet" until trip end), publish error/offline (queued command), link revoke.
- Crew chat system line "{name} published our plan" after publish.
- After publish (design in code): any participant can `withdraw_publish_consent {shared_plan_id}` from the published-plan screen → plan auto-unpublished (tombstone; neutral copy, never names who). A participant leaving the crew or a named participant's account purge (P45 `account.purge`) → `community.rematerialise` job rebuilds the projection with that uid removed (names off for them, their tagged photos and their tips dropped); if they were required for consent, the plan is unpublished instead. Web OG/R2 cache for the plan token purged on each change (P51).

### F-149 Crew plans browse (3o-1)
- Entry from destination guide (3d-1 "{n} CREW PLANS ›", hidden count when 0) and Explore.
- `GET /v1/shared-plans?dest&days&month&crew_size&max_cost&tags&sort&cursor`: filters as chips (days range, month, crew size, under cost, taste tags); match score = weighted cosine of viewer crew's aggregated taste vector (members of context trip; solo = own) vs plan vector + month proximity + crew-size fit + budget fit; guide's pick = top match (not most copied), hero card "{GUIDE}'S PICK FOR YOU" (guest-guide cities: "PICKED FOR YOU"); rows show ★ avg (≥3 ratings else "NEW"), copies, "{pct}% YOUR TASTE", per-person cost when shared.
- Motion: filters slide in staggered; re-sort FLIP with slight rotation 360–420 ms; card → detail shared-element zoom 560 ms.
- Cold start (organic only): 0 plans → empty state "No crew has shared {dest} yet. Yours could be first." + link to how sharing works; no seeded or synthetic plans. No results → "Clear filters". Loading/pagination skeletons; offline shows `community` stream cache for previously opened destinations; report/hide plan (overflow → `moderation_reports`).
- Ranking is commission-neutral and has no sponsored plans.

### F-150 Shared plan detail + copy into draft (3o-2)
- Detail: hero, ♡ SAVE (`save_shared_plan` → `saved_items`), chips, guide sticker + overlap note (AI-36 via `GET /v1/shared-plans/{id}/guide-note?trip_id` — Haiku over plan days vs viewer's current draft/must-dos; `{overlap_days, best_day, note}`; numbers computed in code, LLM only words the note; cached per (plan, draft version); hidden when no draft), DAY BY DAY rows with "+" per day, "+ n MORE DAYS" expander, WHAT THEY'D CHANGE (tips from the publishing crew's ratings, first-name/initial only if names ON), sticky COPY INTO OUR TRIP + "DAY {best} ONLY".
- Copy: `copy_shared_plan{shared_plan_id, trip_id, days?[]}` (doc delta) → organiser-only (C44): non-organisers get "Suggest to organiser" which posts a suggestion card to the organiser (design in code). Job `community.merge`: map plan items to our POIs (ids already curated), run P16/P28 constraint check against trip dates, opening hours, travel times, must-dos, budget, season (month mismatch flags closures/weather) → ChangeSet on the private draft (visibility organiser) with fit/tight/clash per item; progress via `trip_draft:` + `user:#uid`. No draft yet → becomes first draft (Q-41, no redraft consumed); replacing an existing draft consumes a redraft (C13 reserve/release); single-day add merges into the matching day or appends per planner rule.
- Motion: "+" → paper-plane arc to guide (600 ms bezier) + row pop + "+1" float 800 ms; COPY → toast "{guide} merged {n} days into your draft. Only you can see it." → 3c-9 (P28 route).
- States: no trip for this destination (sheet: pick a crew trip or "Start a trip here" → P25 create trip), not organiser, fit conflict (P29 change review diff), season mismatch banner, redraft limit reached (P46 entry `redraft_last` / `REDRAFT_LIMIT`), plan unpublished (tombstone), note loading/stream, saved state.

### F-151 Rate the trip + place tips (3o-3)
- Entry: recap (P43) after story, Inbox reminder once 2 d after trip end (BUDGET), place detail "Rate" for visited places.
- Card stack of visited places for the trip (from P20 `visits` + plan items checked in; never GPS trails), photo from crew album (fallback critter-art place card), day chip, memory line (template from trip events: critter found, quest done; no LLM); LOVED IT (fly up −440 px −6° + ♥ float), FINE (right +14°), SKIP IT (left −14°), exits 380 ms, next card overshoot 420 ms; swipe gestures mirror buttons (up/right/left) with a11y actions; counter ticks.
- Tip field "ONE TIP FOR THE NEXT CREW" (≤200 chars) → attached to that verdict; submitted in batches with `rate_places` (offline queue).
- Moderation: P13 `checkCompliance` surface `public_text` (Jev decision model with Haiku fallback; code patterns + personal info, harassment, promotion and the rest of the category set) → approve / send to P17 queue / reject (`CONTENT_REJECTED` shown gently on that card afterwards: "That tip didn't make it through. Try without names or numbers."); approved tips project into `place_tips(source=community)` (P30) anonymised ("a crew in Oct 2026"), shown on place detail and to guides only as curated tip text (not in LLM context unless moderated).
- End card (design in code): "All rated. Your tips are live for crews planning {dest}." + SHARE THE PLAN TOO → 3o-4. Partial progress resumes; edit past ratings from place detail.
- Aggregates: `ratings` feed POI social proof (loved %) via nightly job into POI stats (P14 read model).

## Architecture & contracts
| Area | Delta |
|---|---|
| Migration `<ts>_shared_plans_ratings.sql` | `shared_plans` (+ `destination_id`, `days_count`, `month`, `crew_size`, `cost_pp_rounded_minor`, `currency`, `title`, `tags text[]`, `match_vector vector(64)`, `rating_avg`, `rating_count`, `copies_count`, `saves_count`, `photos jsonb [media_key_blurred]`, `consent_required_uids uuid[]`), `shared_plan_copies`, `ratings` (+ `trip_id`, `verdict loved/fine/skip`, `tip`, `tip_moderation`), `plan_links` (token_hash, trip_id, revoked_at) — **doc delta** for added columns and `plan_links` |
| RLS | `shared_plans`: R when `published` (projection columns only via view `community.shared_plan_public`); T (participants) while draft/pending; `ratings` author O, public read via anonymised view; `shared_plan_copies` O; `plan_links` T |
| Public projection | `projection jsonb` materialised by the job; never joins live private tables at read time; public view excludes `trip_id`, uids when names OFF. This phase is the single owner of the plan projection: exports `readPublicPlan(token)` from `packages/domain/src/community/public-plan.ts`; P51's `GET /v1/public/{kind}/{token}` (kind=plan) calls it as `public_reader` (P51 grants the role) |
| Streams | `community` (param destination / shared_plan_id): public view rows + public ratings; `trip`: own `shared_plans` draft rows |
| Commands | §4.16 set; **doc delta**: `copy_shared_plan`, `respond_publish_consent {shared_plan_id, approve}`, `withdraw_publish_consent {shared_plan_id}`, `report_shared_plan {id, reason}`, `suggest_shared_plan_to_organiser {shared_plan_id, trip_id, days?[]}` |
| Routes | `GET /v1/shared-plans` (+ match), `GET /v1/shared-plans/{id}`, `GET /v1/shared-plans/{id}/guide-note`; no public route here — web reads via P51 `GET /v1/public/plan/{token}` → `readPublicPlan` |
| Jobs | `community.prepare` (scrub, blur, pick, tags, vector), `community.rematerialise` (consent withdrawal, member leave, account purge; subscribed to P45 `account.purge` and crew-leave events), `community.merge` (copy fit-check → ChangeSet), `community.tip_moderate`, `community.aggregate` (nightly ratings → POI stats, plan rating) — doc delta for last four |
| Worker deps | `onnxruntime-node` + YuNet ONNX model file (bundled in worker image, licence recorded) |
| AI | `packages/ai/src/routes/community/{title-tags,overlap-note,tip-moderation,pii-scrub}.ts`; promptfoo suites (no numbers invented; PII never echoed; tip moderation precision on labelled set) |
| Planner | `packages/planner/src/community/{map-items,merge,season-check}.ts` pure fns producing ChangeSet ops |
| Admin | `apps/admin/src/modules/community/`: published plans list, unpublish with reason, tip moderation kind handler for P17 queue, reports |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Community.dc.html`, `docs/design-renders/pages/Ops-Community.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-content-platform-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| SHARED PLANS tab inside Community & drivers | render the published-plans list as a tab of the `community` area host created by phase 55 |
| Unpublish with reason | name it `admin_unpublish_shared_plan {id, reason}` (ops) and add to §4.17 |
| My work / badges | register `work` + `count` for shared-plan reports |

## Tasks
### T1 — Community schema, public projection view, permission tests
- Status: done — 68d5f822bd
- Goal: tables + authz.
- Files: `packages/db/src/schema/community.ts`, `packages/db/migrations/<ts>_shared_plans_ratings.sql`, `packages/db/test/permissions/{shared-plans,shared-plan-copies,ratings}.test.ts`, `packages/domain/src/community/{schemas,toggles,match}.ts`.
- Steps: 1. Tables + `plan_links` + public views. 2. RLS/grants; `guide_reader` sees only public view. 3. Publication entries. 4. Domain schemas + `readPublicPlan(token)` (revoked/unpublished → null).
- Tests: `pnpm --filter @cp/db test -- permissions/shared-plans permissions/ratings permissions/shared-plan-copies`.
- Done when: outsider reads only published projection; names-off projection contains no uid/display names; pending plan visible only to participants.

### T2 — Publish commands, consent flow, prepare job (scrub, blur, pick, tags)
- Status: done — 6a6ac24af8 (published in the consenting transaction; regex scrub; only photos with no faces; no LLM scrub/title or face blur)
- Goal: safe publishing pipeline.
- Files: `services/api/src/commands/community/{publish-shared-plan,respond-publish-consent,withdraw-publish-consent,update-shared-plan,unpublish-shared-plan,create-plan-link,revoke-plan-link}.ts`, `services/worker/src/jobs/community/{prepare,blur,pick-photos,rematerialise}.ts`, `packages/ai/src/routes/community/{title-tags,pii-scrub}.ts`, `packages/ai/evals/community/{title-tags,pii-scrub}/*`, `services/api/test/community/publish.test.ts`, `services/worker/test/community/prepare.test.ts`.
- Steps: 1. Consent requests (chat card + Inbox via P24/P25 APIs). 2. Prepare job steps with progress. 3. YuNet detection (onnxruntime-node, threshold 0.6) + sharp blur; fail-closed vs P44 `face_count`. 4. Projection materialisation; crew system message. 5. `withdraw_publish_consent` → unpublish; `community.rematerialise` on crew leave / `account.purge`.
- Tests: `pnpm --filter @cp/api test -- community/publish`; `pnpm --filter @cp/worker test -- community/prepare`; `pnpm --filter @cp/ai eval community-pii-scrub`.
- Done when: a note containing a booking ref and phone never appears in projection; a photo with an unconsented tagged face is excluded; a photo where the detector finds fewer faces than `face_count` is excluded; one decline blocks publish; withdrawal unpublishes; purging a named participant yields a projection without their name, tagged photos or tips (`services/worker/test/community/rematerialise.test.ts`).

### T3a — Publish sheet 3o-4 + consent card
- Status: done — 06ac9039b1 (no envelope motion)
- Goal: designed sheet and consent UI.
- Files: `apps/mobile/src/app/community/publish/[tripId].tsx`, `apps/mobile/src/features/community/publish/*`, `apps/mobile/src/features/community/consent/*` (chat/Inbox consent card), tests, `e2e/community/publish-consent.yaml`.
- Steps: 1. Live preview from local projection preview fn (same code as server). 2. Toggles + envelope motion. 3. Consent card UI. 4. Pending/declined/processing/offline states.
- Tests: `pnpm --filter @cp/mobile test -- community/publish community/consent`; `maestro test e2e/community/publish-consent.yaml` (two simulators).
- Done when: preview text equals server projection for fixture trips; publish requires both devices' approval.

### T3b — Manage published plan
- Status: done — 06ac9039b1
- Goal: post-publish states.
- Files: `apps/mobile/src/features/community/manage/*`, tests.
- Steps: 1. Stats (copies, saves, rating). 2. Edit toggles → `update_shared_plan`; UNPUBLISH; link copy/revoke. 3. Withdraw-consent action for any participant. 4. "Planned, not travelled yet" label.
- Tests: `pnpm --filter @cp/mobile test -- community/manage`.
- Done when: unpublish, revoke and withdraw each reach the tombstone state from fixture data.

### T4 — Browse API with taste-match ranking
- Status: done — 6a6ac24af8
- Goal: ranked, filtered listing.
- Files: `services/api/src/routes/shared-plans.ts`, `packages/domain/src/community/match.ts`, `packages/domain/src/community/match.test.ts`, `services/api/test/community/browse.test.ts`.
- Steps: 1. Crew taste aggregation (context trip members; respects `hide_taste_tags` by using only visible tags). 2. Score fn (pure, tested). 3. SQL filter + keyset pagination + 5 min cache. 4. Guide's pick selection.
- Tests: `pnpm --filter @cp/domain test -- community/match`; `pnpm --filter @cp/api test -- community/browse`.
- Done when: fixture corpus ranks by match not copies; empty destination returns `[]` with total 0 (no fallback seeding).

### T5 — Crew plans screen 3o-1
- Status: done — 49c347ac6f
- Goal: browse UI.
- Files: `apps/mobile/src/app/community/[destinationId]/index.tsx`, `apps/mobile/src/features/community/browse/*`, tests, `e2e/community/browse.yaml`.
- Steps: 1. Filter chips + FLIP re-sort. 2. Hero pick + rows. 3. Empty/no-results/offline/report states. 4. Shared-element zoom to detail. 5. Register `3o-1` with P07 and 3d-1 entry count via P30 public API.
- Tests: `pnpm --filter @cp/mobile test -- community/browse`; `maestro test e2e/community/browse.yaml`.
- Done when: motion-freeze screenshot matches `3o-1_Crew_plans.png` with a fixture published corpus created through the real publish command in test setup.

### T6 — Shared plan detail 3o-2 + guide overlap note + save
- Status: done — e5a90a8a6f (note worded from server counts, no LLM)
- Goal: evaluate a plan.
- Files: `apps/mobile/src/app/community/plan/[sharedPlanId].tsx`, `apps/mobile/src/features/community/detail/*`, `packages/ai/src/routes/community/overlap-note.ts`, `packages/ai/evals/community/overlap-note/*`, `services/api/src/commands/community/save-shared-plan.ts`, tests.
- Steps: 1. Detail layout + expander + tips. 2. Overlap computation in planner (pure) → Haiku wording with persona; cache key. 3. Save/unsave. 4. Unpublished tombstone. 5. 3d-1 "CREW PLANS" count via P30 destination guide slot.
- Tests: `pnpm --filter @cp/mobile test -- community/detail`; `pnpm --filter @cp/ai eval community-overlap-note`.
- Done when: note numbers equal planner output in every eval case; saved plan appears in You saved list.

### T7a — Copy into draft: command + merge job + planner fns
- Status: done — 6a6ac24af8 (places go to Ideas, then the placing job drafts the change; never a redraft)
- Goal: fit-checked copy as a private ChangeSet (backend).
- Files: `services/api/src/commands/community/{copy-shared-plan,suggest-shared-plan-to-organiser}.ts`, `services/worker/src/jobs/community/merge.ts`, `packages/planner/src/community/{map-items,merge,season-check}.ts`, `packages/planner/test/community/*.test.ts`, `services/worker/test/community/merge.test.ts`.
- Steps: 1. Authz organiser; non-organiser suggestion path. 2. Redraft reservation rules (Q-41) using P46 redraft limit → `REDRAFT_LIMIT`. 3. Merge ops + constraint check via P16/P28 APIs. 4. ChangeSet (visibility organiser) + progress.
- Tests: `pnpm --filter @cp/planner test -- community`; `pnpm --filter @cp/worker test -- community/merge`.
- Done when: copying into an empty trip consumes no redraft; replacing consumes one and releases on job failure; over limit returns `REDRAFT_LIMIT`; a closed-in-season place is flagged clash.

### T7b — Copy UI
- Status: done — e5a90a8a6f
- Goal: copy interactions on 3o-2.
- Files: `apps/mobile/src/features/community/copy/*`, `e2e/community/copy-day.yaml`.
- Steps: 1. "+" arc + "+1" float, toasts. 2. No-trip sheet, suggest-to-organiser card. 3. Conflict → P29 review; `REDRAFT_LIMIT` → P46 paywall entry `redraft_last`.
- Tests: `pnpm --filter @cp/mobile test -- community/copy`; `maestro test e2e/community/copy-day.yaml`.
- Done when: Day-3 copy lands in 3c-9 with the toast; limit reached opens the P46 paywall.

### T8a — Ratings backend: command, tip moderation, aggregates
- Status: done — 36741d43cb
- Goal: ratings and anonymous tips (server).
- Files: `services/api/src/commands/community/rate-places.ts`, `services/worker/src/jobs/community/{tip-moderate,aggregate}.ts`, `packages/ai/src/routes/community/tip-moderation.ts`, `packages/ai/evals/community/tip-moderation/*`, `services/worker/test/community/{tip-moderate,aggregate}.test.ts`.
- Steps: 1. Batch command (idempotent op_ids). 2. Moderation via P13 `checkCompliance` (`public_text`; tip-specific cases added to `packages/ai/evals/compliance/`) → P30 `place_tips(source=community)` or P17 queue. 3. Nightly aggregates. 4. Inbox reminder registration.
- Tests: `pnpm --filter @cp/api test -- community/rate`; `pnpm --filter @cp/worker test -- community/tip-moderate community/aggregate`; `pnpm --filter @cp/ai eval community-tip-moderation`.
- Done when: an approved tip lands in `place_tips` without author identity; a rejected tip returns `CONTENT_REJECTED`.

### T8b — Rate the trip 3o-3 UI
- Status: done — e89e34dab9 (buttons and accessibility actions; no swipe gestures)
- Goal: card stack.
- Files: `apps/mobile/src/app/community/rate/[tripId].tsx`, `apps/mobile/src/features/community/rate/*`, tests, `e2e/community/rate-trip.yaml`.
- Steps: 1. Card stack with gestures + a11y actions + resume. 2. Offline batch queue. 3. Gentle rejected state. 4. End card → 3o-4.
- Tests: `pnpm --filter @cp/mobile test -- community/rate`; `maestro test e2e/community/rate-trip.yaml`.
- Done when: an approved tip appears on the place detail for another crew; rejected tip shows the gentle state.

### T9 — Admin community module + report handling + e2e sweep
- Status: blocked — moderation kinds and reporting built (6a6ac24af8); the admin console panel and the full-journey flows are not
- Goal: moderation tooling and verification.
- Files: `apps/admin/src/modules/community/*`, `services/api/src/admin/community/*`, `services/api/src/commands/community/report-shared-plan.ts`, `services/api/test/community/admin.test.ts`, `e2e/community/{full-journey,a11y}.yaml`.
- Steps: 1. Kind handlers (tip, shared_plan) in P17 queue. 2. Unpublish with reason + author notification. 3. Full journey A publishes → B browses/copies → B rates, on iOS + Android.
- Tests: `pnpm --filter @cp/api test -- community/admin`; `maestro test e2e/community/`.
- Done when: reported plan hidden after ops verdict within one sync cycle; all `e2e/community` flows green.

## Phase acceptance criteria
- [ ] Permission tests pass; public projection has no private fields; names-off hides identities
- [ ] Publish requires every participant's consent; faces blurred or photo excluded (fail-closed); consent withdrawal, member leave and account purge re-materialise or unpublish
- [ ] Browse ranks by taste match; empty corpus shows empty state (no seeded plans anywhere)
- [ ] Copy produces an organiser-only ChangeSet via constraint check; redraft rules per Q-41/C13
- [ ] Tips moderated before public; approved tips visible on place detail anonymised
- [ ] Web read-only link resolves through P51 `GET /v1/public/plan/{token}` → `readPublicPlan`; revoke works
- [ ] Evals pass (title-tags, pii-scrub, overlap-note, tip-moderation); Maestro `e2e/community/*` pass on iOS + Android

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Face blur misses a face | YuNet detection + fail-closed vs on-device `face_count`, report path, unpublish instantly |
| PII leak in notes | regex + LLM scrub, projection-only reads, eval gate |
| Empty corpus at launch looks dead | honest empty states, prominent "share your plan" after recap; entry count hidden at 0 |
| UGC triggers store social/age category | moderation before public; counsel item (Q-95) |
| Rollback | flag `community.enabled` hides entries; unpublish-all admin action |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Counsel sign-off on multi-member publish consent + faces (Q-69, Q-80) | publish disabled by flag; rating + tips still ship |
| Moderation staffing (ops) for queue | auto-reject low-confidence tips instead of queueing |
| P51 web viewer deployed | "Copy a read-only link" hidden until web route live |

## Open questions
1. Q-81 default (seed "starter plans" as guide's pick) conflicts with this phase's organic-only scope — default: organic only, no seeded plans; guide's pick = top match among real plans.
2. Doc delta: `shared_plans` extra columns, `plan_links` table, commands `copy_shared_plan`, `respond_publish_consent`, `report_shared_plan`, `suggest_shared_plan_to_organiser`, command `withdraw_publish_consent`, `readPublicPlan` shared fn (route owned by P51 §5.7), jobs `community.rematerialise`, `community.merge`, `community.tip_moderate`, `community.aggregate`.
6. YuNet licence/model version confirmed at T2 — fallback: exclude every photo with `face_count > 0`.
3. Publishing mid-trip — default: allowed, labelled "Planned, not travelled yet" until trip end.
4. Cost display currency — default: stored in publishing crew's settlement currency, rounded to 10 major units, converted for viewers with "≈".
5. Tips reuse `place_tips` (P30) rather than a separate table — default yes, with `source=community`.
