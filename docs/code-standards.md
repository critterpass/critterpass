# Critterpass — Code Standards

Status: binding for every agent session · Updated 2026-09-26
Read with [system-architecture.md](./system-architecture.md). Where they conflict, architecture decides *what*, this file decides *how*.

---

## 1. Agent working rules (read first)

| # | Rule |
|---|---|
| 1 | Before coding: read this file, `system-architecture.md`, the phase file (`plans/260926-1718-critterpass-full-build/phase-XX-*.md`) and the task section you were assigned. Read the design render(s) the task names (`docs/design-renders/screens/<label>.png` + `screens.json`) |
| 2 | **Tasks are checkpoints, not session limits.** One agent pass may run several tasks or whole phases; finish each task’s tests and done-when before starting the next, and commit per task. Stay inside the task's **owns** list (files/dirs). Touching anything else requires the task to name it as a dependency; if not, stop and report `NEEDS_CONTEXT` |
| 3 | Run the narrowest test first (`pnpm --filter <pkg> test -- <file>`), then the package, then `pnpm turbo run lint typecheck test --filter=...[HEAD]` |
| 4 | Implement real behaviour. No mocks/fakes/stub data to pass checks; test doubles only at external network boundaries (§11) |
| 5 | **No plan ids, phase numbers, task ids or feature ids (F-xxx, C12, 3c-8) in code, comments, test names, migration names or commits.** Describe behaviour instead ("rejects ballot after poll closed") |
| 6 | Never use deferral language (`TODO later`, `v2`, `post-MVP`) for designed behaviour. A genuinely blocked item is reported to the controller, not left as a TODO |
| 7 | Undesigned states/flows: build them from existing components + tokens, match the nearest designed screen's tone and layout, reuse the area's copy voice, add them to `docs/undesigned-states.md` (screen, state, rationale) for founder review in the running app |
| 8 | Mark status: tick the task checkbox in the phase file and set `Status:` (`todo` → `in-progress` → `done` / `blocked: <reason>`); update `plan.md` phase status only when all its tasks are done |
| 9 | End every session with `Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`, a 1–2 sentence summary and concerns |
| 10 | Never modify `design/`. Never commit secrets. Never weaken a test to make it pass |

---

## 2. TypeScript & React Native conventions

| Topic | Rule |
|---|---|
| Compiler | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; no `any` (use `unknown` + zod) ; no non-null `!` except in tests |
| Modules | ESM only; named exports; no default exports except expo-router route files and Astro pages |
| Files | ≤300 lines per file; split by responsibility |
| Functions | pure where possible; side effects at edges (data layer, handlers) |
| Errors | never throw strings; use `DomainError(code)` from `packages/domain/errors` |
| Dates | store UTC `timestamptz` + IANA tz; local-day logic via `Temporal` polyfill (`@js-temporal/polyfill`) in `packages/domain/time`; never `new Date()` arithmetic for local days |
| Money | integer minor units + ISO currency (`Money` type from `cost-engine`); never floats |
| IDs | UUIDv7 via `packages/domain/id` |
| React | function components; hooks only; no class components; memoise list rows; FlashList for lists >20 |
| RN | New Architecture only; no deprecated `InteractionManager`; no deep imports from `react-native/*` |
| Lint/format | ESLint flat config + `eslint-plugin-boundaries`; Prettier; `pnpm lint` must be clean |

---

## 3. Naming

| Thing | Convention | Example |
|---|---|---|
| TS/TSX files | kebab-case | `leave-by-card.tsx`, `use-trip-plan.ts` |
| Route files | expo-router conventions, kebab-case segments | `src/app/(trip)/[tripId]/day/[day].tsx` |
| React components | PascalCase symbol | `LeaveByCard` |
| Hooks | `useX` | `useCrewMembers` |
| Commands | snake_case verb_noun | `add_expense`, `apply_change_set` |
| Events | snake_case past tense | `expense_added` |
| Swift / Kotlin files & types | PascalCase | `LeaveByActivityWidget.swift`, `CrewWidgetReceiver.kt` |
| SQL tables/columns | snake_case, plural tables | `crew_members.user_id` |
| Migrations | `<yyyymmddhhmmss>_<what>.sql` | `20261002093000_add_expense_splits.sql` |
| Error codes | SCREAMING_SNAKE | `POLL_CLOSED` |
| i18n ids | `area.screen.element` | `money.settle.cta` |
| Env vars | SCREAMING_SNAKE, prefixed by service | `API_DATABASE_URL` |
| Expo modules | `cp-<capability>` | `cp-live-activity` |

