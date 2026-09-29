---
phase: 18
title: Content factory: critter forms, personas, places, phrases
status: in_progress
depends_on: [4, 5, 13, 14, 17]
wave: 7
features: [F-009]
screens: [3l-2, 3l-3, 3l-8, 3l-9, 3l-10, 3b-1, 3b-7, 3b-8, 3a-4, 3h-3, 3k-6, 3p-1]
tasks: 13
owns:
  - tools/content-factory/**
  - packages/content/**
  - packages/db/src/schema/content.ts
  - packages/db/migrations/*_content_catalogue.sql
  - packages/db/test/permissions/{content-catalogue,critter-public}.test.ts
  - services/api/src/admin/content/**
  - services/worker/src/content/**
  - apps/admin/src/modules/content/**
---
# Phase 18 — Content factory: critter forms, personas, places, phrases

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (Claude tiers, Batch), D9 (full content at launch via factory), D10 (supplier content never cached/fed to LLM; curated POI DB), C4 (setGroup vs rarity), C5 (guide colours), C20 (Golden Tokek any day), C21 (true silhouettes, names server-side until found), C38 (stickers ≠ forms), C39 (home set), C40 (spawn rule kinds; epic = pose + pink edge), guest-guide row (§6) |
| `docs/system-architecture.md` | §3 (`packages/content`, `tools/`), §4.6 AI (personas in `packages/content`), queues `content.*` |
| `docs/code-standards.md` | §15 AI rules, seeds = content-factory data, §17 testing, security (R2) |
| `docs/data-model.md` | §3.9 critters (`critter_sets`, `critters`, `critter_forms`, `spawn_rules`), §3.13 (`pois`, `content_releases`, `persona_packs`, `help_articles`, `map_regions`), `phrase_cards`, `emergency_numbers`, `facilities`, `ops.content_reviews` |
| `docs/data-model-sync-and-privacy.md` | `catalog`, `trip_pack`, `help` streams; `critter_public` projection; table → phase row 18 |
| `docs/api-contracts.md` | §4.17 `approve_content_batch`/`reject_content_batch`, `upsert_poi`, `set_emergency_info` |
| `docs/api-contracts-async.md` | `content.publish` queue (§2.2) |
| Phase files | P04 (`RenderSpec`, `FormSpec`, `paletteSchema`, epic pose mechanics `tilt/hop`, gallery), P05 (`critter-bake` manifest, contact-sheet renders, `artVersion`), P13 (persona schema/loader, `batch.ts`, routing, Langfuse), P14 (POI importer, `upsert_poi`, geofences), P17 (admin kit: `defineCatalogue`, `defineQueue`, audited commands) |
| Reports | `design-analysis-260926-1143-critter-render-engine-report.md` §3.1–3.8; `design-analysis-260926-1143-critters-after-report.md` 3l-2/3/8/9/10, §4, §8; `researcher-260926-1143-ai-guide-report.md` (persona packs, voice, guest guide); `design-analysis-260926-1143-you-community-help-report.md` 3p-1; `researcher-260926-1649-travel-supplier-apis-report.md` (supplier content rules); master §2 F-009 (+ consumers F-039, F-061, F-097, F-119, F-121, F-123, F-125, F-127, F-153), R10 |
| Renders | `docs/design-renders/screens/3l-2_Your_pass.png`, `3l-9_Once_a_year.png`, `3l-10_Sakura_Pon.png`, `3l-8_Vietnam_set.png`, `3b-8_*.png`, `3a-4_*.png`, `3k-6_*.png` (exact labels from `screens.json`) |

## Overview

Goal: a repeatable, audited pipeline — `brief → generate (Claude) → validate (code) → render (bake) → review (admin) → founder approve → publish (packages/content + DB)` — that produces every piece of launch content: 150 locals × 4 forms (600 forms) with names, notes, palettes, poses, requirement copy, spawn rules and legendary windows; 6 persona packs + guest guide; curated POIs for the 6 guide cities and a 61-place destination index; phrase cards with TTS audio; the taste quiz; help articles; emergency numbers, facilities and insurance info; plus an IP/trademark checklist.

Done when: `pnpm content <kind> run` executes every stage idempotently for each kind; nothing reaches `packages/content` or the DB without schema + validator pass, a rendered review item and a founder `approve_content_batch`; published releases are versioned and checksummed, bake picks up new forms, and the app/api read only published releases.

## Requirements

### F-009 Critter content ops (and all launch content kinds)

| Kind | Designed behaviour / content contract | Generation | Validators (code, blocking) |
|---|---|---|---|
| Critter sets | 61 places, `setGroup` 0–3 (0 Vietnam home set 10, 1: 10×5, 2: 20×3, 3: 30×1 = 150); stable ids `cp-###` pinned in data (never positional) (C4) | imported from P04 `src/data` (design dex) → content records | ids unique + stable vs previous release; counts per group exact |
| Critters | name (native script + romanised, hidden until found C21), species, art_params (P04 `ArtParams`), canonical_seed | names/notes: Sonnet 5 with place brief; art_params unchanged from design unless IP rename | script matches place language; romanisation present; IP check; no real-person/brand names |
| Forms (600) | common = design palette; rare = full 3-slot recolour; epic = recolour + pose + pink edge at every size (C40, pose from P04 mechanics, incl. `tilt/hop` for pose-less archetypes); legendary = gold recolour + gold die-cut edge, bound to a legendary window or hardest place challenge; name, note (≤140 chars, guide-voice-free neutral), requirement_copy ("At a water temple"), xp by rarity | palettes: deterministic generator (OKLCH hue rotations seeded by id) + Sonnet proposes 3 options per form, code picks by validator score; poses: code chooses from archetype-supported set | ΔE2000 vs common ≥ 18 (rare/epic), legendary within gold family; sticker-bg contrast ≥ 3:1; no palette collision with another form in same set (ΔE ≥ 10); pose ∈ supported(archetype); epic pixel-diff vs common > 3% (P04 test reused); tier accent colours reserved |
| Spawn rules | `kind ∈ presence/any_of/set_count/window/co_presence` (C40); poi_ids from curated POIs; geofence radius, dwell_s (default 50 m / 300 s), windows incl. solar `after_dark`/`by_sunrise`; `min_members` for co_presence; home-set rules flagged foreground-only (C39) | Sonnet drafts rule + copy from POI list; code resolves POIs | every poi_id exists + active; geofence radius 30–300 m; window resolvable in destination tz; copy matches kind ("At a …" for any_of) |
| Legendary windows | 6 designed guide windows exact (Marigold Ajo Nov 1–2; Sakura Pon early Apr after dark; Festa Sardi Jun 12; Inti Paco Jun 24; Puffling Lundi late Aug; Golden Tokek any day, all six on Batur by sunrise — C20); every local legendary gets either a dated window (festival/season, verified source URL) or a "hardest thing a place has" challenge rule | Sonnet proposes with cited source; founder confirms | date rule parses (RRULE / solar / range); source URL present for dated windows; ≥ 1 window per month across the catalogue (calendar strip 3l-9 never empty) |
| Persona packs | 6 guides + guest (Tokek as guest guide, lighter pack) per P13 schema: voice, lexicon, local words (vetted), sample lines, chattiness variants, colour per C5, ElevenLabs voice settings, AI disclosure string, promptfoo fixtures | Sonnet from design lines (`screens.json`) + founder notes | P13 zod schema; local words vetted flag; promptfoo persona suite passes; guest pack contains no locals' names |
| Curated POIs | 6 guide cities: sights, food, nightlife, nature, temples, practical (≥ 250/city) with editorial fields (why go, best time, time needed, tags → taste taxonomy, crowd hint, dress/etiquette) | P14 importer (FSQ OS Places + Overture, licences recorded) → Sonnet writes editorial from open data only (never supplier content, D10) | licence field present; hours tz-valid; geo inside destination bbox; no supplier text (n-gram check against nothing cached: source must be fsq_os/overture/editorial) |
| Destination index | 61 places: name, country, tz, currency, languages, guide or guest, hero critter, month crowd/editorial season hints (P15 overlays live data) | Sonnet + open data | tz/currency ISO valid; each place maps to one set |
| Phrase cards | per destination language: greetings, help/emergency, food/allergy, transport, politeness; text + gloss + romanisation + contexts; TTS audio (ElevenLabs multilingual, per-language native voice) → R2 `audio_key` | Sonnet; native-speaker review flag | script/lang match; emergency phrases flagged `needs_native_review` until reviewed (cannot publish without) |
| Taste quiz | 6 questions (3a-4), answer → tag taxonomy, chips mode, retake | Sonnet from design copy | exactly 6 questions; every tag in taxonomy |
| Help articles | help centre (3p-1) categories, articles MDX (`body_md`), locale, embeddings for search | Sonnet from product-decisions + support policy | links resolve; no promise contradicting D10 (holds/merchant) — lint rule over banned phrases ("we hold your room", "we charge you") |
| Emergency datasets | `emergency_numbers` per country (61 places' countries), `facilities` (clinic/hospital/pharmacy/embassy) for 6 guide cities, `verified_at` | LLM only structures data from cited official sources; never invents numbers | every number has source URL + verified_at; human verification required per record |
| Insurance info | generic guidance article per country + claim checklist (no provider endorsements) | Sonnet | banned-claim lint; legal review flag |
| IP/trademark checklist | per name: exact/fuzzy match against denylist (brands, mascots, e.g. "Buddy bear"), EUIPO/USPTO/WIPO search links; founder signs off | code + manual | denylist fuzzy score < threshold; checklist item resolved before approval |

Pipeline behaviour: stages are resumable per item (content hash of inputs = cache key); generation uses P13 `batch.ts` (Message Batches) and structured output; cost + tokens logged per batch (Langfuse); render stage produces contact sheets (per set: 4 forms × common/locked silhouettes × 24/96 pt × light/dark; guide poses; epic/legendary edges) via `critter-bake`; review queue in admin shows item + render + validator report; founder approval is per batch; rejection records notes and re-queues items with notes as generation input.

Undesigned (design in code, D11): admin content review screens (batch list, item grid, side-by-side previous vs new, approve/reject per item and batch), release history + rollback.

## Architecture & contracts

| Item | Delta |
|---|---|
| Migration `*_content_catalogue.sql` | `content_releases`, `critter_sets`, `critters`, `critter_forms`, `spawn_rules`, (no `critter_public` view: PowerSync logical replication cannot carry views and a per-viewer projection cannot live in the shared `catalog` bucket; catalogue rows carry no names — names live in `critter_names` (critter_id, locale, name; S, not in any publication) and are copied into the viewer's own `collection_entries.critter_name` by the collect command, synced via the user-scoped `collection` stream; the publish job re-writes `critter_name` on rename; **doc delta**, P40 consumes), `phrase_cards`, `emergency_numbers`, `facilities`, `help_articles` (+ HNSW on embedding), `ops.content_reviews` (doc delta: moved here from P17) |
| RLS | catalogue tables: R for `app_user` (published rows only: `release_id` in published releases); writes only `app_system` via publish job; `critter_names` has no grant to `app_user`/`powersync_repl`/`guide_reader` (read only by `app_system` and the collect command); `guide_reader` gets `llm.phrase_cards`, `llm.help_articles`, `llm.persona_packs` (P13 views) |
| Sync | `catalog` (name-free): sets, critters, forms, phrase_cards, emergency_numbers; `trip_pack`: spawn_rules, facilities (per destination); `help`: help_articles |
| Commands | `approve_content_batch` / `reject_content_batch {batch_id, notes}` (role content; owner required for approve = founder), `rollback_content_release {kind, to_version}` (doc delta) |
| Jobs | `content.publish` (existing): load release artifact from R2 `content/releases/<kind>/<version>.json`, verify checksum, upsert in one tx, mark `published`, emit `catalogue.changed`, trigger bake manifest check; `content.embed` (doc delta) for help/POI embeddings |
| Package | `packages/content`: `src/schemas/*.ts` (zod, re-exported to api/app/web), `releases/<kind>/current.json` (pulled from approved release for app bundle + bake), `mdx/help/**`, `src/load.ts` |
| Factory CLI | `tools/content-factory`: `pnpm content <kind> brief|generate|validate|render|review|pull` ; `work/<kind>/<batch>/` (gitignored), validator registry, IP checker, cost report |
| AI | routes `content.author` (Sonnet 5), `content.bulk` (Haiku 4.5 for short copy), via `packages/ai` batch; no supplier content in inputs (static check: inputs only from `packages/content`, P14 POI open data, design text) |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Content Batches.dc.html`, `docs/design-renders/pages/Ops-Content-Batches.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-content-platform-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| Batch statuses REVIEW / BLOCKED / PUBLISHED / REJECTED | `content_releases.status` gains `blocked`, `rejected` |
| Batch identity vs release ("batch 2026-09-27-forms-07" publishes "forms v4") | `batch_key`, `title` on the release row; list shows the live version per kind |
| Pipeline stage strip, founder gate (G1–G7), blocked reason | `stage`, `gate`, `blocked_reason` columns written by the factory CLI |
| Route, model, tokens, cost per batch | roll up from `ai_usage` by job id (`ai_usage.route` from phase 58); no new cost columns |
| Validator WARN (non-blocking) + per-item report, IP check pill | `ops.content_reviews.report jsonb` with `severity pass\|warn\|fail`; `ip_status` on the batch |
| KEEP / REJECT ITEM with note | new command `review_content_item {batch_id, item_ref, verdict: keep\|reject, notes?}` (content) |
| APPROVE & PUBLISH · OWNER; Roll back | `approve_content_batch` owner-only (api-contracts row fixed by phase 58); `rollback_content_release` added to §4.17 |
| Reads | `GET /v1/admin/content/batches`, `/content/batches/:id` |
| My work / badges | not here: phase 58 shares this wave, so phase 59 registers `work` + `count` for batches; don't wait on 58 |

## Tasks

### T1 — Content schemas and release format
- Goal: one zod source for every content kind.
- Files: `packages/content/{package.json,tsconfig.json}`, `packages/content/src/schemas/{critters,forms,spawn-rules,legendary-windows,personas,places,phrases,taste-quiz,help,emergency,insurance,release}.ts`, `packages/content/src/load.ts`, `packages/content/test/schemas.test.ts`.
- Steps: 1. Schemas reuse P04 `ArtParams`/`FormSpec`/`paletteSchema` and P13 persona schema. 2. Release envelope `{kind, version, checksum, items[], generated_by, approved_by}`. 3. Loader with checksum verify. 4. Seed current designed data (Tokek forms, Sakura Pon, 6 guide windows) as release v1 fixtures.
- Tests: `pnpm --fail-if-no-match --filter @cp/content test`
- Done when: designed fixtures validate; tampered checksum rejected.
- Status: done — 5c80c1d

### T2 — Catalogue migration, name-free catalogue, permission tests
- Goal: DB tables + privacy boundary for names-until-found.
- Files: `packages/db/src/schema/content.ts`, `packages/db/migrations/<ts>_content_catalogue.sql`, `packages/db/test/permissions/{content-catalogue,critter-public}.test.ts`.
- Steps: 1. Tables per Architecture. 2. `critter_names` table + grants (none to `app_user`/`powersync_repl`); `setCollectedName(tx, uid, critter_id)` helper for P40's collect command. 3. Publication entries for catalog/trip_pack/help. 4. Permission tests.
- Tests: `pnpm --fail-if-no-match --filter @cp/db test -- permissions/content-catalogue permissions/critter-public`
- Done when: `app_user` and `powersync_repl` cannot read `critter_names`; publication check shows no name column in `catalog`; helper writes the name only into the caller's own `collection_entries` row; `app_user` cannot write catalogue; unpublished release rows invisible.
- Status: done — 5c80c1d

### T3 — Factory core: stages, validators, IP checker, cost log
- Goal: resumable CLI pipeline.
- Files: `tools/content-factory/{package.json,src/cli.ts,src/stages/*.ts,src/validators/registry.ts,src/ip/{denylist.json,check.ts},src/cost.ts}`, tests.
- Steps: 1. Stage runner with content-hash cache. 2. Generate via `packages/ai` batch + structured output. 3. Validator registry returning item reports. 4. IP checker (exact + fuzzy + checklist markdown per batch). 5. Upload batch to R2 + create `content_releases` draft via admin API.
- Tests: `pnpm --fail-if-no-match --filter @cp/content-factory test`
- Done when: re-running an unchanged batch makes zero model calls; failing validator blocks `review` stage.
- Status: done — 5c80c1d

### T4 — Admin content review + approve/publish
- Goal: founder approval gate and publish job.
- Files: `apps/admin/src/modules/content/**`, `services/api/src/admin/content/{batches,commands}.ts`, `services/worker/src/content/{publish,embed}.ts`, tests.
- Steps: 1. Batch list/item grid with render thumbnails (HMAC media URLs), validator report, previous vs new. 2. Per-item verdicts → `ops.content_reviews`; batch approve (owner) / reject with notes. 3. `content.publish` job + `rollback_content_release`. 4. `pnpm content <kind> pull` writes `packages/content/releases/<kind>/current.json`.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- admin/content && pnpm --fail-if-no-match --filter @cp/worker test -- content/publish && pnpm --fail-if-no-match --filter @cp/admin exec playwright test content.spec.ts`
- Done when: approve → rows live + `catalogue.changed`; rollback restores previous version; non-owner approve is `FORBIDDEN`.
- Status: done — 5c80c1d

### T5 — Critter names, notes, IP pass (150 critters)
- Goal: all 150 critters named/noted with IP clearance.
- Files: `tools/content-factory/src/kinds/critters/{brief,prompt,validate}.ts`, `tools/content-factory/briefs/places/*.md`.
- Steps: 1. Import design dex (stable ids). 2. Generate names/notes per set. 3. Validate + IP. 4. Contact sheet + review batch.
- Tests: `pnpm content critters validate --all`
- Done when (agent): 150 critters generated (Batch submitted or resumed via `pnpm content critters resume`), validators + automated IP denylist pass, review batch queued in admin. Founder IP sign-off → Founder gate checklist G1.
- Status: done — c40ac1e

### T6 — Forms: palettes, poses, edges (600 forms)
- Goal: every form render-valid and distinct.
- Files: `tools/content-factory/src/kinds/forms/{palette-gen,pick,validate,contact-sheet}.ts`, bake manifest `tools/content-factory/manifests/forms-review.json`.
- Steps: 1. Deterministic OKLCH candidates + Sonnet options. 2. Score + pick. 3. Pose from archetype support. 4. Contact sheets via `critter-bake`.
- Tests: `pnpm content forms validate --all && pnpm content forms render --check`
- Done when (agent): validators run over every generated form; contact sheets exist for every set generated so far; review batch queued. If the Message Batch is still running, the session ends after submit and `pnpm content forms resume` finishes it in a follow-up session. Founder approval → G2.
- Status: done — c40ac1e

### T7 — Curated POIs + 61-place index
- Goal: POI DB for 6 guide cities and destination index.
- Files: `tools/content-factory/src/kinds/places/**`.
- Steps: 1. Run P14 importer per city, then a cross-language duplicate sweep: auto POIs ≤ 60 m apart with name trigram < 0.6 (e.g. "Chùa Cầu" vs "Japanese Covered Bridge") go to a Jev decision route `poi.duplicate_tiebreak` (Noul, many pairs per call through P13 `decide()`); p ≥ route threshold → merge through P14 merge redirects, gray band → content review batch. 2. Editorial generation from open data. 3. Taste tag mapping. 4. Publish via `upsert_poi` batch + `content.embed`.
- Tests: `pnpm content places validate --all`
- Done when (agent): importer + editorial generation ran for every guide city; validators pass on every record produced; zero supplier-sourced text; review batch queued. Counts (≥ 250/city, 61 index entries) are phase acceptance, approval → G3.
- Status: done — 07b26878, f3f151ae. Staging batch `2026-09-29-places-01` (release 01a0ee57): 2,395 items, 0 validator failures, 43 duplicate warnings resolved (21 rejected as the same place, 22 kept), 68 merges. Published v1 with 2,374 items. Curated POIs synced per city after merges: mexico-city 394, bali 392, cusco 386, kyoto 380, iceland 377, lisbon 377. Approved for staging testing by founder instruction; production review (G3) pending

### T8 — Spawn rules + legendary windows
- Goal: every form obtainable; calendar complete.
- Files: `tools/content-factory/src/kinds/spawns/**`, `tools/content-factory/src/kinds/windows/**`.
- Steps: 1. Rule per form (kind per C40). 2. 6 designed windows exact; local legendaries dated (with source) or challenge rules. 3. Reachability validator: each form has ≥ 1 resolvable rule.
- Tests: `pnpm content spawns validate --all && pnpm content windows validate --all`
- Done when (agent): reachability validator passes over the generated set; designed six match 3l-9 render text; review batch queued. Dated-window source confirmation → G4.
- Status: done — c40ac1e

### T9 — Persona packs + guest guide
- Goal: approved 7 packs published.
- Files: `tools/content-factory/src/kinds/personas/**`, `packages/content/releases/personas/`.
- Steps: 1. Expand P13 v0 packs with vetted local words, sample lines, chattiness variants. 2. Run promptfoo persona suite (`packages/ai` evals). 3. Review + publish to `persona_packs`.
- Tests: `pnpm content personas validate && pnpm --fail-if-no-match --filter @cp/ai eval -- persona`
- Done when (agent): 7 packs validate; eval suite green; guest pack excludes locals' names; review batch queued. Founder approval → G5.
- Status: done — d85c0b8

### T10 — Phrase cards + TTS audio
- Goal: offline-ready phrase cards for every destination language.
- Files: `tools/content-factory/src/kinds/phrases/{generate,tts,validate}.ts`.
- Steps: 1. Generate per language/context. 2. ElevenLabs Flash TTS → R2 (content-hash keys). 3. Native-review flags for emergency/allergy phrases.
- Tests: `pnpm content phrases validate --all`
- Done when (agent): every destination language has all contexts generated; every card has audio (or `audio_pending` when no key); publish job refuses emergency/allergy cards with review flag unset (test). Native-speaker review → G6.
- Status: done — d85c0b8

### T11 — Taste quiz + help articles
- Goal: quiz content and help centre corpus.
- Files: `tools/content-factory/src/kinds/{taste-quiz,help}/**`, `packages/content/mdx/help/**`.
- Steps: 1. Quiz from 3a-4 copy + taxonomy. 2. Help articles per category (3p-1), banned-phrase lint (D10 truthfulness). 3. Embeddings via `content.embed`.
- Tests: `pnpm content taste-quiz validate && pnpm content help validate --all`
- Done when: quiz = 6 questions, all tags valid; help search returns an article for each 3p-1 category query.
- Status: done — d85c0b8

### T12 — Emergency numbers, facilities, insurance info
- Goal: verified safety datasets.
- Files: `tools/content-factory/src/kinds/{emergency,facilities,insurance}/**`.
- Steps: 1. Structure from official sources (URL per record). 2. Generate a per-record verification checklist (source URL, retrieved_at) for the founder. 3. Publish via `set_emergency_info` / catalogue batch.
- Tests: `pnpm content emergency validate --all && pnpm content facilities validate --all`
- Done when (agent): every country of the 61 places has a sourced record with `verified_at null` + checklist entry; facilities for 6 guide cities with ≥ 1 hospital and pharmacy each; publish job refuses records with `verified_at null` (test). Human verification → G7.
- Status: done — d85c0b8 (57 of 61 countries sourced; Canada, Tunisia, Taiwan and Tanzania need hand research)

### T13 — Opening hours research from official sources (web search)
- Goal: fill the empty `hours` of POIs from official venue or tourism sites, human-verified before use (D23).
- Files: the places batch step and its review view in the ops console catalogue (owned places-batch files), tests with recorded search and model fixtures.
- Steps: 1. For POIs without hours, search official venue and tourism domains first; the general search keeps the supplier blocklist and also excludes Google Maps and TripAdvisor (D6). 2. Extract weekday hours and dated exceptions, each with `source_url` and `fetched_at`. 3. Proposed hours stay unverified; the ops console shows them with their source, and a human sets `verified_at`. Only verified hours are served. 4. Foursquare live checks remain the runtime source.
- Tests: extraction on recorded fixtures; only verified hours are served (test).
- Done when: a batch proposes cited hours for POIs without hours, and a verified proposal fills `hours` for OPEN NOW and fit checks.
- Status: done — d85c0b8

## Phase acceptance criteria

- [ ] `pnpm --fail-if-no-match --filter @cp/content test` and all `pnpm content <kind> validate --all` green
- [ ] Permission tests green (names hidden until found; catalogue read-only to `app_user`)
- [ ] 150 critters, 600 forms, 600 reachable spawn rules, 6 designed + local legendary windows published in an approved release
- [ ] 7 persona packs approved; persona eval suite green
- [ ] Curated POIs ≥ 250 per guide city; 61-place index; phrase cards + audio; taste quiz; help articles; emergency + facilities + insurance published
- [ ] `critter-bake --check` clean after `pnpm content forms pull`
- [ ] No release publishes without owner approval (test); IP checklist resolved per batch
- [ ] Static check: factory inputs never include supplier adapter output

## Founder gate checklist (human, not agent sessions)

Tracked here and mirrored in plan §5; agent tasks never wait on these.

| Gate | Human action | Unblocks |
|---|---|---|
| G1 | IP/trademark sign-off per critter batch | critter release approval |
| G2 | Approve form contact sheets per set | forms release |
| G3 | Approve POI + index batches | places publish |
| G4 | Confirm dated legendary-window sources | windows release |
| G5 | Approve 7 persona packs | persona release |
| G6 | Native-speaker review of emergency/allergy phrases | those cards publish |
| G7 | Per-record verification of emergency numbers + facilities | safety datasets publish |

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| 600 forms look samey or off-model | validator thresholds + contact sheets; reject → regenerate with notes; rollback release |
| Wrong emergency numbers | human verification required per record; sourced; monthly re-verify job reads `verified_at` |
| IP collision in names | denylist + fuzzy + manual checklist; rename keeps stable id |
| Model cost blow-up | Batch API, content-hash cache, per-batch cost cap in CLI |
| Bad release in production | `rollback_content_release` restores previous version in one tx |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Founder review time for batches | batches stay `review`; app ships previous approved release (designed fixtures v1 at minimum) |
| Native-speaker review of phrases | emergency/allergy cards blocked; other cards publish |
| ElevenLabs account + voices (D5) | phrase cards publish text-only with "audio pending" flag; TTS job re-runs when key set |
| FSQ OS Places / Overture licence acceptance | P14 importer blocks; places batch waits |
| Trademark counsel review (D18) | checklist stays open; names marked provisional |

## Open questions

| Question | Default |
|---|---|
| Doc delta: `ops.content_reviews` created in P18 not P17 | as stated |
| Doc delta: `rollback_content_release` command, `content.embed` queue | add with these names |
| POI count per guide city | ≥ 250 |
| Local legendary without a festival | "hardest thing a place has" challenge rule |
| Phrase languages for guest-guide places | destination primary language only |
