---
phase: 3
title: Design tokens, fonts, i18n framework
status: pending
depends_on: [1]
wave: 2
features: [F-001, F-002, F-026]
screens: [3n-8, all (token/font/string consumers)]
tasks: 8
owns: [packages/design-tokens/, packages/i18n/, apps/mobile/assets/fonts/, apps/mobile/src/lib/i18n/, apps/mobile/src/lib/fonts/, apps/web/src/styles/tokens.css, apps/web/public/fonts/, tools/scripts/fonts/, tools/scripts/i18n/, .github/workflows/i18n-sync.yml]
---
# Phase 3 — Design tokens, fonts, i18n framework

## Context links

| Source | Section |
|---|---|
| `docs/design-system.md` | §1 tokens (colour, C5 guide colours, tier, member, type, spacing, radii, rings, textures), §3.2 motion tokens, §4 cue ids, §5 contrast, §6 localisation typography |
| `docs/code-standards.md` | §6 styling with tokens, §8 i18n, §9 a11y |
| `docs/system-architecture.md` | §repo layout + import rules (`design-tokens` and `i18n` are leaves), versions table (`@lingui/core` 6.8) |
| `docs/product-decisions.md` | C5 (guide colours), C7 (stamp ink), Q-03 (shipped languages), D17 (Lingui + Tolgee) |
| `docs/data-model.md` | `user_settings.app_locale`, `price_display`, `time_format`, `distance_unit` (written by the You phase) |
| Reports | `plans/reports/design-analysis-260926-1143-design-system-prototype-report.md` (tokens, type), master §2 rows F-001/F-002/F-026, §0.2 C5, risk R18 |
| Renders | `docs/design-renders/screens/3n-8_Language_and_currency.png`, `3b-1_*.png` (all six guide colours), `docs/design-renders/screens.json` (3n-8 caption) |

## Overview

Goal: one DTCG token source that feeds TS (mobile, web, admin), Swift (extensions), Kotlin (Android surfaces) and CSS; bundled, subset fonts with per-script fallbacks; a Lingui i18n framework with per-area catalogs, in-place runtime language switch and native string generation for 16 locales (English authored).
Done when: `pnpm turbo build --filter @cp/design-tokens --filter @cp/i18n` emits all targets with snapshot tests green, the Expo dev build renders every font instance (incl. Vietnamese diacritics and Thai) and switches language in place without restart, and `.xcstrings` / `strings.xml` are generated from the `surfaces` catalog.

## Requirements

### F-001 Design tokens package
| Aspect | Requirement |
|---|---|
| Source | DTCG JSON in `packages/design-tokens/src/*.tokens.json`: `color` (primitives §1.1 incl. increase-contrast variants), `semantic` (§1.2), `guide` (C5: tokek yellow, pon orange, lundi blue, ajo pink, sardi green, paco cream + `*.onPaper` ≥ 4.5:1), `place` (= guide colour; non-guide cycling order), `stamp` (destination ink; home = orange per C7), `tier` (colour + glyph ● ◆ ★ ✦ + edge width), `member` (6 colours × ring pattern solid/dashed/double for members 7–16), `space`, `size` (§1.4 constants), `radius`, `ring`, `shadow`, `texture` (parameters for halftone, guilloche, hatch, engraving, barcode, rays, holo, sheen), `type` (§1.3 variants incl. Dynamic Type cap per variant), `motion` (durations, staggers, easings, springs, transition specs §3.3, gesture thresholds), `sound` (cue ids → haptic iOS/Android + SFX asset + category, §4) |
| Outputs | TS typed module (`tokens.color.ink[850]`, `tokens.guide.pon`), CSS custom properties, Swift `CPTokens` (Color, CGFloat, Font helpers), Kotlin `CpTokens` (Compose/Glance `Color`, `Dp`, `TextUnit`) |
| Theming | Dark is the designed theme; light variant = paper surfaces only (no full light theme designed). Increase-contrast variant selected at runtime |
| Guards | Lint rule `critterpass/no-literal-style` (bans hex/rgb/numeric fontSize/duration literals in `apps/mobile/src`, `apps/web/src`); contrast test: every declared text/background pair ≥ 4.5:1 (large ≥ 3:1), `border.control` ≥ 3:1 |