---

## 4. Feature-module structure (mobile)

```
apps/mobile/src/features/<area>/
  index.ts            public API (screens + hooks other areas may use)
  screens/            screen components used by src/app routes
  components/         area-private components
  hooks/              data + behaviour hooks (use-*.ts)
  commands.ts         typed wrappers over command client for this area
  queries.ts          PowerSync live queries for this area
  store.ts            (optional) area UI store slice
  copy.ts             (none — strings live in packages/i18n/<area>)
  __tests__/
```
Route files in `src/app/<area>/` only compose feature screens (≤40 lines, no logic).

---

## 5. State management (decision)

| State kind | Tool | Why |
|---|---|---|
| Synced crew/trip/user data | **PowerSync live queries** (`useQuery` + Drizzle driver) | Local-first single source; offline; reactive; no cache invalidation code |
| Online-only server reads (supplier cards, fare search, place live checks, private C3 fetches) | **TanStack Query 5** over the `hc` client | Retry, dedupe, stale time; memory-only for supplier data |
| Ephemeral cross-screen UI (open sheets, draft forms, swipe deck position, guide composer) | **Zustand 5** (one store per area, selectors) | ~1 KB, no provider, works outside React (motion bus, notifications) |
| Realtime presence/cursors/typing | Centrifugo subscription → Zustand slice | never persisted |
| Per-device prefs | `react-native-mmkv` | sync, fast, survives restarts. Own C3 cache lives in PowerSync local-only `local_private` (SQLCipher), not MMKV |
| Screen-local state | `useState` / `useReducer` | default |

Forbidden: Redux, MobX, React Context for frequently changing values, duplicating synced rows into Zustand.

---

## 6. Styling with tokens (decision)

**Decision:** `StyleSheet.create` + generated tokens (`@cp/design-tokens`) through a tiny `makeStyles((t) => ({...}))` helper with light/dark theme; Reanimated animated styles for motion. **No NativeWind/Tamagui/Unistyles.** Why: the hand-drawn design is bespoke (few utility-class wins), tokens already export to TS/Swift/Kotlin/CSS from one DTCG source, zero styling runtime keeps Hermes/Reanimated hot paths lean, and agents get one obvious pattern.

| Rule | Detail |
|---|---|
| No literals | colours, spacing, radii, font sizes, durations, easings only from tokens; lint rule bans hex/rgb and numeric fontSize in `apps/mobile/src` |
| Guide colours | canonical per C5 via `tokens.guide.<id>` — never re-derive |
| Typography | `<Text variant="...">` from `ui/`; fonts loaded once in app shell |
| Dynamic Type | respect font scale up to 200 % (cap per variant in tokens) |
| Native | Swift/Kotlin read generated `CPTokens` / `CpTokens`; web uses CSS variables |

---

## 7. Motion rules

| Rule | Detail |
|---|---|
| Runtime | Reanimated 4.7 worklets; motion presets from `src/motion` (tokens: durations, springs, easings) — no ad-hoc `withTiming(300)` |
| Feedback bus | every tap/success/error goes through `feedback.emit('success' | ...)` → haptic + sound + animation per tokens; never call `expo-haptics` directly |
| Gestures | Gesture Handler 3 hooks via `src/motion/gestures` kit (drag-snap, swipe deck, long-press) |
| Reduce motion | honour OS setting: skip draw-ons (`frame(model,1)`), replace springs with fades; tested |
| Budget | ≤2 concurrent critter draw-ons; ≤30 animated views/screen on low-tier devices (device tier flag) |
| Thread | animations run on UI thread; no `runOnJS` inside per-frame callbacks |
| Native surfaces | no custom motion in LA/widgets (platform limit) — use static frames |

