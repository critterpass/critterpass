# Fix log — phases 15–21 (chunk 3)

Date 2026-09-26. Files edited: phase-15 … phase-21 only. 21 findings: 19 applied as proposed, 2 applied in a different form than the finding proposed (#2, #7). None rejected.

| # | Phase | Finding | Result | What changed / why |
|---|---|---|---|---|
| 1 | 15–21 | pnpm filters `@critterpass/*`, `mobile`, `web` match nothing | Applied | All filters rewritten to `@cp/<dir>` (P01 row "Package names"). Every command is now `pnpm --fail-if-no-match --filter …`, so a filter that matches nothing fails. P19 already used `@cp/*` and got the guard too. |
| 2 | 19 | P19 depends on later phases | Applied in a different form | `depends_on` is now [1, 7, 8, 10, 11, 17] and wave 3 → 6. The payment-webhook alert moves to P46 (its own rule file). Not split into P19a/P19b: only P54 (wave 19) depends on P19, so a split gives no scheduling gain, and a new phase file is outside this task's allowed files. |
| 3 | 16, 18 | Views in PowerSync streams | Applied | P16: `trip_share_totals` is now a real table written by `cost.recompute`. P18: `critter_public` view removed. The catalogue has no names. Names go in `critter_names` (no user or repl grant) and are copied into the user's own `collection_entries.critter_name` by the collect command, which syncs through the user-scoped stream. This is a doc delta and P40 consumes it. |
| 4 | 15 | Suppliers core lives in P35 (wave 14) | Applied | P15 T2 now builds `packages/suppliers/src/core/{egress,http,audit}.ts` and `*_supplier_calls.sql` (owns updated). The doc-delta open question records the move. |
| 5 | 15, 16 | `registerToolExecutor` (P13) not in depends_on | Applied | P15: added 13, wave 6 → 7. P16: added 13, wave 7 → 8. Dependents checked: no wave violations. |
| 6 | 17 | Missing deps 10, 12, 14 | Applied | `depends_on` is now [8, 9, 10, 12, 14] and wave 4 → 5. Dependents (18, 19, 35, 47, 52) are all in later waves. |
| 7 | 20 | `spawn_rules` (P18) and `set_consent` owner | Applied in a different form | Not added as a dependency on 18: that would push P20 to wave 8 and break P39, which is in wave 7. Instead the planner works over registered candidate sources: P20 registers POI + stay sources, and P40 registers `spawns`. P20 now owns the `set_consent` handler (doc delta), and P19's text points to P20. |
| 8 | 17 | Admin cookie / Access / session policy | Applied | Admin now uses a second Better Auth instance (basePath `/v1/admin/auth`, cookie prefix `cp_admin`, 12 h). The admin Worker reverse-proxies `/v1/admin/*` same-origin. Cloudflare Access sits on the `admin.` host, the JWT is forwarded, and the api rejects requests without it. |
| 9 | 16 | Budget band reveals the lowest max | Applied | No band until k ≥ 3. The upper edge is floored to a fixed $50 step. New property test: the lowest max can only be inferred to within at least one full step. |
| 10 | 16 | View without `security_invoker` | Applied | Covered by the table from #3. Added a permission test that an outsider is denied (`permissions/trip-share-totals`). |
| 11 | 19 | Events sent for users without consent | Applied | `NO_CONSENT_ALLOWED` operational allow-list added (billing/fraud events only). Everything else is skipped, with a test. |
| 12 | 20 | SOS gated by mock rejection | Applied | `LOCATION_IMPLAUSIBLE` now applies only to encounter and visit evidence. Accessory fixes are accepted. Share and SOS fixes are stored with the flag, and SOS is exempt from the rate limit. Test added. |
| 13 | 20 | Missing plist / manifest keys | Applied | Every iOS key (AlarmKit, photo library read and add, calendar full access, Live Activities) and every Android permission (CAMERA, RECORD_AUDIO, READ_CALENDAR, READ_MEDIA_*) is listed explicitly. Added the prebuild check `tools/scripts/check-permissions-manifest.ts`. |
| 14 | 18 | Done-when checks need humans or 24 h batches | Applied | T5–T10 and T12 done-when checks now cover agent work only: generate, validate, queue. A batch still running is picked up with `resume` in a follow-up session. New "Founder gate checklist" G1–G7. City and item counts stay in phase acceptance. |
| 15 | 19, 20, 21 | Physical-device done-when checks | Applied | These are now simulator/emulator or Device Farm runs with saved artifacts. Physical checks (P20 T4 and T11 battery, P21 T8, P19 T9 phone receipt) move to the M4/M8 milestone checklists. |
| 16 | 21 | App Clip gate can never trip | Applied | The clip is built unconditionally behind the `links.app_clip` flag (default off; it controls the AASA `appclips` entry and the handoff meta tag). The gate is evaluated on the beta cohort (≥ 30 per platform), then again after launch at ≥ 200. |
| 17 | 19 | `docs/runbooks/**` ownership overlaps other phases | Applied | P19 now owns only `docs/runbooks/alerts/**`. Its runbook paths are updated. |
| 18 | 15 | Cron count, duplicate `fx.refresh`, T1 tests | Applied | Text now says six crons, all named. `fx.refresh` is registered only in T6. The T1 test command covers all 6 permission files. |
| 19 | 16 | Two remainder rules | Applied | T4 now states the `splitBoost` exception (buyer absorbs the remainder; P33/P46 must use it). Golden cases: $12/5 and $12/7. |
| 20 | 17 | `ops` carve-out and emergency CLI | Applied | Carve-out is now explicit: USAGE on `ops` plus INSERT on `ops.approvals` only, with RLS WITH CHECK and a permission test. `apps/admin/scripts/cmd.ts` added to T8. |
| 21 | 19 | Session replay contradiction | Applied | Replay is off at launch and ready behind the `analytics.replay` flag. The Mobile SDK row and open question 6 now agree. |

## Follow-ups for the controller (outside this task's allowed files)

- plan.md: update the wave column (P15 → 7, P16 → 8, P17 → 5, P19 → 6) and open question 13 (the suppliers core and `supplier_calls` now live in P15).
- P35: take `packages/suppliers/src/core` and `supplier_calls` out of its owns list and scope, so it extends the P15 core.
- P40: register the `spawns` geofence source. Its collect command must write `collection_entries.critter_name` through P18's `setCollectedName`.
- P46: add the payment-webhook failure alert rule under `infra/monitoring/alerts/`.
- Docs deltas: `trip_share_totals` table, `critter_names`, `collection_entries.critter_name`, `set_consent` (owned by P20), `supplier_calls`, `analytics.replay` and `links.app_clip` flags.
- The M4/M8 milestone checklists in plan.md need the physical-device items: P20 T4 and battery, P21 T8, P19 phone alert.

## Unresolved questions

1. Is the $50 band step and k ≥ 3 minimum acceptable product-wise? Defaults chosen; the design's 3c-5 waiting state already covers k < 3.
2. Is 30 invite installs per platform enough in the beta cohort to evaluate the App Clip gate?