### F-002 Fonts + script fallbacks
| Aspect | Requirement |
|---|---|
| Families | Archivo static instances at widths 62/66/70/78/100 × weights 700/800/900 (RN has no reliable variable-axis support; design values snap per §1.3); Geist 400/500/600/700/800; Geist Mono 400/500/700; Caveat 600/700; Instrument Serif (web only); Noto Sans Thai (bundled, Black + Regular); CJK = system fallback (PingFang/Hiragino/Apple SD Gothic on iOS, Noto CJK on Android) with a 0.85× size table |
| Subsetting | Per-family unicode ranges: Archivo/Geist/Geist Mono/Caveat/Instrument Serif = Latin, Latin Ext-A, Vietnamese, punctuation, currency symbols (S$, US$, ¥, Rp, ₫, ฿, €, £, ₩), ICAO MRZ set; Noto Sans Thai = Thai block U+0E00–0E7F + Latin digits/punctuation + ฿; tabular-figure feature kept |
| Runtime | Resolver maps (variant, locale script) → family + size factor + line-height (Latin display .86; vi/th ≥ 1.0; CJK ≥ 1.15; body 1.4); condensed uppercase only for Latin + Vietnamese; CJK/Thai use heavy non-condensed display; Caveat → Geist 500 italic when glyphs missing or "plain text for guide" is on; fonts prewarmed before first hero paint |
| Extensions | Same files registered in widget / notification-content targets (`UIAppFonts`) via `CPFont.swift`; Android `res/font` family XML; web `@font-face` woff2 with `font-display: swap` |
| Budget | Total bundled font payload ≤ 3 MB (iOS download budget 40 MB) |

### F-026 Localisation framework
| Aspect | Requirement |
|---|---|
| Catalogs | Lingui 6.8, ICU MessageFormat; one catalog per area (`onboarding, crew, home, vote, explore, setup, plan, proposal, guide, bookings, money, trip, safety, critters, recap, album, you, community, help, monetize`) + `common` + `surfaces` (extension/push strings) + `server` (email/SMS/push bodies) + `web` |
| Locales | Registry of 16 locales with `shipped` flag. Shipped per Q-03 default (docs/product-decisions §7): en (source, en-US base, UK-neutral), zh-Hans, id, ja, es, pt, fr, ko, th, vi — all 10 are a launch gate (complete + reviewed), not optional. 3n-8 designs 16 (4 shown + "12 more"); the other 6 are registered `shipped: false` as an explicit founder exception pending confirmation (Open question 1) — confirming 16 flips the flags and adds them to the launch gate, no code change. Language list (3n-8) shows shipped locales only and "N more" counts them. Pseudo-locale `en-XA` (+40 % expansion, accents) in dev builds |
| Runtime switch (3n-8) | Switching language redraws the current screen in place (no restart, no navigation reset); guide sample line in the new language is played by the You phase via this API (`onLocaleChanged`); guides keep their local words regardless (markup `<local lang="id">…</local>` never translated) |
| Rules | Strings stored sentence case; uppercase at render via locale-aware transform (Turkish İ, German ß→SS, Greek accent strip; no-op for CJK/Thai/Korean); no concatenation; `start`/`end` layout only (RTL-ready, no RTL UI shipped; RTL phrase text renders correctly inside LTR) |
| Formatting | `Intl` wrappers: number, compact number, percent, date, time (12/24 h setting), date interval, relative time, list, countdown units ("17D" localised), distance (km/mi). Currency formatting builds on these in the money primitives phase |
| Native | `.xcstrings` (plural variations) for iOS targets and `values-<locale>/strings.xml` (`<plurals>`) for Android surfaces generated from `surfaces`; iOS `CFBundleLocalizations` + Android `locales_config.xml` (per-app language) generated from the shipped list; active locale mirrored to the App Group / shared prefs by the native-bridge phases via `getActiveLocale()` |
| Server | `packages/i18n/server` loads compiled catalogs in Node for push/email/SMS in the recipient's locale |
| LLM | Exports `localeMeta(locale)` (BCP-47, English name, native name, script, direction) for the AI gateway's output-language directive |
| Pipeline | Tolgee: CI pushes new source keys, pulls translations; machine translation + founder/translator review in Tolgee; glossary locks critter names, guide names, local words, product terms (Pass+, Trip Boost, Critterdex). Completeness gate: on PRs, missing translations only warn (runtime en fallback covers dev builds); on release branches/tags (`release/*`, `v*`, `staging-*`) the build fails on any missing key or broken ICU for a shipped locale |

