---
phase: 33
title: Money: ledger, expenses, receipt scan, settle up, budget
status: in_progress
depends_on: [10, 12, 13, 27]
wave: 14
features: [F-105, F-106, F-107, F-108, F-109]
screens: [3i-1, 3i-2, 3i-3, 3i-4, 3i-5, 3i-6, 3g-1, 3n-8, 5b-1]
tasks: 12
owns:
  - packages/cost-engine/src/ledger/
  - packages/cost-engine/src/settle/
  - packages/cost-engine/src/forecast/
  - packages/cost-engine/test/ledger/
  - packages/cost-engine/test/settle/
  - packages/cost-engine/test/forecast/
  - packages/domain/src/money/
  - packages/domain/src/payout/
  - packages/domain/test/payout/
  - infra/powersync/streams/money.yaml
  - packages/db/src/schema/money.ts
  - packages/db/src/schema/stickers.ts
  - packages/db/migrations/*_expenses_ledger_payments.sql
  - packages/db/migrations/*_receipts.sql
  - packages/db/migrations/*_payout_methods.sql
  - packages/db/migrations/*_stickers.sql
  - packages/db/test/permissions/{expenses,expense-shares,ledger-entries,payments,payout-methods,receipts,stickers}.test.ts
  - packages/ai/src/routes/receipt-parse/
  - packages/ai/evals/receipt-parse/
  - packages/i18n/locales/en/money/
  - services/api/src/commands/money/
  - services/api/src/routes/receipts.ts
  - services/api/src/routes/payout-reveal.ts
  - services/api/src/money/
  - services/worker/src/jobs/money/
  - apps/mobile/modules/cp-ocr/
  - apps/mobile/src/app/(tabs)/wallet/_layout.tsx
  - apps/mobile/src/app/(tabs)/wallet/money/
  - apps/mobile/src/features/money/
  - e2e/money/
---
# Phase 33 — Money: ledger, expenses, receipt scan, settle up, budget

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (Sonnet vision keyed by OCR line id), D7 (Boost split = IOUs only); C24 (no in-app money movement), C29 (Wallet = BOOKINGS \| MONEY), C31 (itemised receipts at launch), C38 (Settled Tokek, sticker shelf); §3 "always free: splitting money (incl. itemised)"; §7 Q-50…Q-53 |
| `docs/data-model.md` | §1 money conventions (integer minor units, ISO-4217 exponent); §3.8 `expenses`, `expense_shares`, `expense_edits`, `receipts`, `ledger_entries`, `payments`, `payout_methods`, `member_balances`; §3.9 `stickers`; §3.4 `budget_plans` (read) |
| `docs/data-model-sync-and-privacy.md` | §1 field encryption (payout), reveal functions `app.reveal_payout`; §4 streams `trip`, `crews`, `me`; §5 `crew_money:` realtime rules; table → phase map (33) |
| `docs/api-contracts.md` | §4.9 money commands; §5 `POST /v1/receipts`, `POST /v1/media/presign` (purpose `receipt`); §6 tools `balances_read`, `propose_expense`; §3 error codes |
| `docs/api-contracts-async.md` | `crew_money:{crew_id}`; queue `ai.receipt`; action category `cp.money` (N-16) |
| `docs/system-architecture.md` | §4 command pipeline, §4 AI (grounding), §5 authz |
| `docs/code-standards.md` | money, DB, AI, testing, a11y sections |
| `docs/design-system.md` | odometer, diverging bar, keypad, stamp, confetti presets |
| Reports | `plans/reports/design-analysis-260926-1143-bookings-money-guide-report.md` §2 (3i-1…3i-6), §7 risks 8–11, 17–18, §8 Q9–Q18; master `design-analysis-260926-1143-master-synthesis-report.md` §2 rows F-105…F-109, C24/C31/C38, R3 |
| Phase inputs | P12 money/FX primitives (`packages/cost-engine/src/{money,fx}`, `fx_snapshots`, `usePriceFormatter`); P16 `budget`, `boost-split`; P27 `budget_plans`; P13 gateway + tool registry; P10 command framework, PowerSync, Centrifugo; P11 notification router |
| Renders | `docs/design-renders/screens/3i-1_Balances.png`, `3i-2_Add_an_expense.png`, `3i-3_Scan_a_receipt.png`, `3i-4_Couldn_t_read_it.png`, `3i-5_Settle_up.png`, `3i-6_Budget.png`, `3g-1_Crew_chat.png` (expense message), `3n-8_Language_and_currency.png` |

## Overview
Goal: an offline-first, multi-currency crew ledger in which every expense (manual, receipt, booking, ride, Boost IOU) derives append-only ledger entries in the crew settlement currency, balances animate on every device, receipts are itemised by on-device OCR + Sonnet, debts are netted to the minimum number of transfers and settled outside the app, and the trip budget shows spent vs planned with a forecast.
Done when: the 3i-1…3i-6 screens run against real data on iOS and Android (offline add → sync → realtime on a second device), golden tests reproduce every design number (3i-1 nets, 3i-3 $1.50/$13.34, 3i-4 $11.37, 3i-6 totals), permission suites pass, and the last `confirm_paid` grants the Settled Tokek to every participant with one server timestamp.

## Requirements
### F-105 Expense ledger & balances (3i-1, 3g-1)
| Aspect | Behaviour |
|---|---|
| Ledger | `expenses` → `expense_shares` → `ledger_entries(source_kind=expense)` in the same transaction; edits/deletes write `reversal` entries + new entries (never update/delete ledger rows); `payment` confirmed → entries; `boost_iou` written by P46 through `packages/domain/src/money/ledger-writer.ts` exported here |
| Currency | Expense in any ISO currency; `fx_snapshot_id` captured at entry (offline: latest cached snapshot, labelled with its date, Q-51); converted to crew `settlement_currency` with P12 allocation; changing settlement currency (organiser, Q-50) re-rates via `rerate_crew_ledger` system job with a notice line in Money |
| Balances | `member_balances` computed client-side from synced `ledger_entries`; sum = 0 invariant asserted in engine tests; hero "YOU'RE OWED" / "YOU OWE" (negative variant, pink) / "ALL SQUARE" (3m-6 copy) |
| UI | header "MONEY · {total} SPENT" + settlement-currency chip (tap → sheet explaining crew currency; organiser can change); diverging bar chart, per-side normalisation (bar = \|net\| / max \|net\| on that side); SETTLE IN {n} TAPS (n = settle plan length); SCAN / ADD / BUDGET tiles; LATEST row (original amount + payer + exclusion reason) |
| Motion | odometer roll on hero number (P06 `count` preset, 700 ms ease-out-cubic, digit roll); bars grow from centre line on new expense (grow preset); gecko bob 2600 ms; haptic on odometer settle; reduced motion → cross-fade |
| Multiplayer | any member's expense → `crew_money:` `expense.*` / `balances.updated` hint → PowerSync rows → animate; expense system message in crew chat ("Maya paid Rp 1.08M for lunch · Split 6 ways · $11.37 each · VIEW") via `messages(type=expense)` |
| Undesigned (design in code) | empty ledger, all-square, you-owe, loading, offline with pending ops (outbox badge per row), full expense history (grouped by day, filter by member/category), expense detail (shares, FX line "rate {r} on {date}", receipt thumbnail, edit history from `expense_edits`), edit/delete, multi-trip crews (trip switcher; crew-level ledger total) |
| Authz | participant adds; creator or payer edits/deletes; organiser edits all (Q-52); former members read rows naming them |
| Entitlement | free, unmetered |
| Push | Balances sender (5b-1): N-15/N-16 per P11 mapping; widget snapshot `balances (net only)` field written for P49 |

### F-106 Add expense (3i-2)
- Custom keypad (1–9, 000, 0, ⌫), locale grouping (id-ID "450.000"), currency exponent aware (IDR/JPY 0 dp), max 10 chars, CTA "ADD RP 450K" shortened, disabled at 0 (opacity .4), shake on invalid.
- Live "≈ $28.42 · $4.74 each" line in crew currency, per-share recount while typing; digits roll in (−6 px, opacity .5→1, 180 ms).
- PAID BY avatar radio with shared yellow ring that springs to the tapped avatar; defaults to self.
- SPLIT EVENLY / BY SHARE / CUSTOM. **Undesigned editors**: BY SHARE = per-member steppers (0 = excluded, weights), CUSTOM = per-member amount fields with live "left to assign" and block on mismatch; member exclude chips; currency picker (trip destination currency + home + recent); date/time edit; description with category auto-suggest from the current plan item / POI (deterministic lookup, no LLM); category chips stays/food/transit/fun/other.
- ADD → `add_expense` (offline OK) → back to 3i-1, new LATEST row drops in, toast "Added {amount}, {share} each." Haptic per key. SCAN INSTEAD → 3i-3 (fade replace).

### F-107 Receipt scan, itemised (3i-3, 3i-4) — full itemised split at launch (C31)
| Step | Behaviour |
|---|---|
| Capture | full-bleed camera (`cp-ocr`): live text detection drives the green scan sweep (3200 ms, 3 px `#54d6a4` + 12 px glow), recognised lines highlight yellow as the sweep passes; auto-capture on stable, flat frame; torch toggle; "AUTO-SPLIT ON" chip (off = even split of total) |
| On-device | OCR lines `{id, text, bbox, confidence}` + quality signals (blur, glare, fold/crumple, cut-off) |
| Server | `POST /v1/receipts {trip_id, media_id, ocr_lines[]}` → `ai.receipt` job: Sonnet structured output keyed by OCR line id (lines `{line_id, label, qty, amount_minor, kind item/service/tax/discount/tip}`, merchant, datetime, currency, total); code re-parses numbers from the OCR text of the cited line (locale "850.000" = 850000) and rejects any amount not present in its line; lines sum vs total check |
| Assignment | suggestions only, each with visible reason: presence (plan item attendees / visit), dietary flags only where the member consented `dietary_visibility` ("NOT JORDAN" + "Jordan skipped the pork"); service/tax/tip = pro-rata by item subtotal ("BY SHARE"); payer inference from plan/who scanned, always confirmable ("SPLIT IT · MAYA PAID" tap → payer picker) |
| Review | sheet "TOKEK READ {n} LINES", avatars slide onto rows (stagger), tap line → member picker sheet (undesigned: multi-select + EVERYONE + BY SHARE), per-person result line; `commit_receipt` |
| Failure (3i-4) | quality chip by reason (TOO CRUMPLED / TOO BLURRY / GLARE / CUT OFF); total locked yellow if confident; unreadable lines grey; sheet: TYPE THE LINES (**undesigned itemised manual editor**, prefilled with prices it could read), RETAKE, FLATTER (auto-capture waits), SPLIT EVENLY · {share} EACH; full failure (no total) → go to 3i-2 prefilled with merchant; scan line sweeps twice and stutters at the fold |
| Metering | receipts exempt from the guide quota (unmetered, fair-use cap via P12 `bump_fair_use`) |
| States | camera permission denied (P20 orchestrator primer + Settings link), no receipt detected aim hint, low light, total mismatch banner "Lines add up to X, receipt says Y — keep total", multi-currency receipt → currency picker |
| Privacy | receipt image private media (owner + crew via expense), purged at trip + 1 y (`maint.purge` rule registration) |

### F-108 Settle up (3i-5)
- Min-transfer netting (optimal for crews ≤ 16: zero-sum subset partition DP; ties broken by stable member order) → "Tokek netted {n} expenses down to {m} payments."
- Payment rows from → dashed amount → to, statuses: `pending` (plan, not requested) → `requested` → `marked_paid` → `confirmed`; `disputed`; auto-confirm after 7 d unconfirmed unless disputed (Q-53, `money.autoconfirm` daily job).
- Payee: REQUEST, NUDGE (≤1/pair/24 h → N-16 "Nudged Jordan. Gently."), REMIND EVERYONE (≤1/24 h), CONFIRM / DISPUTE. Payer (**undesigned payment detail**): amount, recipient's revealed payout method via `app.reveal_payout(payment_id)` (audited), PayNow / PromptPay / VietQR / DuitNow EMVCo QR render, bank transfer details with copy, bank-app / Wise deep links, cash; MARK PAID (method) offline OK.
- "HOW PEOPLE PAY YOU" chips (BANK TRANSFER / PAYNOW / CASH + per-country catalogue) → `set_payout_method` (encrypted, C3); copy "Your details are shared only with the person paying."
- Recompute: new expenses after partial settlement recompute the plan from remaining balances; confirmed payments stay; in-flight `requested` rows whose amount no longer matches are re-issued with a notice.
- Motion: cleared row slides left + check stamps (stamp thud + haptic); locked Settled Tokek silhouette "?" + progress line ("Two more payments and all six of you get the Settled Tokek."); on last confirm: server grants `stickers(kind=settled)` to every participant in one transaction with one `granted_at`; `reward.granted{server_ts}` on `crew_money:` + push; each device plays confetti (110 pcs) + toast "All square. Everyone gets the Settled Tokek." immediately if foreground, else on next foreground (C38: not in dex, never sold, not an avatar/icon). `xp_ledger` settle rows are P41's.
- Notification actions `cp.money`: MARK_PAID, CONFIRM, NUDGE (P11 action router → commands here).
- Undesigned: nothing to settle, payer view, disputed, partial payment (amount editable on mark paid; remainder stays open), payment in another currency (converted display).

### F-109 Trip budget & forecast (3i-6)
- Spent vs planned (from `budget_plans` P27 + `set_trip_budget`), by category (stays/food/transit/fun) and by day D1…Dn with dashed plan line; TODAY marker slides to current day; over-plan day bars pink.
- Forecast = actuals + remaining planned items (plan item costs from P16 quotes) + booked-not-yet-expensed bookings via optional `BookedCostProvider` (default empty; P34 T2 registers it and adds the forecast integration test); "biggest cost left" = max remaining item; narrative line is a persona template filled with engine numbers (deterministic; no LLM).
- Motion: bars fill in day order (stagger), spent bar grows, forecast line redraws on each expense.
- Undesigned: no budget set (CTA to organiser: "Set a crew budget"), pre-trip (day 0), over budget (hero pink + copy), tap category/day → filtered history. Never shows private maxes (P27 band only).

## Architecture & contracts
| Area | Delta |
|---|---|
| Migrations | `*_expenses_ledger_payments.sql`: `expenses`, `expense_shares`, `expense_edits`, `ledger_entries` (append-only: REVOKE UPDATE/DELETE from app roles; trigger rejects every role except the `app_system`-only SECURITY DEFINER `app.pseudonymise_user(uid)` that rewrites uid → tombstone uid on `ledger_entries`/`expense_edits`/`expense_shares` for GDPR/PDPL erasure, invoked by P45 account deletion — **doc delta** data-model + P45), `payments`, `member_balances` view; `*_receipts.sql`: `receipts` (+ `status queued/parsed/partial/failed`, `quality_issue` — doc delta); `*_payout_methods.sql` + `app.reveal_payout(payment_id)` SECURITY DEFINER writing `ops.reveal_audit` row (doc delta: audit table name); `*_stickers.sql`: `stickers` (**doc delta**: table moves from phase 40 to 33; P40 extends kinds) |
| RLS backstop | `T` trip participant read; writes only via `app_user` inside command handlers; `payout_methods` owner-only X, no SELECT for others; `receipts` owner + crew via joined expense |
| Publication / streams | add `expenses`, `expense_shares`, `expense_edits`, `ledger_entries`, `payments`, `receipts` (no media key for others), `stickers` to publication allow-list; stream `trip` (expenses, shares, edits, trip ledger), `crews` (crew-level ledger, payments, stickers), `me` (receipts) — own file `infra/powersync/streams/money.yaml` (merged by `build-config.ts`; doc delta note) |
| Commands (§4.9) | `add_expense`, `edit_expense`, `delete_expense`, `commit_receipt`, `request_payment`, `nudge_payment`, `mark_paid`, `confirm_paid`, `remind_all_payments`, `set_trip_budget`, `set_payout_method`; new (doc delta): `dispute_payment {payment_id, note}` (payee), `set_crew_settlement_currency {crew_id, currency}` (organiser); all idempotent on `op_id`, `base_version` conflict → `CONFLICT` with server row |
| HTTP | `POST /v1/receipts`; `GET /v1/payments/{id}/payout` → `app.reveal_payout` (online only, never cached on disk) |
| Realtime | `crew_money:{crew_id}` events `expense.added/edited/deleted`, `balances.updated`, `payment.status`, `reward.granted{server_ts}` via `rt_outbox` |
| Jobs | `ai.receipt` (receipt id singleton), `money.autoconfirm` (daily 04:00 SGT), `money.rerate` (settlement currency change) |
| Push | N-15 expense added (budgeted, roundup), N-16 payment requested/nudged/confirmed (action category `cp.money`), reward grant (ALWAYS once) |
| AI | route `receipt-parse` (Sonnet 5, no tools, structured output, OCR text as `document` block); tool executors `balances_read`, `propose_expense` (P13 registry); evals: promptfoo suite with real receipt images captured by the founder (Indonesian, Japanese, Vietnamese, Thai; crumpled/glare) |
| Native | `cp-ocr` (Swift: Vision `RecognizeTextRequest` run from a react-native-vision-camera frame processor (no `DataScannerViewController` — it owns its own capture session) + `VNDocumentCameraViewController` + barcode PDF417/Aztec/QR; Kotlin: ML Kit text/barcode + Document Scanner; ML Kit v2 has no Thai script → Thai (or zero-line) results fall back to server Sonnet vision transcription returning labelled synthetic line ids `s{index}` with `source=server_ocr`, then the same line-id-keyed parse); API `recognize(imageUri) → {lines[{id,text,bbox,conf}], quality}`, `scanBarcode`, `scanDocument`; reused by P34 (BCBP) and P42 (menus) |

## Tasks
### T1 — Money schema, RLS backstop, publication, permission tests
- Goal: all money tables exist with policies and sync.
- Files: `packages/db/src/schema/{money,stickers}.ts`, `packages/db/migrations/<ts>_expenses_ledger_payments.sql`, `<ts>_receipts.sql`, `<ts>_payout_methods.sql`, `<ts>_stickers.sql`, `packages/db/test/permissions/{expenses,expense-shares,ledger-entries,payments,payout-methods,receipts,stickers}.test.ts`, `infra/powersync/streams/money.yaml`
- Steps: 1. Drizzle schema per data-model §3.8/§3.9. 2. Append-only trigger on `ledger_entries`, `expense_edits`. 3. RLS + grants for `app_user`, `app_system`, `guide_reader` (none), `powersync_repl` (published columns only). 4. `app.reveal_payout` + audit. 5. Publication + stream queries.
- Tests: `pnpm --filter @cp/db test -- permissions/expenses permissions/ledger-entries permissions/payments permissions/payout-methods permissions/receipts permissions/stickers`
- Done when: outsider/ex-member/member/organiser/anonymous matrix passes; UPDATE on `ledger_entries` fails for every role; `app.pseudonymise_user` succeeds only as `app_system` and leaves balances sum-zero; payout details unreadable except via reveal by the open payment's payer.
- Status: done — 7e58e2a9

### T2 — Ledger engine: splits, itemised allocation, FX, ledger derivation
- Goal: pure deterministic money core for every split mode.
- Files: `packages/cost-engine/src/ledger/{split.ts,itemised.ts,derive-entries.ts,balances.ts,index.ts}`, `packages/cost-engine/test/ledger/*.test.ts`, `packages/domain/src/money/{expense-schema.ts,ledger-writer.ts}`
- Steps: 1. `computeShares(amount, currency, mode, shares)` for equal/weights/fixed/items, largest-remainder allocation with stable order (payer absorbs last minor unit). 2. Itemised: items per assignee, service/tax/tip/discount pro-rata by item subtotal. 3. Convert to crew currency via P12 FX snapshot. 4. `deriveEntries(expense)` and `reverseEntries(prev)`. 5. `balances(entries)` with sum-zero assertion.
- Tests: `pnpm --filter @cp/cost-engine test -- ledger` (golden: 3i-1 nets +186.40/+41.00/0/−41.00/−92.10/−94.30; 3i-3 Jordan $1.50, others $13.34 at 15,835 IDR/USD; 3i-4 $11.37; property tests: shares sum = amount for random inputs)
- Done when: all golden and property tests pass; zero float arithmetic (lint rule `no-float-money` passes).
- Status: done — e465158d

### T3 — Expense commands, crew-chat expense message, guide tools
- Goal: add/edit/delete expenses offline-first with realtime fan-out.
- Files: `services/api/src/commands/money/{add-expense.ts,edit-expense.ts,delete-expense.ts,set-trip-budget.ts,set-crew-settlement-currency.ts}`, `services/api/src/money/tools.ts`, `services/worker/src/jobs/money/rerate.ts`, `services/api/test/money/expenses.test.ts`
- Steps: 1. Handlers: authz (participant; creator/payer/organiser edit), validate, write expense + shares + entries + `expense_edits` in one tx, `rt_outbox` events, `messages(type=expense)` row. 2. `base_version` conflict handling. 3. Settlement currency change + `money.rerate` job. 4. Register `balances_read`, `propose_expense` executors (numbers from engine). 5. `/sync/upload` path returns 2xx + `cmd_results` on validation reject.
- Tests: `pnpm --filter @cp/api test -- money/expenses` (Testcontainers Postgres: idempotent replay same op_id; edit by non-payer rejected; delete writes reversal; offline upload reject returns 2xx)
- Done when: tests pass; a second client receives `crew_money:` event within 1 s in the local docker-compose stack.
- Status: done — 025248c8

### T4 — Settlement: netting, payment lifecycle, Settled Tokek grant
- Goal: settle plan + payment state machine + one-timestamp crew reward.
- Files: `packages/cost-engine/src/settle/{min-transfers.ts,plan.ts}`, `packages/cost-engine/test/settle/*.test.ts`, `packages/domain/src/money/payment-state.ts`, `services/api/src/commands/money/{request-payment.ts,nudge-payment.ts,mark-paid.ts,confirm-paid.ts,dispute-payment.ts,remind-all.ts}`, `services/worker/src/jobs/money/autoconfirm.ts`, `services/api/test/money/settle.test.ts`
- Steps: 1. Optimal min-transfer DP (≤16 members) + greedy fallback >16 (never reached: seat cap 16). 2. Payment state machine table-driven. 3. Rate limits (nudge 1/pair/24 h, remind 1/24 h) → `STATE_INVALID{rate_limited}`. 4. `confirm_paid`: when all balances zero for the trip → grant `stickers(kind=settled)` to all participants in the same tx, `reward.granted{server_ts}`, ALWAYS push. 5. Auto-confirm job.
- Tests: `pnpm --filter @cp/cost-engine test -- settle`; `pnpm --filter @cp/api test -- money/settle`
- Done when: 3i-1 nets produce exactly 3 transfers; reward granted once with identical `granted_at` for 6 users under concurrent final confirms (two racing commands → one grant); state-machine table covers every transition.
- Status: done — 32276b34

### T4b — Payout methods: EMVCo QR, encrypted storage, reveal, push actions
- Goal: payee payout details stored encrypted and revealed only to the open payment's payer.
- Files: `packages/domain/src/payout/{catalogue.ts,emvco-qr.ts}`, `packages/domain/test/payout/*.test.ts`, `services/api/src/commands/money/set-payout-method.ts`, `services/api/src/routes/payout-reveal.ts`, `services/api/src/money/push-actions.ts`, `services/api/test/money/payout.test.ts`
- Steps: 1. EMVCo QR payload builder (PayNow SG, PromptPay TH, VietQR VN, DuitNow MY) with CRC16 tests against published spec examples. 2. Encrypted payout storage (P08 envelope helpers). 3. Reveal route over `app.reveal_payout` + audit. 4. `cp.money` action handlers registered with P11 router.
- Tests: `pnpm --filter @cp/domain test -- payout`; `pnpm --filter @cp/api test -- money/payout`
- Done when: CRC16 matches spec examples for all 4 schemes; reveal audited and refused for non-payer; push action marks paid via the same command.
- Status: done — bf679cf3

### T5 — `cp-ocr` native module (iOS + Android)
- Goal: on-device OCR lines with boxes, quality signals, barcode and document scan.
- Files: `apps/mobile/modules/cp-ocr/{expo-module.config.json,index.ts,src/*.ts,ios/*.swift,android/src/main/java/app/critterpass/ocr/*.kt}`, `apps/mobile/modules/cp-ocr/__tests__/*.test.ts`
- Steps: 1. iOS: Vision text recognition (accurate, language hints from trip) exposed as a react-native-vision-camera frame-processor plugin (live boxes for the sweep; no DataScanner), document camera, barcode PDF417/Aztec/QR. 2. Android: ML Kit text recognition v2 (Latin, Japanese, Chinese, Korean, Devanagari scripts bundled; no Thai → return `unsupported_script` so T6 uses server OCR), barcode, Document Scanner. 3. Quality heuristics (Laplacian blur, glare ratio, text-line curvature for folds, bbox clipping). 4. Stable line ids (`l{index}` ordered top-to-bottom).
- Tests: `pnpm --filter @cp/mobile test -- cp-ocr`; `xcodebuild test -scheme CpOcrTests` and `./gradlew :cp-ocr:testDebugUnitTest` on bundled real receipt photos in `apps/mobile/modules/cp-ocr/fixtures/` (photographed by the founder)
- Done when: both platforms return identical-shape results on the fixture set; Thai fixture on Android returns `unsupported_script`; module builds in EAS dev client.

### T6 — Receipt pipeline: upload, Sonnet parse, assignment suggestions, commit
- Goal: server turns OCR lines into validated itemised lines + suggestions.
- Files: `services/api/src/routes/receipts.ts`, `services/worker/src/jobs/money/receipt-parse.ts`, `packages/ai/src/routes/receipt-parse/{prompt.ts,schema.ts,index.ts}`, `packages/ai/evals/receipt-parse/{promptfooconfig.yaml,cases/}`, `services/api/src/commands/money/commit-receipt.ts`, `services/api/test/money/receipts.test.ts`
- Steps: 1. Presign (`purpose=receipt`) + `POST /v1/receipts` → job. 2. Sonnet structured output keyed by line id (server-OCR fallback path: Sonnet vision transcribes lines to `s{index}` first, then the same parse); code-side number re-parse and cross-check; lines-vs-total check; quality classification merge. 3. Suggestions: presence from plan item attendees, consented dietary flags via `guide_reader`-safe `crew_profiles`, pro-rata service; reason strings from templates. 4. `receipts.parsed` update → synced. 5. `commit_receipt` → expense(split_mode=items). 6. Fair-use bump. 7. Purge rule registration.
- Tests: `pnpm --filter @cp/api test -- money/receipts`; `pnpm --filter @cp/ai eval -- receipt-parse` (grader: every amount appears in its cited OCR line; totals reconcile)
- Done when: eval pass rate ≥ 95 % on line amounts for the fixture set (Thai cases via server-OCR path); any hallucinated amount is rejected by code (seeded test).
- Status: done — ccf70b13 (pipeline, recorded DeepSeek fixtures and a 14-case eval merged behind `money.receipts`, off by default; the eval gate on the founder's photographed receipt set is still pending, and the flag stays off until it passes)

### T7 — Money home, history, expense detail (3i-1)
- Goal: Wallet tab with BOOKINGS | MONEY segment and the Balances screen.
- Files: `apps/mobile/src/app/(tabs)/wallet/_layout.tsx`, `apps/mobile/src/app/(tabs)/wallet/money/{index.tsx,history.tsx,expense/[id].tsx}`, `apps/mobile/src/features/money/{balances/,history/,expense-detail/,queries.ts}`, `packages/i18n/locales/en/money/`, `e2e/money/balances.yaml`
- Steps: 1. Segmented layout (C29; bookings segment route slot filled by P34). 2. Balances hero odometer, diverging bars, tiles, LATEST. 3. History + detail + edit/delete entry points; FX line; receipt thumb via signed read. 4. Empty/all-square/you-owe/offline/pending states. 5. Currency chip sheet. 6. a11y: bars as a table for VoiceOver/TalkBack.
- Tests: `pnpm --filter @cp/mobile test -- features/money/balances`; `maestro test e2e/money/balances.yaml`
- Done when: two simulators show the same balances after an offline expense syncs; RNTL snapshot of empty + populated states matches render proportions.

### T8 — Add expense with split editors (3i-2)
- Goal: fast keypad entry with EVENLY / BY SHARE / CUSTOM.
- Files: `apps/mobile/src/app/(tabs)/wallet/money/add.tsx`, `apps/mobile/src/features/money/add-expense/{Keypad.tsx,PayerPicker.tsx,SplitEditor*.tsx,CurrencyPicker.tsx,useExpenseDraft.ts}`, `e2e/money/add-expense.yaml`
- Steps: 1. Keypad with exponent-aware input + odometer digits. 2. Live conversion/per-share line (engine). 3. Payer ring spring. 4. Split editors + mismatch guard. 5. Category auto-suggest from current plan item. 6. Submit via command client (outbox); edit mode reuses screen.
- Tests: `pnpm --filter @cp/mobile test -- features/money/add-expense`; `maestro test e2e/money/add-expense.yaml`
- Done when: Rp 450.000 across 6 shows "≈ $28.42 · $4.74 each" at the 3i-2 rate; CUSTOM with mismatch cannot submit; works in airplane mode.

### T9 — Receipt scan + failure path UI (3i-3, 3i-4)
- Goal: camera → sweep → itemised review → commit, with the three-way failure sheet.
- Files: `apps/mobile/src/app/(tabs)/wallet/money/scan.tsx`, `apps/mobile/src/features/money/receipt/{ScanCamera.tsx,ScanSweep.tsx,LineAssignSheet.tsx,MemberPicker.tsx,FailureSheet.tsx,TypeLinesEditor.tsx}`, `e2e/money/receipt.yaml`
- Steps: 1. Vision camera + `cp-ocr` frame-processor live lines; sweep + highlight animation (Reanimated). 2. Upload + job progress via `cmd_results`/`receipts` sync. 3. Review sheet with avatar stagger, line picker, payer picker. 4. Failure sheet by quality reason; TYPE THE LINES editor prefilled; RETAKE auto-capture; SPLIT EVENLY. 5. Permission-denied + offline ("Saved — Tokek reads it when you're back online", queued upload).
- Tests: `pnpm --filter @cp/mobile test -- features/money/receipt`; `maestro test e2e/money/receipt.yaml` (uses a real receipt photo injected into the simulator camera roll via the library-pick path)
- Done when: fixture receipt produces the 3i-3 assignment; crumpled fixture shows 3i-4 with total locked.

### T10 — Settle up, payment detail, payout methods (3i-5)
- Goal: settle screen for payee and payer, reward ceremony.
- Files: `apps/mobile/src/app/(tabs)/wallet/money/{settle.tsx,payment/[id].tsx,payout-methods.tsx}`, `apps/mobile/src/features/money/settle/{SettleList.tsx,PaymentRow.tsx,PaymentDetail.tsx,PayoutQr.tsx,PayoutMethodsEditor.tsx,SettledTokekReveal.tsx}`, `e2e/money/settle.yaml`
- Steps: 1. Settle list with statuses, NUDGE/REMIND flaps + toasts. 2. Payer detail: reveal (online), QR (Skia), copy, deep links (bank app / Wise), MARK PAID. 3. Payee CONFIRM/DISPUTE. 4. Payout method editor with country catalogue. 5. Stamp + slide-left, silhouette progress, confetti ceremony on `reward.granted` (foreground now, else on next foreground from unseen `stickers` row).
- Tests: `pnpm --filter @cp/mobile test -- features/money/settle`; `maestro test e2e/money/settle.yaml`
- Done when: 3-payment scenario completes across two devices and both show the Settled Tokek; payout details never persisted in SQLite (test asserts).

### T11 — Budget & forecast (3i-6)
- Goal: spent vs planned with day/category bars and a deterministic forecast line.
- Files: `packages/cost-engine/src/forecast/{forecast.ts,biggest-remaining.ts}`, `packages/cost-engine/test/forecast/*.test.ts`, `apps/mobile/src/app/(tabs)/wallet/money/budget.tsx`, `apps/mobile/src/features/money/budget/`, `e2e/money/budget.yaml`
- Steps: 1. Aggregate actuals by category/day (trip tz). 2. Forecast from remaining plan items + `BookedCostProvider` (empty until P34); finish delta; biggest remaining item. 3. Persona template line from content pack. 4. UI with staggered bars, TODAY marker, dashed plan line, over-plan colour, no-budget CTA, pre-trip state. 5. `set_trip_budget` edit sheet (organiser).
- Tests: `pnpm --filter @cp/cost-engine test -- forecast` (golden 3i-6: $4,812 / $7,440, categories, "$210 under"); `maestro test e2e/money/budget.yaml`
- Done when: golden passes; forecast updates within 1 s of a new expense on device.

## Phase acceptance criteria
- [ ] All golden money tests (3i-1, 3i-3, 3i-4, 3i-6) pass; property tests prove shares and balances sum exactly.
- [ ] Permission suites for all 7 new tables pass; `ledger_entries` immutable for every role.
- [ ] Offline add/edit/mark-paid sync correctly and reject paths return 2xx + `cmd_results`.
- [ ] Receipt eval ≥ 95 % line accuracy; no model-produced number reaches the DB unchecked.
- [ ] Settled Tokek granted once per trip with one `granted_at` to all participants (race test).
- [ ] Maestro `e2e/money/*.yaml` green on iOS 26 simulator and Android API 36 emulator.
- [ ] No LLM arithmetic; `balances_read` returns engine numbers only.
- [ ] Payout details only via audited reveal; never in PowerSync, logs, or Sentry breadcrumbs.

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| Rounding drift vs design numbers | golden tests first; allocation rule documented in `packages/cost-engine/src/ledger/README.md` |
| Concurrent edits to one expense | `base_version` conflict + reversal model; history visible |
| Receipt OCR weak on thermal / non-Latin | on-device + Sonnet; failure path always offers total + even split |
| Dietary inference wrong / privacy | suggestion with reason, one-tap override, consent-gated flags only |
| EMVCo QR mistakes send money to wrong account | payload built from payee-entered data only, preview name shown by the bank app; CRC tests |
| Settlement currency change mid-trip | re-rate job idempotent; notice; reversible by changing back |
| Rollback | migrations are expand-only; feature hidden by `money.receipts` flag if the receipt pipeline misbehaves (manual entry keeps working) |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Real receipt photo set (≥ 40, 4 countries) for evals/fixtures — founder captures | T6 eval gate blocks; pipeline code still merges behind `money.receipts` flag |
| Per-country payout catalogue review (PayNow/PromptPay/VietQR/DuitNow wording, bank deep-link schemes) | bank transfer + cash + link methods only |
| Counsel: C24 wording "we never move money" in Terms | copy key exists; legal page (P51) references it |
| Settled Tokek sticker art (content factory P18) | grant still recorded; ceremony uses the base Tokek form until the art lands |

## Open questions
1. Doc delta: `stickers` table created here (P33), not P40 — default: yes, P40 extends `kind`.
2. Doc delta: `receipt_lines` table (api-contracts §5) vs `receipts.parsed` jsonb (data-model) — default: jsonb only.
3. Doc delta: new commands `dispute_payment`, `set_crew_settlement_currency`; `ops.reveal_audit` table name.
4. Doc delta: streams live in per-phase `infra/powersync/streams/money.yaml`, merged into P10's `sync-streams.yaml` at build (P10 delta).
5. Budget forecast narrative: template (default) vs Haiku rewrite — default template.
6. Auto-confirm after 7 d (Q-53) also grants the reward if it clears the last payment — default yes.
