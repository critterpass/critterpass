# Fix log — phases 1–7 (red-team chunk 1)

Scope: edited only phase-01…phase-07. docs/ and plan.md untouched; follow-ups for them are listed below.

## Findings

| # | Phase | Finding | Result | Change / reason |
|---|---|---|---|---|
| 1 | 3, 4, 5 (+6, 7) | Package scope `@critterpass/*` vs `@cp/*` | APPLIED | Every `@critterpass/` changed to `@cp/`, and `--filter mobile` to `--filter @cp/mobile`, in phases 3–7. Phase 1 Package-names row now names `@cp/mobile` and records the code-standards §6 doc delta |
| 2 | 7 (+1, 2, 5, 6) | `(dev)` routes ship in release JS | APPLIED | One mechanism, defined in phase 1: Metro `resolver.blockList` for `src/app/(dev)/` when `APP_VARIANT=production`, a `__CP_DEV_ROUTE__` marker, and `tools/scripts/check-release-bundle.ts` as a CI job (phase 1 T4/T6, added to owns). `__dev/` changed to `(dev)/` in phase 5. Phases 2, 5, 6 and 7 now point at this mechanism instead of a layout guard |
| 3 | 2 | No Android native-surface spike | APPLIED | New requirement row plus T15: Glance widget reading the snapshot, a Live Update via an FCM data push (≥36), a MetricStyle guard (≥37), and a full-screen-intent alarm with its permission flow. Covered by an ADR and the acceptance criteria. Owns `apps/mobile/modules/cp-spike-android/**`. Effort 14 → 15 |
| 4 | 7 | T8, T11, T12 too big for one session | APPLIED | T8 split into T8a (chips+people+LiveSticker) and T8b (states). T11 split into T11a (plan+vote) and T11b (chat+story). T12 split into T12a (trip/money/camera), T12b (critters) and T12c (recap+monetize). Effort 14 → 18 |
| 5 | 3 | Missing-key gate blocks every feature PR | APPLIED | `check-complete` has two modes: `--mode warn` on PRs and `--mode release` on `release/*`, `v*` and `staging-*`. The runtime en fallback stays |
| 6 | 3 | 16 designed locales vs 10 shipped | PARTIAL | Verified: docs/product-decisions §7 Q-03 default ships 10 and is marked founder-confirm (Y). That is a recorded default, not a silent deferral. Applied: the 10 are now a hard launch gate with no fallback to "unshipped". The other 6 are an explicit founder exception (OQ1), and confirming it only flips flags. Not applied: shipping all 16 unilaterally, because that would override the documented Q-03 default |
| 7 | 3 | Phase 3 writes into `apps/mobile/targets/**` (phase 2) | APPLIED | Swift goes to `packages/design-tokens/dist/swift/{CPTokens,CPFont}.swift`, with the CPFont source in `packages/design-tokens/swift/`. The targets config adds them to `_shared`. Target paths removed from phase 3 owns |
| 8 | 5, 6 | Draw gate duplicated; missing deps | APPLIED (variant) | Phase 6 `depends_on: [3, 4]`, with no wave change. Motion's `draw` pattern owns the only ≤2 gate (`drawGate`). Phase 5 `<Sticker>` only renders `drawProgress` and `closedEyes`, so it no longer needs phase 6. Blink and gate wiring moved to `LiveSticker` in phase 7 T8a, and phase 7 already depends on 5 and 6. I chose this over adding 6 to phase 5, because that would push phase 5 to wave 4 and cascade into phases 7, 11 and beyond |
| 9 | 1 | Migrations run through PgBouncer | APPLIED | The pre-deploy migrate step uses `DATABASE_DIRECT_URL`, which is also a reference variable on api. The env row says migrations always use the direct connection, and why |
| 10 | 2, 5, 6 | Device-only done-when checks | APPLIED | Phase 2 has a "Device evidence" contract: the agent task delivers the harness, scripted capture and a blank ADR table, and a founder checklist step fills it. Done-when updated for T3, T7, T10, T11, T12 and T13. Phase 5 T4 fps assertion on emulators dropped, and a founder device run added. Phase 6 manual music check is now a founder checklist item |
| 11 | 5 | Two OG render paths | APPLIED | OG meta images come only from Takumi plus the atlas (phase 51). `@napi-rs/canvas` is only for full share cards. Plan share 1200×630 moved to Takumi |
| 12 | 5 | iOS 26 Liquid Glass icons; Android alias caveat | APPLIED | T7 emits a layered Icon Composer `.icon` bundle per icon and keeps flat PNGs as fallback. The founder checks both on an iOS 26 device. The Android `activity-alias` caveat is noted for phase 45 |
| 13 | 6 | Audio fallbacks = silent deferral | APPLIED | 6 themes, about 40 SFX and the chirps are a named launch gate with the founder as owner. `tools/scripts/check-audio-assets.ts` fails in release mode and warns on PRs. Fallbacks are marked runtime-safety only. Matches docs/product-decisions §6 content scope |
| 14 | 2 | Overlapping owns; `plugins/` non-canonical | APPLIED | Phase 2 now owns `(dev)/spikes/**` and only `plugins/with-apple-targets.ts`. OQ1 now records a doc delta to add `apps/mobile/plugins/` to the canonical layout |
| 15 | 1 | docs/README.md not in owns; "EAS secrets" | APPLIED | Added to owns as a one-line path update. Wording changed to `eas env:create --visibility secret` in Requirements, T4 and T9 |
| 16 | 7 → 1 | Screen ids vs the "no ids in code" rule | APPLIED (in phase 1) | The phase 1 T10 CLAUDE.md step now says design screen ids are allowed as product data keys, and plan, phase, task, feature and finding ids stay banned |
| 17 | 7 | Android edge-to-edge insets | APPLIED | New Edge-to-edge requirement row. T3 adds `e2e/shell/edge-to-edge.yaml` covering gesture and 3-button navigation. New acceptance line |
| 18 | 4 | "10 pose-less archetypes" but 12 listed | APPLIED | Changed to 12. T8's 15 archetypes + 6 guides is named as the source of truth. Verified: sit + stand + 13 archetypes in T6 = 15 |
| 19 | 3 | Latin subset strips Thai | APPLIED | Unicode ranges are now per family, with the Thai block U+0E00–0E7F for Noto Sans Thai. Thai coverage assertion added to T3 `--check` |

## Follow-ups outside my write scope (orchestrator)

| Target | Needed update |
|---|---|
| plan.md | Effort: phase 2 is 15, phase 7 is 18, so total tasks +5. Phase 6 depends on 3, 4. Phase 7 task list uses T8a/b, T11a/b, T12a/b/c |
| docs/code-standards.md | §6 `@critterpass/*` → `@cp/*`. §12 add the `(dev)` group and build-time exclusion |
| docs/system-architecture.md | Canonical layout adds `apps/mobile/plugins/` and `packages/design-tokens/dist/swift` feeding the targets `_shared` |
| Later phases | Surface phases must include `packages/design-tokens/dist/swift/*.swift` in `_shared`. Phase 45 must apply the activity-alias caveat. Phase 51 is the only OG path. Any phase adding dev screens uses `(dev)/` |

## Unresolved questions
1. Founder: confirm the 10-locale exception (Q-03), or ship all 16 under the launch gate.
2. Can Expo alternate icons take `.icon` bundles on SDK 58? The layered path depends on this, and flat PNGs are the fallback.