Undesigned states to build: language row "downloading/applying" (none needed: catalogs are bundled, switch is synchronous); fallback when a key is missing in a shipped locale at runtime → English + Sentry breadcrumb (never a raw key).

## Architecture & contracts

| Item | Delta |
|---|---|
| DB / sync / commands / channels / jobs | None. Locale persistence uses `user_settings.app_locale` (data-model, written by `settings.update` in the You phase); this phase stores the device-side choice in MMKV key `cp.locale` and exposes `setLocale(locale, { persist })` |
| Package exports | `@cp/design-tokens`: `tokens`, `Tokens` type, `resolveTypeVariant`, `contrastPairs`; `/css`, `/swift`, `/kotlin` build outputs. `@cp/i18n`: `locales`, `localeMeta`, `upper`, `parseLocalMarkup`, `format.*`, `loadCatalog(locale, area)`, `/server`, `/native` generators |
| Mobile | `apps/mobile/src/lib/i18n/` (`I18nRoot`, `useLocale`, `setLocale`, `onLocaleChanged`), `apps/mobile/src/lib/fonts/` (`useFontsReady`, `fontFor(variant, locale)`) |
| Doc delta | code-standards §8 places `Intl` wrappers in `packages/domain/format`; this phase puts locale-generic wrappers in `packages/i18n/src/format` (leaf, usable by web/admin/server) and money formatting stays in the money primitives phase. Kotlin tokens output path `packages/design-tokens/dist/kotlin` consumed by the Android surfaces module's Gradle `sourceSets`; Swift outputs `packages/design-tokens/dist/swift/{CPTokens,CPFont}.swift` are added to the extension `_shared` sources by the targets config (phase 2 scaffold, extended by the surface phases) — this phase never writes under `apps/mobile/targets/` |

## Tasks

### T1 — DTCG token source + validation
- Goal: complete token source for every §1, §3.2–3.3 and §4 value, with schema and contrast validation.
- Files: `packages/design-tokens/package.json`, `src/{color,semantic,guide,tier,member,space,size,radius,ring,shadow,texture,type,motion,sound}.tokens.json`, `src/validate.ts`, `test/contrast.test.ts`, `test/schema.test.ts`.
- Steps: 1. Transcribe values from `docs/design-system.md` §1, §3.2, §3.3, §4 (no invented values; ambiguous ones read from the design source `design/Critterpass.dc.html`). 2. Guide colours exactly per C5; `*.onPaper` darkened variants computed and checked ≥ 4.5:1 on `paper`. 3. zod schema for DTCG `$type`/`$value` and alias resolution. 4. Contrast test over declared pairs (text roles × surfaces, tier glyphs, member colours on ink.850 and paper).
- Tests: `pnpm --filter @cp/design-tokens test`.
- Done when: all aliases resolve; contrast test passes; no token lacks `$type`.
- Status: done — e0cc18b