---

## 8. i18n

| Rule | Detail |
|---|---|
| No hard-coded strings | all user-visible text via Lingui `` t`...` `` / `<Trans>` macros; lint (`lingui/no-unlocalized-strings`) blocks literals in JSX |
| Catalogs | one per area: `packages/i18n/locales/<locale>/<area>.po` (stub from the i18n phase) + phase-owned sub-catalogs `packages/i18n/locales/<locale>/<area>/<sub>.po`, compiled into the area bundle; shared `common` catalog. No other catalog root |
| ICU | plurals/select via ICU; never string concatenation |
| Server text | push, email, SMS rendered from the same catalogs in user locale |
| Native | `.xcstrings` / `strings.xml` generated from catalogs for extensions |
| Formatting | numbers, money, dates via `Intl` wrappers in `packages/domain/format`; guide local words via markup, not translated |
| Launch locale | English complete; framework ready for 16 locales incl. RTL (use `start`/`end`, never `left`/`right`) |
| Translation flow | Tolgee sync in CI; missing keys fail the build for complete locales |

---

## 9. Accessibility

- Every interactive element: `accessibilityRole`, label (localised), state; hit target ≥44 pt.
- Contrast AA from tokens; never convey state by colour alone.
- Screen reader order matches visual order; critters have descriptive labels ("Tokek, forest form").
- Motion respects reduce-motion; audio has captions/transcripts (voice mode).
- Dynamic Type to 200 % without truncating primary actions.
- RNTL a11y queries (`getByRole`) in component tests; Maestro a11y smoke per area.

---

## 10. Commands & error handling

| Layer | Rule |
|---|---|
| Contract | `packages/domain/commands/<name>.ts`: `input` (zod), `result` (zod), `errors` (codes), `events` |
| Handler | `services/api/src/commands/<area>/<name>.ts` exporting `{ contract, policy, handle }`; registered in `registry.ts`; `handle` receives `tx` (from `withUser`), actor, input |
| Client | `data/commands.ts` `run(name, input)` → generates `op_id`, writes to PowerSync upload queue when the command is sync-eligible, else `hc` POST; returns typed result |
| Idempotency | handlers must be deterministic for the same `op_id`; external calls keyed by `op_id` (e.g. supplier partner ref) |
| Error envelope | `{error: {code, message, retryable, detail?}}` (api-contracts §1, codes §3); UI maps `code` to an i18n message; never shows raw `message` |
| Transient vs permanent | 5xx/network → retry with backoff (client queue); `DomainError` → surfaced to user with a fix action |
| Workers | jobs call `dispatchSystem(name, input)`; never raw SQL writes bypassing handlers for domain state |
| External calls | timeouts always set (default 10 s, supplier booking ≤120 s); circuit-breaker per supplier |

---

## 11. Logging & PII

| Rule | Detail |
|---|---|
| Logger | `pino` (server) / `lib/log` (app) → OTel; structured JSON; `req_id`, `op_id`, `uid` (hashed) |
| Never log | tokens, OTP codes, phone, email, postal address, payout details, location coordinates, message bodies, budget max, dietary, LLM prompts with user text (Langfuse gets redacted copies) |
| Sentry | `beforeSend` scrubber shared in `packages/domain/redact`; no request bodies |
| Analytics | events only from the typed catalog; no free-text properties; no C3 |

---

## 12. Routing (app)

- File routes per area under `src/app/<area>/`; groups `(tabs)`, `(modal)`, `(trip)` for layouts.
- Typed routes on; navigate via `router.push(href)` with typed params; no string building.
- Deep links resolved by `src/data/links.ts` from the link payload (`/i/{code}`, `/p/{id}`, `/r/{id}`, join code) → route; unknown → safe home.
- Auth/onboarding gates live in layout files, not screens.

---

