# Red team — global structure review

Scope: plan.md + 54 phase files (frontmatter, owns, task headings) + docs greps. Method: one scripted pass (parse frontmatter `depends_on/wave/features/screens/owns/effort`, count `### T` headings, recompute waves + critical path, diff with plan.md), then keyword greps.

## Verdict

Content coverage is solid. **plan.md was not regenerated after phase-level edits**: its DAG, waves, task counts and critical path no longer match the phase frontmatter. Three phases have `wave` values that break their own dependencies. Fix these before any parallel execution starts.

## Checks

| Check | Result |
|---|---|
| (a) F-001..F-192 | PASS: all 192 appear in exactly one frontmatter; each is named in its phase body; no extras |
| (a) Screens (149 in screens.json) | PASS for text refs (all referenced). 4a-1 Visa page, 4a-2 Boarding pass, 4b-2 Compare plans are in no `screens:` list; phase 46 marks them "reference only" |
| (a) Decisions 1–20 | PASS on spot-check (App Clip 21, Takumi 51, MetricStyle/Live Updates 02/50, hold-copy rewrite 27/28/31/34, Grab/Kiwitaxi 35, 3 Claude tiers 13, 30/day 32, brandname 09, pg_dump/restore drill 54, EU AI Act 13/51/54, domain assumption 10/45/51) |
| (b) DAG | FAIL: plan.md edges differ from frontmatter in 37 phases; frontmatter `wave` violates deps in 3 phases |
| (c) Parallel safety | FAIL: 1 same-wave owns overlap; 2 cross-phase shared paths; conflicting sync-streams convention |
| (d) Deferral language | PASS with 1 note: hits are "later phases extend", fake timers/clock in tests, "Ask me later" copy. Interim fallback in phase 34 (see F7) |
| (e) Time estimates | PASS: none; "month/week" hits are product domain (fare months, heatmap weeks) |
| (f) Supabase leftovers | PASS: only translation tables (product-decisions §1.1, api-contracts §0, system-architecture §15) and "never Supabase" guards |
| (g) plan.md accuracy | FAIL: see F1–F3 |

## Findings

