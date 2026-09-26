# Fix log — phases 50–54 (chunk 8)

Date 2026-09-26. Files edited: phase-50, 51, 52, 53, 54 only. No docs/ or plan.md edits.

| # | File | Finding | Result | Notes / verification |
|---|---|---|---|---|
| 1 | 51 | Wave-10 phase consumes later work (45, 46, 43, 52, 27–29, 40) | Applied | Verified waves: 45=w17, 46=w13, 43=w16, 40=w15, 52=w18. Added `late_block` (T3, T8, T9, new T11; deps 27,28,29,40,43,45,46,52; wave 19 — 52 is w18 so "w18 or later" = 19). T3 moved too (projects proposal/recap/plan). Home pricing/perks moved to T11. Effort 11 |
| 2 | 53 | Deps missing; wave 11 too early | Applied | deps +40,43,45,47,49,50 → wave 19; `early_block` T4/T6 stays wave 11. 52 not added (no community screen captured). Cascade: 54 → wave 20 (+51 dep) |
| 3 | 51 | OG keyed by internal id | Applied | Private kinds by link token; R2 key HMAC(kind‖id‖version); revoke → 404 + purge; tests in T5/T11 |
| 4 | 52/51 | Public plan read owned twice | Applied | 51 owns route `GET /v1/public/{kind}/{token}`; 52 owns projection + `readPublicPlan(token)`; 52's `/v1/public/plans/{token}` removed; single §5.7 doc delta |
| 5 | 51 | Previews run as `app_system` | Applied | `public_reader` role + security-barrier views; migration owned by 51; 54 T5 fuzz covers role |
| 6 | 51 | Web OTP abuse; Apple/Google users locked out | Applied | Turnstile, per-IP/number limits, allow-list via phase-09 router (dep 9 added); Apple/Google web sign-in; anonymous in-app notice |
| 7 | 50 | Live Updates for non-initiators | Applied | Per-kind initiator table; others get high-priority/ongoing notifications |
| 8 | 50 | Exact alarm declared as alarm-clock use | Applied | `SCHEDULE_EXACT_ALARM` only, never `USE_EXACT_ALARM`; FSI user-granted; denied = default path |
| 9 | 50 | Keyguard/Dream support assumed | Applied | Runtime probe, hidden default, verified device list in T6 done-when |
| 10 | 50 | Duplicate cp-app-icon ownership | Applied | Verified phase-45 line 98/178 owns Android activity-alias; removed from 50 owns, requirements, T7, criteria |
| 11 | 50 | EncryptedSharedPreferences deprecated | Applied | Keystore non-exportable HmacSHA256 (imported server secret) + DataStore metadata; doc delta noted (async §5) |
| 12 | 50 | SOS DND bypass unspecified | Applied | `cp_sos` channel, `setBypassDnd`, policy-access flow, degrade, test in T4 |
| 13 | 52 | P30/P46 not in deps | Applied | depends_on += 30, 46 |
| 14 | 52 | No consent withdrawal / leave / deletion path | Applied | `withdraw_publish_consent` + `community.rematerialise` (crew leave, P45 `account.purge`); tests in T2 done-when |
| 15 | 52 | Server face re-detection unspecified | Applied (adjusted) | P44 stores only on-device `face_count`, not boxes (C4 no face data) — the "stored boxes" premise was false. Named YuNet ONNX via onnxruntime-node, threshold 0.6, in-memory boxes, fail-closed vs `face_count`; licence confirm at T2 (open Q) |
| 16 | 52 | T3/T7/T8 exceed one session | Applied | Split into T3a/b, T7a/b, T8a/b; effort 13 (fix said ~12; +1 for rematerialise work) |
| 17 | 54 | Time/store-dependent done-when | Applied | Green once + scheduled nightly; submission; 3-night run + approval + rollout = founder gate |
| 18 | 54 | Auto Opus→Sonnet downgrade changes D5 | Applied | Alert + pause/queue; downgrade only via audited founder toggle |
| 19 | 51 | Edge cache on invite previews; open counting | Applied | `no-store` for token pages; opens counted in Worker with phase-21 bot filter |
| 20 | 51 | Proposal preview avatars without consent | Applied | Count + anonymous stickers; names only with 52 consent model |
| 21 | 50 | Gradle under CNG; T2 too large | Applied | `npx expo prebuild -p android --no-install`; project name verified in T1 (`<cp-surfaces-gradle>` placeholder); T2 → T2a (TS) / T2b (Kotlin); effort 10 |
| 22 | 53 | `pnpm --filter tools`; seed may hit real suppliers | Applied (adjusted) | Phase 01 defines no tools package (`pnpm vitest run tools/scripts`), so used that form instead of inventing `@critterpass/tools`. Seed: Viator sandbox + forwarded-booking fixtures; guard on supplier mode |

Rejected: none.

## Follow-ups for controller (outside my write scope)
- plan.md wave table: 51 block B wave 19; 53 wave 19 (early block 11); 54 wave 20; effort changes (50→10, 51→11, 52→13).
- Doc deltas: api-contracts §5.7 public route + OG token URLs; data-model `public_reader` role; async §3.2 Android initiator rule, §5 Keystore; product-decisions §4 FSI/exact-alarm row.

## Unresolved questions
1. YuNet model licence/version confirmation (fallback: exclude photos with faces).
2. Is shifting 54 to wave 20 acceptable, or should 53 block B merge into 54?