## 13. Database (Drizzle + migrations)

| Rule | Detail |
|---|---|
| Schema | `packages/db/src/schema/<area>.ts`; Drizzle core API only (no Relational Queries v1) |
| Migrations | `drizzle-kit generate` → review → commit `packages/db/migrations/<timestamp>_<what>.sql`; hand-written SQL for roles, grants, RLS helpers, publication, triggers, indexes |
| Forward-only | never edit an applied migration; expand → migrate data → contract across separate migrations |
| Publication | a table enters/leaves `powersync` publication only in a migration **plus** the matching sync-stream change in `infra/powersync/streams`; never drop a published column before the stream stops using it |
| Migration order | plan files write `<ts>_` as a placeholder; the real timestamp is generated at merge/rebase time (`drizzle-kit generate` or `date -u +%Y%m%d%H%M%S` after rebasing on `main`), so it sorts after every merged migration. CI fails when a new migration sorts before the latest one on `main` |
| Publication edits | idempotent and order-independent: add tables via a guarded `DO` block (`IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename=…) THEN ALTER PUBLICATION powersync ADD TABLE …`), never `SET TABLE`/recreate; the publication itself is created once by the core-schema migration and every later migration assumes it exists |
| Sync streams | each area owns `infra/powersync/streams/<area>.yaml`; `infra/powersync/sync-streams.yaml` is a build output of `build-config.ts` — never edited by hand |
| Every new user-data table | `ENABLE` + `FORCE ROW LEVEL SECURITY`; policies for `app_user`; explicit grants per role; privacy class declared in `packages/domain/privacy.ts`; **Testcontainers permission test** in `packages/db/test/permissions/<table>.test.ts` covering outsider/ex-member/member/organiser |
| C3 tables | owner-only policy; excluded from publication; no `guide_reader` grant; test asserts all three |
| Transactions | always through `withUser(uid, fn)` or `withSystem(fn)`; never a bare pool query in handlers |
| Queries | parameterised only; no string SQL interpolation; indexes for every FK and policy predicate |
| Seeds | `packages/db/seed` realistic fixtures (content-factory data, not lorem) |

---

## 14. Native code

| Rule | Detail |
|---|---|
| Location | Expo modules in `apps/mobile/modules/cp-*` (Swift + Kotlin, Expo Modules API); extensions in `apps/mobile/targets/<name>` |
| Swift | Swift 6 strict concurrency; SwiftUI; no force unwraps; shared models in `targets/_shared` decoded from App Group JSON (schema version checked) |
| Kotlin | Kotlin 2.x, coroutines, Glance for widgets; `minSdk` per app config; gate APIs with `Build.VERSION.SDK_INT` (Live Updates 36+, MetricStyle 37+) |
| No JS in extensions | extensions read snapshots/PNGs and call `POST /v1/actions` only |
| Secrets | device action key in Keychain group / Android Keystore; never in App Group files |
| Contracts | snapshot schemas defined in `packages/domain/surfaces` (zod) → generated Swift/Kotlin Codable/serialisation |
| Tests | XCTest for Swift shared logic; JUnit/Robolectric for Kotlin; snapshot tests for widget views |
| Config | all native project changes via config plugins / apple-targets config — never hand-edit generated `ios/`/`android/` |

---

## 15. AI rules

| Rule | Detail |
|---|---|
| Location | prompts, personas loader, tool schemas, routing in `packages/ai`; prompts only under `packages/ai/src/prompts/<route>/` (global rules `src/prompts/global-rules.md`); no prompt strings elsewhere |
| Models | Haiku 4.5 default; Sonnet 5 workhorse; Opus 5.5 only for itinerary skeleton — routing table in `packages/ai/src/routing.ts` |
| Writes | the model never writes; tools return proposals validated by `planner`/`cost-engine`; numbers/times/prices computed by code, model only words them |
| Context | built from `guide_reader` views only; **no C3 fields, no supplier content**; contract test asserts context builder output |
| Injection | user/crew text wrapped as data; tool allow-list per surface; spend/booking actions require explicit user confirmation |
| Evals | every prompt/tool/routing change updates or runs its promptfoo suite (`pnpm --filter @cp/ai eval <suite>`); CI blocks on regression |
| Traces | Langfuse with redaction; cost tags per crew-trip |
| Disclosure | AI-generated content marked per EU AI Act Art. 50 in UI |
| Metering | every model call passes through the quota check in `entitlements` |

