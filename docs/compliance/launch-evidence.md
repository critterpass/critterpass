# Launch evidence

One row per launch gate: what proves it, where the proof is, and its state. Updated 2026-10-07.
A gate is "met" only with a recorded result; "built" means the tool exists and has not produced a
passing result yet; "unknown" means nobody has measured it. Nothing in this document was run
against production.

## Gates

| Gate | Evidence | State |
|---|---|---|
| Journeys on iOS and Android | journey flows and a nightly workflow | not built (no `e2e/journeys`, no nightly workflow) |
| Performance: cold start, frame rate, iOS download size | `pnpm tsx tools/scripts/perf/run.ts --ci …` with files from a device run and a store `.ipa` | built; **unknown** (no device step writes the inputs yet) |
| Performance: invite landing JavaScript ≤100 KB | `pnpm tsx tools/scripts/perf/run.ts --web-url https://staging.critterpass.app/i/ABC123` on 2026-10-07 (an unknown code: the page answers 404 and still renders the invite landing and its scripts) | 46.8 KB gzip in 8 files: met on transfer size. Uncompressed it is 129.6 KB; docs/system-architecture.md §9 does not say which the budget means (**unknown**, founder to confirm) |
| Performance: command p95 ≤300 ms, api → database p50 <3 ms | Grafana queries in `tools/scripts/perf/api-p95.ts` | not met: database p50 last read 7.4 ms on staging; the command duration metric is missing in Grafana |
| Performance budgets not measured by any script | local query p95, chat round trip, realtime revocation, guide first token, draft job time, widget memory, background location battery, web LCP (docs/system-architecture.md §9) | **unknown** |
| Accessibility | [accessibility-audit.md](accessibility-audit.md) | contrast met (26 pairs); screens not scanned; manual checklist unsigned |
| Database isolation | permission matrix and RLS fuzz in CI; static report `tools/scripts/security/rls-coverage.ts` | met: 284 tables, RLS forced on all, fuzz finding fixed ([security-review.md](security-review.md) finding 2) |
| Secrets and dependencies | `bash tools/scripts/security/scan.sh` | met on 2026-10-07 for tracked files, `pnpm audit` and OSV (six accepted advisories) |
| Containers | Trivy config scan | 3 open (security-review finding 1) |
| HTTP security headers | `tools/scripts/security/headers.ts` | not met on staging (security-review findings 3 and 4); production unknown |
| External security review | [security-review.md](security-review.md), scope in `tools/scripts/security/review-scope.md` | not started (founder item) |
| App Store privacy labels and privacy manifests | [app-privacy-labels.md](app-privacy-labels.md) | labels proposed, not filed; app manifest missing |
| Play Data safety | [play-data-safety.md](play-data-safety.md) | proposed, not filed; web deletion page missing; photo permission declaration undecided |
| Age rating | [age-rating.md](age-rating.md) | proposed, not filed; three unknowns |
| AI disclosure | [ai-disclosure.md](ai-disclosure.md) | server marks every guide payload; in-app label not evidenced |
| Affiliate disclosure, "contains ads: no" | [affiliate-disclosure.md](affiliate-disclosure.md) | copy present on supplier cards; surfaces not walked on a device |
| Account deletion end to end | purge suites in CI (`packages/db/test/purge`, `services/worker/test/account/purge.db.test.ts`) | database purge covered; stored-object erase not evidenced; no device journey; no web page |
| Legal documents | drafts in `packages/content/src/legal` (all at their first draft version) | not counsel-approved (founder item) |
| Load | harness in `tools/scripts/load`, results in docs/runbooks/capacity.md | built; not run |
| AI cost guard and kill switches | suites in CI | production caps and the staging switch drill not done (founder item) |
| Restore and failover drills | docs/runbooks/restore.md, docs/runbooks/failover.md | built; neither drill has run |
| Alerts and runbooks | `infra/monitoring/alerts`, docs/runbooks | rules written; not applied or fired |
| Store submission and staged rollout | `.github/workflows/release.yml`, docs/runbooks/release.md | workflow written and linted, never dispatched; rollout config missing in `apps/mobile/eas.json` and `apps/mobile/store.config.json` (the workflow refuses to submit without it) |

## Founder-only items

Agents do not attempt these. Each stays open until the evidence named is recorded here.

| Item | Why it blocks | Evidence needed |
|---|---|---|
| Legal entity (Singapore controller is assumed in docs/product-decisions.md D18) | the store accounts, the privacy policy's controller and the contracts with processors name it | registration number and registered name; the entity on both store accounts; the name in the privacy policy and terms |
| Counsel sign-off on the legal documents | launch is blocked until approved; staging pages carry a review banner | counsel's written approval naming each document and version in `packages/content/src/legal` (privacy, terms, ai, affiliates, location, community guidelines, subscription terms, referral terms, support); answers to the classifications marked "confirm" in app-privacy-labels.md and play-data-safety.md; the minimum age |
| External security reviewer | the security gate needs every finding closed or accepted | signed engagement; the report; one row per finding in security-review.md with the fixing commit or the founder's acceptance |
| Store accounts, tax and banking | submission is impossible without them | App Store Connect and Play Console agreements active; tax and bank forms complete; the Play service account key and App Store Connect API key stored as the secrets docs/runbooks/release.md names |
| Store submission and rollout start | the last launch gate | submission ids for both stores; approval notices; date the phased release and the 1% Play rollout started |
| Privacy labels, Data safety, age rating filed | store forms are entered by the account holder | screenshots or exports of each filed form, matching the proposals here or noting the differences |
| Partner programme terms (Agoda, Trip.com, Travelpayouts, Viator, Klook) | disclosure wording and API use are contractual | approval emails; any required wording changes applied to the disclosure copy |
| Production AI spend caps and the kill-switch drill | cost guard thresholds are a business decision | the cap values set in production; a dated note of each switch flipped on staging and the fallback seen |
| Manual accessibility pass | the automated scan cannot judge reading order, announcements or large text | the signed checklist in accessibility-audit.md |
| Three green nightly journey runs | launch gate | run links |