| # | Sev | Issue | Fix |
|---|---|---|---|
| F1 | critical | plan.md §2 table + mermaid are stale versus frontmatter `depends_on`. Examples: 10 now also needs 12, 14; 17 needs 10, 12, 14; 19 needs 7, 10, 11, 17; 22 needs 10, 20, 21; 31 needs 34, 35, 46; 36 needs 14, 15, 18, 32; 40 needs 6, 9, 14, 15, 25; 45 needs 47, 49; 53 needs 40, 43, 45, 47, 49, 50; 54 needs 51. The frontmatter is the executable truth, so the waves in plan.md let phases start before their deps are done | Regenerate the §2 table, mermaid and §3 from frontmatter with a script (keep it in `plans/.../scripts/` or `tools/`). Decide per phase whether each added edge is real; drop the ones that are only doc deltas |
| F2 | critical | Frontmatter `wave` contradicts its own deps: 29 (w13) depends on 28 (w14); 33 (w12) depends on 27 (w13); 40 (w15) depends on 31 (w15). Also 15, 16, 17, 19, 22, 25–28, 30, 31, 35–38, 45, 50, 52–54 carry wave values that differ from plan.md | Recompute waves as `1 + max(dep waves)`. Result from frontmatter deps: **23 waves**: 1[1] 2[2,3,4,8] 3[5,6,9,12,14] 4[7,10] 5[11,17,21] 6[13,19,20] 7[15,18,39] 8[16,22] 9[23] 10[24,51] 11[25] 12[26] 13[27] 14[28,33] 15[29,34,46] 16[32,35] 17[30,31,36,38] 18[37,40] 19[41,43,48] 20[42,44,47,49] 21[45,50,52] 22[53] 23[54] |
| F3 | high | Counts wrong: plan says 517 tasks / critical path 194; the headings add up to **543 tasks**, critical path **249**: 1→2→9→10→11→13→18→22→23→24→25→26→27→33→34→35→31→40→48→49→45→53→54. Phase task counts differ in 2 (15 vs 14), 7 (18 vs 14; T8a/b, T11a/b, T12a/b/c), 13, 14, 19, 22, 26, 27, 28, 30, 31, 34, 36, 37, 42, 45, 50, 51, 52. Phase 52 `effort: 13 sessions` but has 12 tasks. Phase 2 lists T15 before T14 | Regenerate the counts. Set `effort` = heading count. Renumber phase 2 tasks in order |
| F4 | high | Milestone M1 lists phase 19, which now depends on 7, 11, 17 (not in M1). Other milestones probably drift too (45→47/49, 53→50) | Re-derive the phase sets per milestone from the regenerated DAG |
| F5 | high | Same-wave ownership clash: 45 owns `apps/mobile/src/features/you/` and excepts only `ping-settings/` (49). 50 owns `features/you/android-permissions/`. Both land in wave 21 (frontmatter wave 18) | Add `# except you/android-permissions/ (phase 50)` to 45 owns, or move that folder under an Android feature dir that 50 owns |
| F6 | medium | Sync-streams convention conflicts. Phases 10, 11, 13, 14, 29, 30, 33, 34 use per-area `infra/powersync/streams/<area>.yaml` merged by `build-config.ts`. Phases 20 and 22 still say "append-only edit of `infra/powersync/sync-streams.yaml`", which is a shared file with no owner, edited from waves 6 and 8 | Give 20 and 22 their own `streams/location.yaml` / `streams/onboarding.yaml` in owns. Make `sync-streams.yaml` a build output that nobody edits |
| F7 | medium | Shared paths across phases: `services/worker/src/rt-relay/` (10 and 11) and `apps/mobile/targets/widgets/CPWidgetBundle.swift` (48 and 49). These are sequential now, but ownership is ambiguous. Phase 2 owns `apps/mobile/targets/**` and `modules/cp-app-group/**` as "initial scaffold", with later phases extending them without explicit excepts | Name one owner per path and add explicit `# except` or `# extends (append-only)` notes. Keep the widget bundle registration in one place (49) |
| F8 | medium | Phase 34 logs flights to structured logs "until P35 lands" because `supplier_calls` is created in P35. But phase 15 T1 step 0 already creates `supplier_calls` + migration (suppliers core). This is contradictory, and it is an interim mechanism | Point 34 at P15's `supplier_calls` writer and remove the interim path |
| F9 | low | 4a-1 Visa page, 4a-2 Boarding pass, 4b-2 Compare plans are "reference only". Their motion captions describe distinct paywall variants. It is unclear whether 4e-* supersedes them or they are simply unbuilt (D1 says nothing deferred) | State the supersession in product-decisions (C-row), or add them to 46 `screens:` as A/B paywall variants behind an experiment flag |
| F10 | low | Phase 17 owns `apps/admin/**` with prose excepts for `modules/<area>/` added by later phases. Glob + comment exceptions can't be checked by machine | Own `apps/admin/src/{shell,core}/**` explicitly and leave `modules/` unowned-by-17 |
| F11 | low | Migrations use `<ts>_` placeholders. Parallel phases generating timestamps are safe, but `ALTER PUBLICATION powersync ADD TABLE` runs in each phase's migration with no ordering rule against phase 08's publication creation | code-standards: migrations must be generated at merge time (rebase regenerates ts); publication edits idempotent |

## Recommended order

1. Decide which of the added frontmatter deps are real (F1). 2. Regenerate the plan.md table, mermaid, waves, counts, critical path and milestones with a script (F1–F4). 3. Fix owns (F5–F7, F10). 4. Clean up F8, F9, F11.

## Unresolved questions

- Which is authoritative, the frontmatter deps or the plan.md edges? Several added edges (e.g. 31→46, 45→47/49, 53→50) lengthen the critical path by about 55 tasks and may only be doc-delta references.
- 4a-1/4a-2/4b-2: superseded alternates, or experiment variants to build?