---

## 16. Supplier rules

- Adapters live only in `packages/suppliers/<supplier>/` behind a common interface (`search`, `availability`, `hold`, `book`, `cancel`, `status`, `deepLink`) — implement only what the supplier supports.
- Flagged adapters (Agoda Demand, Klook API, Trip.com distributor) read `supplier_flags`; copy variants keyed by flag.
- Supplier content rendered verbatim in supplier cards; not persisted (except booking confirmations the user owns); never passed to LLM or `guide_reader`.
- Copy claims only returned facts (hold only if `HOLDING`; cancellation deadline from supplier data).
- Every outbound call: timeout, retry policy, idempotency key, fixed egress IP, recorded in `supplier_calls` (no PII bodies).
- Affiliate links carry sub-ids, go through `/r/{id}`, and show disclosure; ranking never uses commission.
- Contract tests against recorded sandbox responses (Viator sandbox, Travelpayouts); live smoke in staging.

---

## 17. Testing

**Pyramid:** pure unit (Vitest) ▸ DB/permission integration (Vitest + Testcontainers) ▸ API integration (Hono `app.request`) ▸ component (Jest + RNTL) ▸ E2E (Maestro, Playwright for web) ▸ evals (promptfoo) ▸ golden images (critter-art).

| Change type | Required tests |
|---|---|
| Pure package logic (cost-engine, planner, entitlements, domain) | Vitest unit incl. edge cases; property tests for money/splits/scheduling |
| New/changed command | contract test (zod), handler integration test via Testcontainers (happy, policy deny, idempotent replay, validation reject via sync door) |
| New table / column / policy | permission contract test per actor + C3 publication/guide_reader assertions |
| Sync stream change | stream test: member sees, outsider doesn't |
| Centrifugo channel | proxy decision test per actor + unsubscribe on removal |
| Screen / component | RNTL render + interaction + a11y roles; states: loading, empty, error, offline |
| User flow | Maestro flow in `e2e/<area>/` (happy path + offline where relevant) |
| Motion/visual | reduce-motion test; Maestro `assertScreenshot` in motion-freeze mode for key screens |
| Critter art | golden diff vs Chromium references |
| Prompt/tool | promptfoo suite pass |
| Supplier adapter | recorded-response contract test + error/timeout mapping |
| Native module/extension | XCTest/JUnit for logic; build in CI; Maestro where reachable |
| Web route | Playwright (incl. AASA/assetlinks, OG render) |
| Bug fix | failing regression test first |

Test doubles: only at network boundaries (Claude, suppliers, APNs/FCM, RevenueCat) using recorded fixtures; never mock the database.

**macOS-only suites:** a suite that needs a real Chromium (Playwright), compares Node canvas output against goldens rendered on macOS arm64, or inspects `expo prebuild` output is listed in its package's Vitest/Jest config and excluded unless `CP_MACOS_SUITES=1`. The Linux `checks` job never sets it; the macOS `critter-art-macos` job in `.github/workflows/ci.yml` sets it, installs Chromium, runs `expo prebuild --clean --no-install` before the config plugin test, and runs each listed suite by path. Run them locally with the same flag, e.g. `CP_MACOS_SUITES=1 pnpm --filter @cp/critter-art exec vitest run src/share/templates/templates.test.ts`. A new suite of this kind goes in that list and in that job; never skip it silently.