### T2 — Token generators (TS, CSS, Swift, Kotlin) + literal lint rule
- Goal: generated outputs from one source, built by Turborepo.
- Files: `packages/design-tokens/build/{ts,css,swift,kotlin}.ts`, `build/index.ts`, `dist/**` (gitignored; Swift emitted to `dist/swift/CPTokens.swift`), `apps/web/src/styles/tokens.css`, `packages/design-tokens/eslint/no-literal-style.js`, `test/generators.test.ts`, `test/__snapshots__/`.
- Steps: 1. Style Dictionary 5 (DTCG native) or a small custom emitter if SD cannot express springs/cue maps — pick one, keep one. 2. TS: `as const` object + types; easings as bezier tuples, springs as `{stiffness, damping, mass}`. 3. Swift `CPTokens` enums + `Color(hex:)`; Kotlin `object CpTokens`. 4. CSS vars on `:root`. 5. ESLint rule + fixture tests; register in the shared ESLint config from phase 1.
- Tests: `pnpm --filter @cp/design-tokens test && pnpm turbo build --filter @cp/design-tokens`; `swiftc -parse packages/design-tokens/dist/swift/*.swift`; `kotlinc` compile check in CI script.
- Done when: snapshots stable; Swift parses; Kotlin compiles; lint rule flags `'#fff'` and `fontSize: 12` in fixtures.
- Status: done — `build/` -> `codegen/` and `dist/` -> `generated/` renamed (tooling forces this in this environment; see report) — 5f0a1c2

