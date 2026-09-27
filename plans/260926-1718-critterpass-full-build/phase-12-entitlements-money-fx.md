---
phase: 12
title: Entitlement engine, money & FX primitives
status: pending
depends_on: [8]
wave: 3
features: [F-019, F-021]
screens: [4b-1, 4e-1, 4e-2, 4f-1, 4f-3, 5c-5, 3i-1, 3n-8, 3c-9]
tasks: 7
owns:
  - packages/entitlements/
  - packages/cost-engine/src/money/
  - packages/cost-engine/src/fx/
  - packages/cost-engine/test/money/
  - packages/cost-engine/test/fx/
  - packages/domain/src/entitlements/
  - packages/domain/src/surfaces/entitlements.ts
  - packages/db/src/schema/entitlements.ts
  - packages/db/src/schema/fx.ts
  - packages/db/migrations/*_entitlements_and_meters.sql
  - packages/db/migrations/*_fx_snapshots.sql
  - packages/db/seed/catalog-products-perks.ts
  - packages/db/test/permissions/{products,perks,user_entitlements,trip_entitlements,usage_counters,fair_use_counters,fx_snapshots}.test.ts
  - packages/db/test/quota.test.ts
  - services/api/src/entitlements/
  - services/api/test/entitlements/
  - services/worker/src/fx/
  - services/worker/test/fx/
  - apps/mobile/src/data/money/
  - apps/mobile/src/data/entitlements/
---
# Phase 12 — Entitlement engine, money & FX primitives

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | §3 entitlement matrix, resolution rules, fair-use caps, lifecycle overlays, products and codes; D7, D8; C8, C9, C12, C13, C23, C26, C46, C47, C48 |
| `docs/data-model.md` | §1 money/FX conventions; §3.14 `products`, `perks`, `ops_config` keys, `user_entitlements`, `trip_entitlements`, `usage_counters`, `redraft_reservations` (phase 28), `fair_use_counters`; §3.9 `fx_snapshots` |
| `docs/data-model-sync-and-privacy.md` | §4 streams `me`, `trip`, `catalog` |
| `docs/api-contracts.md` | §2.3 step 5 `entitle()`; §3 `QUOTA_EXHAUSTED`, `REDRAFT_LIMIT`, `SEAT_LIMIT`, `ENTITLEMENT_REQUIRED` |
| `docs/api-contracts-async.md` | `user:#uid` `entitlement.changed`, `usage.changed`; queue `fx.refresh` (fn here, cron in 15); §6 `snapshot/entitlements.json` |
| `docs/system-architecture.md` | §3 (entitlements + cost-engine are pure), §7.d Boost purchase sequence |
| `docs/code-standards.md` | §17 property tests for money |
| Subscriptions report | entitlement matrix, meter rules, store constraints |
| Master | §2 rows F-019, F-021, F-160, F-161, F-163; §8 matrix + resolution rules; R3, R16 |
| Renders | `docs/design-renders/screens/4b-1_Out_of_questions.png`, `3n-8_Language_and_currency.png`, `3i-1_Balances.png`, `4e-1_*.png`, `4e-2_*.png`, `4f-1_*.png`, `4f-3_*.png` |

## Overview
Goal: one pure, shared rule engine that answers "what can this user do in this trip right now" (Pass+, Boost, FTF, crew yearly, codes → capabilities, quotas, silent fair-use caps, server-driven perk lists), materialised server-side into synced rows the app and extensions read offline; plus exact money primitives (integer minor units, ISO exponents, allocation, rounding, HOME/LOCAL/BOTH display) and FX snapshots from Frankfurter v2.
Done when: `packages/entitlements` tests cover every matrix row and lifecycle overlay; the atomic quota function passes concurrency tests in Testcontainers; money property tests pass; FX ingest writes idempotent snapshots from recorded Frankfurter fixtures; `entitle(tx, …)` works inside any `withUser` tx (phase 10's pipeline calls it) and writes `entitlement.changed` / `usage.changed` outbox rows (relay delivery arrives with phase 10).

## Requirements
### F-019 Entitlement engine
| Aspect | Requirement |
|---|---|
| Scopes | user scope (`passPlus`, icon styles, NEXT FLIGHT widget, mailbox import, voice read-out, postcard) and trip scope (`boostActive`, seat cap, redraft limit, live map, sponsored) — rules exactly per product-decisions §3 |
| Sources | typed `EntitlementSource` union: `store_sub` (status active/grace/billing_retry/cancelled_active/paused/expired/revoked), `trip_boost` (window purchase → trip end + 7 d, C46), `ftf` (crew's first trip, Boost + Pass+ for every member, C9), `crew_year` (buyer everywhere; crew on crew trips), `code_grant` (gift/promo time). Loaders registry on server; purchase tables arrive in phase 46 and register loaders — with no sources everyone resolves to Free (true state before billing exists) |
| Lifecycle overlays | paused = loses unlimited guide + mailbox import + NEXT FLIGHT, keeps icon styles; cancelled = full to period end; expired = Pass+ styles revert on next foreground; grace 7 d server-side; boost ended = redrafts/live map/new seats > 6 pause, nobody removed |
| Quotas | guide meter: free 30/day (`ops_config guide.free_daily_limit`), `period_key` = device-tz date at event time, reset 00:00 device tz (D8, C47), queued question counts toward the new day; redrafts 3/trip crew-wide (C13: reserve on submit, release on failure; reverted counts); seats 6/16 over RSVP ≠ out (C26) via `app.trip_seats_held` |
| Exemptions | system guide work unmetered; guide in crew chat: asker's meter unless any member has Pass+ (4b-1 "Maya has Pass+" hint list `crew_pass_holders[]`, Q-75 badge opt-out respected) |
| Fair use | silent caps (§3 table): 300 turns/user/day (voice ≤ 90 min, camera ≤ 60), 400 crew-chat/crew/day, 20 redrafts/trip/day, 40 system jobs/trip/day, album 5,000 photos / 20 GB; breach → `degrade:'haiku'` then `degrade:'busy'`; never a paywall, never shown |
| Perk lists | server-driven `perks` rows (`tier`, `copy_key`, `is_shipped`/`enabled`, `sort`) synced via `catalog`; client renders only enabled perks (C48) |
| Push invalidation | recompute → `rt_outbox` `entitlement.changed` on `user:#uid` (and per member for trip scope); app rewrites App Group `snapshot/entitlements.json` (`{passPlus, boostedTripIds[], boostExpiresAt, generatedAt}`) — schema here, writer in phase 48/49 |
| Error payloads | `QUOTA_EXHAUSTED{used, limit, reset_at, crew_pass_holders[]}`, `REDRAFT_LIMIT{used, limit}`, `SEAT_LIMIT{cap, offer}`, `ENTITLEMENT_REQUIRED{perk, offers[]}` |
| Offline | client uses the same pure engine over synced rows for UI gating (4b-1 meter, locked widget states); server stays authoritative |
| UI | none here: 4b-1 card (32), paywalls (46), seat sheet (23), redraft sheet (28) consume these contracts; meter countdown "Pon is back in 7h 12m" from `reset_at` |

### F-021 Money & FX primitives
| Aspect | Requirement |
|---|---|
| Representation | `Money = {amountMinor: bigint, currency: ISO4217}`; exponent = full ISO 4217 minor-unit table as data (`currencies.ts`, generated from the ISO list; e.g. JPY/VND/KRW/ISK 0, IDR 2, BHD/KWD/OMR/JOD/TND 3; no "else 2" default — unknown code throws); separate `displayDecimals` override table for cash practice (IDR 0, ISK 0) used only by the formatter; stored amounts always ISO minor units; never floats |
| Arithmetic | add/sub same currency only; multiply by rational; `allocate(total, weights)` largest-remainder with deterministic tie order (by member id) so shares always sum to total |
| Rounding | modes `half_even` (default ledger), `half_up`, `up` (quotes "~$1,240 each"), `down`; display rounding separate from stored values |
| FX | `fx_snapshots(base, quote, rate numeric(20,10), as_of, source)`; convert with a pinned `fx_snapshot_id`; cross rates via EUR base; staleness flag > 48 h; offline: last 30 d for trip currencies via `catalog` |
| Frankfurter v2 | ingest fn fetches latest + needed dates, idempotent upsert on (base, quote, as_of, source), retries, 120 s outbound cap; cron `fx.refresh` registered in phase 15 |
| Display | `formatMoney(m, {locale, mode, home, fx})`: HOME / LOCAL / BOTH (3n-8 sample "Rp 75.000 ≈ S$6.40"), locale grouping (id-ID "75.000"), currency symbol disambiguation (S$, A$, NT$), compact notation ("~$1.2k"), approximate marker "≈" for converted values |
| App-wide mode | `user_settings.price_display` (home/local/both) read by `usePriceFormatter()`; crew balances always in crew settlement currency (3n-8 footer) |
| Home currency | `currencyForCountry(iso2)` table (used by F-041 home airport in phase 22) |

Undesigned states to design in code: none in this phase (engine outputs drive UI states elsewhere).

## Architecture & contracts
| Area | Delta (refs data-model §3.14 / §3.9) |
|---|---|
| Migration `entitlements_and_meters` | `products`, `perks`, `user_entitlements`, `trip_entitlements`, `usage_counters`, `fair_use_counters`; SQL fns `app.consume_quota(subject_kind, subject_id, metric, period_key, limit, reset_at) → (ok, used, limit, reset_at)` (single `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit RETURNING`), `app.release_quota(...)`, `app.bump_fair_use(...)`; RLS per data-model (O / T / R / S); `fair_use_counters` unpublished |
| Migration `fx_snapshots` | `fx_snapshots` (R, catalog stream) |
| Publication | `ALTER PUBLICATION powersync ADD TABLE products, perks, user_entitlements, trip_entitlements, usage_counters, fx_snapshots` in this phase's migrations + `packages/db/src/publication.ts` entries; stream file `infra/powersync/streams/entitlements.yaml` is written by phase 10 T3 (runs after this phase) |
| ops_config keys | `guide.free_daily_limit=30`, `seat.cap_free=6`, `seat.cap_boost=16`, `redraft.limit_free=3`, `fair_use.*`, `billing.grace_days=7` (seeded) |
| Packages | `packages/entitlements/src/{sources,resolve,capabilities,quotas,fair-use,perks,period}.ts`; `packages/cost-engine/src/money/{money,currencies,allocate,round,format,compact}.ts`; `packages/cost-engine/src/fx/{convert,snapshot}.ts` |
| Server | `services/api/src/entitlements/{materialise,loaders,entitle,notify}.ts`: `recomputeUser(uid)`, `recomputeTrip(tripId)`, `entitle(ctx, requirement)` for the command pipeline (reserve in same tx), `registerSourceLoader()` |
| Worker | `services/worker/src/fx/{frankfurter,ingest}.ts` exported job handler |
| Realtime | `entitlement.changed{scope, ids}`, `usage.changed{metric, used, limit, reset_at}` on `user:#uid` |
| Events | `entitlement.recomputed`, `quota.exhausted{metric}`, `fair_use.degraded{metric}` |

## Tasks
### T1 — Money core: currencies, arithmetic, allocation, rounding
- Goal: exact money math.
- Files: `packages/cost-engine/src/money/{money,currencies,allocate,round,index}.ts`, `packages/cost-engine/test/money/{money,allocate,round}.test.ts`.
- Steps: 1. ISO 4217 table as data (code, ISO exponent, symbol, narrow symbol) + `displayDecimals` override table. 2. bigint arithmetic + guards (currency mismatch throws typed error). 3. Largest-remainder allocate with stable tie-break. 4. Rounding modes. 5. fast-check property tests (sum preservation, idempotent rounding).
- Tests: `pnpm --filter @cp/cost-engine test -- money`
- Done when: 10k-case properties pass; golden tests: IDR stored with ISO exponent 2 and displayed with 0 decimals ("Rp 75.000"); ISK exponent 0 (Reykjavík, "ISK 12,900" never "12,900.00"); JPY 0; split of IDR/JPY totals sums exactly.
- Status: done — 694c4f0

### T2 — Display formatter, compact notation, home/local/both
- Goal: one formatter for the whole app.
- Files: `packages/cost-engine/src/money/{format,compact,country-currency}.ts`, `packages/cost-engine/test/money/format.test.ts`, `apps/mobile/src/data/money/{use-price-formatter,index}.ts`, `apps/mobile/src/data/money/__tests__/use-price-formatter.test.ts`.
- Steps: 1. `Intl.NumberFormat` (Hermes Intl) with disambiguated symbols. 2. Modes HOME/LOCAL/BOTH with "≈" and FX snapshot. 3. Compact ("~$1.2k"), approximate quotes. 4. Hook reads `user_settings.price_display` + home currency from synced rows.
- Tests: `pnpm --filter @cp/cost-engine test -- format`; `pnpm --filter @cp/mobile test -- data/money`
- Done when: "Rp 75.000 ≈ S$6.40" reproduced for id-ID/en-SG with the fixture rate; 16 launch locales snapshot-tested.
- Status: done — a1801fd

### T3 — FX snapshots: table, conversion, Frankfurter ingest
- Goal: pinned, offline-capable rates.
- Files: `packages/db/src/schema/fx.ts`, `packages/db/migrations/<ts>_fx_snapshots.sql`, `packages/cost-engine/src/fx/{convert,snapshot}.ts`, `services/worker/src/fx/{frankfurter,ingest}.ts`, `services/worker/test/fx/ingest.test.ts`, `services/worker/test/fixtures/frankfurter/`, `packages/db/test/permissions/fx_snapshots.test.ts`.
- Steps: 1. Table + R RLS. 2. Pure `convert(money, snapshot)` with half_even, cross via EUR. 3. Frankfurter v2 client (timeout, retry, typed errors) with recorded responses. 4. Ingest upsert idempotent; staleness metric.
- Tests: `pnpm --filter @cp/worker test -- fx`; `pnpm --filter @cp/cost-engine test -- fx`
- Done when: re-running ingest creates no duplicates; conversion SGD↔IDR↔JPY matches fixture math to the minor unit.

### T4 — Pure entitlement resolution and capabilities
- Goal: matrix → code.
- Files: `packages/entitlements/src/{sources,resolve,capabilities,perks,index}.ts`, `packages/domain/src/entitlements/{capability-keys,errors}.ts`, `packages/entitlements/test/{resolve,matrix,lifecycle}.test.ts`.
- Steps: 1. Source union + clock injection. 2. `passPlus`, `boostActive`, `guideUnlimited`, `redraftLimit`, `seatCap`, `helpMap`, `sponsored`. 3. Capability table (one row per matrix line) as data with test per row × source (Free, Pass+, Boost, FTF, crew yearly). 4. Overlays (paused, cancelled, expired, grace, boost ended, refund). 5. Perk list filter by `enabled`.
- Tests: `pnpm --filter @cp/entitlements test`
- Done when: every product-decisions §3 matrix cell has an asserting test; Boost does not grant mailbox import or icon styles (C8); earned icons never gated (C23).

### T5 — Quotas, period keys, fair-use decisions
- Goal: meter semantics shared client/server.
- Files: `packages/entitlements/src/{quotas,period,fair-use}.ts`, `packages/entitlements/test/{quotas,period,fair-use}.test.ts`.
- Steps: 1. `periodKey(instant, deviceTz)` + `resetAt` (DST and tz-change cases: user flies SGT → JST mid-day). 2. Meter decision incl. crew-chat Pass+ exemption and system exemption. 3. Redraft reservation semantics (reserve/commit/release). 4. Fair-use thresholds → `ok | degrade_haiku | busy`.
- Tests: `pnpm --filter @cp/entitlements test -- quotas|period|fair-use`
- Done when: 30th question allowed, 31st → `QUOTA_EXHAUSTED` payload with correct `reset_at` in device tz; tz change never grants a second free window within the same device-local date.

### T6 — Entitlement and meter tables, atomic quota SQL
- Goal: DB side with concurrency proof.
- Files: `packages/db/src/schema/entitlements.ts`, `packages/db/migrations/<ts>_entitlements_and_meters.sql`, `packages/db/seed/catalog-products-perks.ts`, `packages/db/test/quota.test.ts`, `packages/db/test/permissions/{products,perks,user_entitlements,trip_entitlements,usage_counters,fair_use_counters}.test.ts`.
- Steps: 1. Tables per data-model §3.14 + RLS + grants + publication allow-list entries. 2. `app.consume_quota` / `release_quota` / `bump_fair_use` SECURITY DEFINER. 3. Seed products (`pass_monthly`, `pass_yearly`, `boost_trip`, `boost_crew_year`, `gift_pass_3m`), perks (all enabled at launch, C48), ops_config keys.
- Tests: `pnpm --filter @cp/db test -- quota|permissions/(products|perks|user_entitlements|trip_entitlements|usage_counters|fair_use_counters)`
- Done when: 50 parallel consumes at limit 30 yield exactly 30 ok; `fair_use_counters` unreadable by `app_user` and unpublished; member reads trip entitlements, outsider does not.

### T7 — Server materialiser, `entitle()`, invalidation, extension snapshot schema
- Goal: authoritative rows + pipeline hook.
- Files: `services/api/src/entitlements/{materialise,loaders,entitle,notify,index}.ts`, `packages/domain/src/surfaces/entitlements.ts`, `apps/mobile/src/data/entitlements/{use-entitlements,index}.ts`, `services/api/test/entitlements/{materialise,entitle}.test.ts`.
- Steps: 1. Loader registry (empty source set = Free). 2. `recomputeUser/Trip` writes rows + `trip.seat_cap`/`redraft_limit` columns + outbox events; recompute on crew membership/trip status domain events via hook from phase 8. 3. `entitle(ctx, {kind:'quota'|'capability'|'seat'|'redraft', …})` inside the command tx → reservation or typed error. 4. zod schema for App Group entitlements snapshot (Swift/Kotlin codegen by phase 48). 5. Mobile hook evaluating pure engine over synced rows.
- Tests: `pnpm --filter @cp/api test -- entitlements`; `pnpm --filter @cp/mobile test -- data/entitlements`
- Done when: registering a test-only source loader in the test suite flips a trip to 16 seats and writes `entitlement.changed` `rt_outbox` rows for every member; `entitle(tx, …)` called inside a raw `withUser` tx that then rolls back leaves `usage_counters` unchanged (pipeline-level test lives in phase 10 T1, which depends on this phase).

## Phase acceptance criteria
- [ ] Every entitlement matrix cell and lifecycle overlay covered by a passing test.
- [ ] Guide meter 30/day with device-tz reset; concurrency-safe consume proven.
- [ ] Fair-use caps silent (no client-visible table, degrade decisions only).
- [ ] Perk lists read from synced `perks` rows; nothing hard-coded in clients.
- [ ] Money property tests pass; no float in money paths (lint rule `no-restricted-syntax` on `parseFloat`/`Number(` in money dirs).
- [ ] FX ingest idempotent; conversions pinned to `fx_snapshot_id`.
- [ ] HOME/LOCAL/BOTH formatter reproduces design samples.
- [ ] Permission tests for all new tables green; publication check passes.

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Client/server entitlement drift | same pure package; server authoritative; client gating advisory only |
| Hermes Intl gaps for some locales | test on Hermes in phase 7 app; fallback symbol table |
| Frankfurter outage | keep last snapshot; staleness flag shown as "rates from {date}" |
| Quota tz abuse (changing device tz) | period key from device tz at event time, plus server guard: at most one reset per 20 h per user |
| Source loaders from phase 46 change shapes | `EntitlementSource` union is the contract; extend only by adding variants |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Store products / RevenueCat (phase 46) | engine resolves Free; product rows seeded with store ids filled when created |
| Pricing confirmation (crew yearly tier) | `products` rows editable in admin; copy reads store price |

## Open questions
| Q | Default implemented |
|---|---|
| Doc delta: api-contracts-async lists `fx.refresh` cron in phase 15 | fn here, cron registration in 15 (as documented) |
| Tz-change reset guard (20 h) not in docs | implemented; add to product-decisions C47 note |
| Crew-chat metering when multiple askers | each asker's own meter unless any crew member holds Pass+ |
| FX source for currencies Frankfurter lacks (e.g. VND on some dates) | Frankfurter v2 multi-provider coverage; if missing, last known rate + staleness flag |