**Cloud E2E ladder (mobile):** run JS/unit/DB tests locally as above; run Maestro flows with `pnpm e2e:cloud -- --platform ios|android [--flows e2e/<dir>]`, which starts an EAS Workflow (`.eas/workflows/e2e-ios.yml` / `e2e-android.yml`) that builds an iOS simulator / Android APK on the `e2e-test` profile and runs the flows on an EAS-hosted simulator/emulator, never on this machine. The workflow reuses the last build matching the project's fingerprint (`fingerprint` → `get-build` jobs) and only triggers a new EAS build when nothing matches — don't add build-triggering changes (native deps, config plugins) for JS-only work, and don't run `eas build`/`eas workflow:run` speculatively; the account has a monthly build quota. A reused build's embedded JS is frozen at build time (the fingerprint ignores JS-only changes), so the workflow republishes the current JS as an EAS Update to the `e2e-test` channel first (`publish_update` job) whenever it reuses a build; `app.config.ts` sets `updates.checkAutomatically: 'ON_LOAD'` (with a generous `fallbackToCacheTimeout`) for the `e2e-test`/development `APP_VARIANT`, so the app blocks its first render on that update before Maestro runs. A flow reaches a `(dev)` screen by launching the app, tapping the home screen's "Developer tools" entry, then the target screen in `apps/mobile/src/app/(dev)/index.tsx`'s list — never `openLink`, which is non-deterministic into a `(dev)` route on an EAS-hosted simulator (mobile-dev-inc/Maestro#2610). Local native builds (`expo run:ios`/`run:android`, simulators/emulators on this Mac) are for native-code debugging only, one build at a time, Android `arm64-v8a` only.

---

## 18. Security rules

- Every endpoint authenticated except `/health`, JWKS, webhooks (signature-verified) and public link routes.
- zod-validate every input; Hono body limits; rate limits (IP /64, phone, device) in Redis.
- App Attest / Play Integrity on anonymous sign-in and OTP start; OTP country allow-list; SMS spend alarm.
- Better Auth: minimal plugins, `disableImplicitLinking`, `trustedOrigins` set, patch advisories within 48 h.
- R2 private; presign PUT ≤15 min, GET ≤1 h; media reads HMAC-signed.
- Field-encrypt payout, address, phone; hash for lookup.
- No secrets in code, logs, App Group files or client bundles; `.env.example` only.
- Dependencies: Renovate, OSV/`pnpm audit` in CI, pinned container digests.
- IAP for all digital unlocks; IOUs never gate perks; no own code redemption mechanisms beyond store offer codes and IAP gift codes.

---

## 19. Git rules

- Branch per task: `feat/<area>-<behaviour>`; PR per task; squash merge.
- Conventional commits (`feat(money): split expense by shares`); no AI references; no plan/task/feature ids.
- CI green (lint, typecheck, tests for affected packages, permission suite, evals if AI touched) before merge.
- Never commit `.env*` (except `.env.example`), keys, dumps, personal data.

---

## 20. Definition of Done

**Per task**

- [ ] Only files in the task's **owns** list (plus named deps) changed
- [ ] Behaviour matches design render + task done-when checks, incl. loading/empty/error/offline states
- [ ] Required tests for the change type (§17) written and passing; narrowest → affected packages
- [ ] Lint, typecheck clean; no hard-coded strings/colours; a11y roles set
- [ ] Permission/RLS tests if data touched; evals if AI touched
- [ ] No ids/deferral language in code; conventional commit
- [ ] Task checkbox + status updated in phase file; undesigned states logged

**Per phase**

- [ ] All tasks `done`; phase acceptance criteria verified
- [ ] Maestro flows for the phase's user journeys pass on iOS and Android
- [ ] Performance budgets relevant to the phase measured (architecture §9)
- [ ] Docs updated if architecture, contracts or commands changed
- [ ] `plan.md` phase status set to `done`

---

## Unresolved questions

1. `Temporal` polyfill vs `date-fns-tz` — polyfill chosen; confirm bundle cost acceptable in spike S8.
2. TypeScript 7 native compiler compatibility with Metro/Babel toolchain on SDK 58 — fall back per-package to the Expo-supported TS if needed.
3. FlashList 2 vs Legend List for the Critterdex grid — decided by spike S2.