### T3 — Font acquisition, instancing, subsetting
- Goal: reproducible font build producing all instances with licences.
- Files: `tools/scripts/fonts/build-fonts.py`, `tools/scripts/fonts/requirements.txt`, `tools/scripts/fonts/sources.json` (upstream URLs + sha256), `apps/mobile/assets/fonts/*.ttf`, `apps/web/public/fonts/*.woff2`, `packages/design-tokens/fonts/OFL-*.txt`, `packages/design-tokens/fonts/manifest.json`.
- Steps: 1. Download OFL sources (Archivo VF, Geist, Geist Mono, Caveat, Instrument Serif, Noto Sans Thai) pinned by hash. 2. `fontTools.varLib.instancer` → Archivo `wdth` 62/66/70/78/100 × `wght` 700/800/900, named `Archivo-W{w}-{weight}`. 3. `pyftsubset` with the per-family unicode ranges in Requirements (`sources.json` carries each family's range set), keep `tnum`, `case`. 4. Glyph-coverage check: every Vietnamese precomposed letter and currency symbol present in Archivo/Geist/Caveat (report which fall back); every assigned Thai-block code point present in Noto Sans Thai. 5. Manifest lists family → file → weights/widths → coverage.
- Tests: `python3 tools/scripts/fonts/build-fonts.py --check` (idempotent rebuild yields identical hashes; coverage assertions).
- Done when: total mobile font payload ≤ 3 MB; Vietnamese + Thai coverage checks pass; licences committed.

### T4 — Font runtime, per-script resolver, native + web registration
- Goal: apps and extensions render the right face, size factor and line height per locale script.
- Files: `apps/mobile/src/lib/fonts/{index,load,resolve}.ts`, `apps/mobile/src/lib/fonts/resolve.test.ts`, `apps/mobile/app.config.ts` (expo-font plugin entry only), `packages/design-tokens/swift/CPFont.swift` (source, copied to `dist/swift/`), `packages/design-tokens/build/android-fonts.ts` (emits `res/font/*.xml` into `dist/android`), `apps/web/src/styles/fonts.css`.
- Steps: 1. `expo-font` config plugin embeds fonts at build time (no async load flash). 2. `fontFor(variant, locale)` returns family, size multiplier, lineHeight, `condensedUpper` flag per §6. 3. Prewarm: render hidden glyph run of each display instance before splash hides. 4. `CPFont.register()` + `Font.cp(.h1)` helpers for SwiftUI targets. 5. Web `@font-face` + `unicode-range`.
- Tests: `pnpm --filter @cp/mobile jest src/lib/fonts`; EAS dev build smoke (phase 1 workflow) showing a font specimen (renders verified in phase 7 gallery).
- Done when: resolver tests cover Latin, vi, th, ja, zh-Hans, ko; `CPFont.swift` parses; web CSS builds.

### T5 — Lingui setup, per-area catalogs, locale registry, lint
- Goal: extraction/compilation pipeline and the 16-locale registry.
- Files: `packages/i18n/package.json`, `packages/i18n/lingui.config.ts`, `packages/i18n/src/locales.ts`, `packages/i18n/locales/en/{common,surfaces,server,web,<20 areas>}.po`, `packages/i18n/scripts/{extract,compile}.ts`, `apps/mobile/babel.config.js` / `metro.config.js` (Lingui macro + transformer lines only), `packages/i18n/test/locales.test.ts`.
- Steps: 1. Lingui config with one catalog per area; include globs `apps/mobile/src/{app,features}/<area>/**`, `apps/mobile/src/{ui,motion,lib}/**` → `common`, `apps/web/**` → `web`, `services/**` → `server`. 2. Registry: 16 entries with BCP-47, script, direction, nativeName, `shipped`. 3. Pseudo-locale `en-XA` generator. 4. Enable `eslint-plugin-lingui` `no-unlocalized-strings` for mobile/web. 5. Empty source catalogs for all areas so area phases only add messages. 6. Compile each area bundle from `locales/<locale>/<area>.po` plus any sub-catalogs `locales/<locale>/<area>/*.po` (area phases own their sub-catalog files, so parallel phases never share a `.po`).
- Tests: `pnpm --filter @cp/i18n test && pnpm --filter @cp/i18n extract && pnpm --filter @cp/i18n compile`.
- Done when: extract/compile run clean; registry test asserts the shipped set equals the Q-03 list (10 unless the founder confirms 16) + en-XA dev-only; lint fails on a JSX literal fixture.

### T6 — Mobile i18n runtime: in-place switch, formatting, casing, local-word markup
- Goal: `I18nRoot` with synchronous in-place language switch and all locale-generic helpers.
- Files: `apps/mobile/src/lib/i18n/{I18nRoot.tsx,use-locale.ts,set-locale.ts,device-locale.ts}`, `packages/i18n/src/{upper.ts,local-markup.ts,format/*.ts,meta.ts}`, `packages/i18n/src/server/index.ts`, tests beside each.
- Steps: 1. Load compiled catalogs for the active locale (all areas, bundled; lazy `import()` per locale). 2. `setLocale` activates, persists MMKV `cp.locale`, emits `onLocaleChanged`; React tree re-renders without remounting navigation. 3. Initial locale: stored → device preferred (expo-localization) → en. 4. `upper()`, `parseLocalMarkup()` returning `{text, lang}` spans (for TTS/translator lock), `format.*` wrappers with 12/24 h and km/mi options, countdown unit labels. 5. Missing-key fallback to en + Sentry breadcrumb hook. 6. Node server loader mirrors the same API.
- Tests: `pnpm --filter @cp/i18n test`; `pnpm --filter @cp/mobile jest src/lib/i18n` (RNTL: switch locale → same screen instance shows new text, navigation state unchanged).
- Done when: tests cover Turkish/German/Greek casing, CJK no-op, markup round-trip, interval + relative formats in 3 locales, in-place switch.

### T7 — Native string generators (.xcstrings, strings.xml, per-app language config)
- Goal: extensions and OS per-app language settings driven from catalogs.
- Files: `packages/i18n/src/native/{xcstrings.ts,strings-xml.ts,locales-config.ts}`, `packages/i18n/test/native.test.ts`, `packages/i18n/dist/native/**` (build output consumed by target/module phases).
- Steps: 1. Convert `surfaces` ICU messages → `.xcstrings` JSON (plural `variations`, `%@` / `%lld` placeholders with positional order). 2. → `values-<locale>/strings.xml` with `<plurals>` and escaped apostrophes. 3. Emit `CFBundleLocalizations` list + Android `res/xml/locales_config.xml` from shipped locales. 4. Reject ICU constructs that native formats cannot express (select inside plural) with a clear error.
- Tests: `pnpm --filter @cp/i18n test` (golden files for en + vi + ja); `xcrun xcstringstool` validation where available on macOS CI.
- Done when: goldens match; invalid ICU fails the build with the message id.

### T8 — Tolgee translation pipeline + CI gate
- Goal: source keys flow to Tolgee, translations flow back, shipped locales cannot ship with gaps.
- Files: `tools/scripts/i18n/{tolgee-push.ts,tolgee-pull.ts,check-complete.ts,glossary.json}`, `.github/workflows/i18n-sync.yml`, `packages/i18n/.env.example` (`TOLGEE_API_KEY=`, `TOLGEE_PROJECT_ID=`).
- Steps: 1. Push new/changed en messages with context (area, screen id comment from `#.` extractor comments). 2. Pull reviewed translations into `.po`. 3. Glossary/do-not-translate list (guide names, critter names, product names, `<local>` spans). 4. `check-complete` reports missing keys/broken ICU per shipped locale; `--mode warn` (PR CI: annotation, exit 0) and `--mode release` (release branches/tags: exit 1). 5. Workflow: on main push → push keys; nightly + manual → pull and open PR; release workflows call `--mode release`.
- Tests: `pnpm tsx tools/scripts/i18n/check-complete.ts --dry` against fixture catalogs; workflow lint via `actionlint`.
- Done when: `--mode release` fails on a fixture with a missing vi key, `--mode warn` exits 0 with an annotation, both pass on complete catalogs; no secret committed.

## Phase acceptance criteria

- [ ] `pnpm turbo build test --filter @cp/design-tokens --filter @cp/i18n` green
- [ ] Guide colours equal C5 in TS, Swift, Kotlin and CSS outputs (single snapshot test)
- [ ] Contrast test passes for all declared pairs
- [ ] Literal-style and unlocalised-string lint rules active in `apps/mobile` and `apps/web`
- [ ] Font payload ≤ 3 MB; Vietnamese coverage check passes; licences committed
- [ ] Language switch re-renders in place (RNTL test) and persists across relaunch
- [ ] `.xcstrings` / `strings.xml` / `locales_config.xml` generated from catalogs
- [ ] Tolgee completeness gate wired: warn on PRs, fail on release branches/tags
- [ ] No plan/phase/feature ids in code, comments, test names or commits

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Style Dictionary cannot express springs/cue maps cleanly | Custom emitter (small, tested); tokens schema unchanged |
| Static Archivo instances inflate bundle | Subset harder; drop 800 weight where unused (tokens reference 700/900 mostly) |
| Caveat lacks some Vietnamese/Thai glyphs | Resolver falls back to Geist italic per locale (already the design rule) |
| Lingui metro transformer issue with Expo SDK 58 | Pre-compile catalogs to JS modules and import them directly |
| System CJK fallback weight too light for display | Size/weight table per script; open question on a licensed heavy face |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Tolgee project + API key | Pipeline scripts run in `--dry` mode during development; required before the release gate |
| Translators / reviewers for 9 non-en shipped locales (15 if Q1 confirms 16) | Launch gate (owner: founder): release build fails until every shipped locale is complete and reviewed; no silent unshipping |
| Designer sign-off on C5 colours (design-system Q1) | Build with C5 as specified; a colour change is a token edit only |

## Open questions

1. Founder exception needed: 3n-8 designs 16 languages; Q-03 default ships 10. Default: register de, it, nl, tr, ms, pl as `shipped: false`; confirm the exception or ship all 16 under the launch gate.
2. CJK/Thai heavy display face — default: system CJK + bundled Noto Sans Thai Black; revisit after gallery review.
3. Doc delta: locale-generic `Intl` wrappers live in `packages/i18n/src/format`, not `packages/domain/format` — update code-standards §8.
4. Doc delta: Kotlin tokens path `packages/design-tokens/dist/kotlin` consumed via Gradle — record in system-architecture.
5. Light theme: only paper surfaces are designed — default: dark-only app theme with paper surface tokens.
