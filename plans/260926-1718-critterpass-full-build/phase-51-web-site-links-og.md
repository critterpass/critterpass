---
phase: 51
title: Marketing site, invite landing, tips, legal, OG, web previews
status: in_progress
depends_on: [3, 5, 9, 21, 23]
wave: 10
late_block:
  tasks: [T3, T8, T9, T11]
  depends_on: [27, 28, 29, 40, 43, 45, 46, 52]
  wave: 19
features: [F-182, F-183, F-184, F-185, F-186, F-092]
screens: [Site-Home, Site-Header, Site-Footer, Site-Invite, Site-Referral, Site-Tips, Site-Tip-Article, Site-Legal, 3a-10, 3o-4, 3m-9]
tasks: 11
owns:
  - apps/web/src/layouts/
  - apps/web/src/components/site/
  - apps/web/src/components/previews/
  - apps/web/src/pages/index.astro
  - apps/web/src/pages/404.astro
  - apps/web/src/pages/tips/
  - apps/web/src/pages/legal/
  - apps/web/src/pages/account/
  - apps/web/src/pages/og/
  - apps/web/src/pages/rss.xml.ts
  - apps/web/src/lib/og/
  - apps/web/src/lib/api/
  - apps/web/src/content/
  - apps/web/tests/site/
  - packages/content/src/legal/
  - packages/content/src/tips/
  - services/api/src/routes/public-previews.ts
  - packages/domain/src/public/
  - packages/db/test/permissions/public-projections.test.ts
  - packages/db/migrations/*_public_reader_role.sql
  - .github/workflows/web.yml
  - services/api/test/public-previews/
  - services/worker/src/jobs/og/
  - packages/i18n/locales/en/web/
  - infra/cloudflare/web/
---
# Phase 51 — Marketing site, invite landing, tips, legal, OG, web previews

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D15 (first-party links), D16 (Astro 7 Workers, MDX tips, OG atlas + Takumi), D18 (Singapore controller, counsel), D20 (domain assumption), §5 legal/brand rows, C48 (server-driven perks) |
| `docs/system-architecture.md` | §2 topology (web), §3 repo (`apps/web` imports), §8 compliance (AI disclosure, affiliate disclosure, no web checkout) |
| `docs/api-contracts.md` | §5.7 links (`/i`, `/j`, `/p`, `/r`, `GET /v1/links/{token}/preview`), account deletion commands (phase 45) |
| `docs/api-contracts-async.md` | §2.2 `og.render` |
| `docs/data-model.md` | `consents` (legal version accepted), `invites`, `join_codes`, `referrals`, `shared_plans` (52), `recaps`, `proposals` |
| Phase files | Block A: 03 (tokens CSS, fonts, `web` catalog), 05 (`<critter-sticker>`, OG atlas, share layout canvas2d), 09 (Better Auth, OTP sender router, allow-list), 21 (link routes, AASA/assetlinks, handoff components, bot filter), 23 (invites/referral data). Block B: 27–29 (proposal, plan), 40 (locals/critter forms), 43 (recap), 45 (`request_account_deletion`), 46 (`/v1/catalog/perks`), 52 (shared-plan projection + `plan_links` + names-consent toggle model) |
| Reports | `design-analysis-260926-1143-web-store-social-report.md` (Site-*), `researcher-260926-1143-web-links-ops-report.md` (Astro/Workers, OG, legal), master §2 F-092, F-182…F-186, R11, R12, R19 |
| Renders | `docs/design-renders/pages/Site-Home.png`, `Site-Header.png`, `Site-Footer.png`, `Site-Invite.png`, `Site-Referral.png`, `Site-Tips.png`, `Site-Tip-Article.png`, `Site-Legal.png`; `screens/3a-10_Invite_a_seat_for_you.png`, `3o-4_Share_the_plan.png`, `3m-9_Recap_the_postcard.png` |

## Overview

Goal: `critterpass.app` ships the designed site (home, invite, referral, tips, legal) on Astro 7 / Cloudflare Workers with critter art, an OG image service, a web account-deletion flow, and public-safe web previews for proposals, recaps, read-only plans and locals pages.

Split into two task blocks so no task consumes later work:

| Block | Wave | Tasks | Needs |
|---|---|---|---|
| A — shell, home (no pricing), invite/referral, tips, legal, OG base (invite, referral, tip) | 10 | T1, T2, T4, T5, T6, T7, T10 | 03, 05, 09, 21, 23 |
| B — public previews API, web deletion, previews (proposal, recap, plan, locals), private OG kinds, home pricing/perks | 19 (after 52) | T3, T8, T9, T11 | 27–29, 40, 43, 45, 46, 52 |

Done when (A): Lighthouse ≥95 perf/a11y on home + tips; `/i/{token}` renders a personalised public-safe invite with correct OG image in WhatsApp/iMessage debuggers; legal pages are versioned and linked from the app. Done when (B): deletion can be requested from the web by phone, Apple or Google sign-in; preview pages leak no C3 fields (contract test); revoked tokens return 404 for page and OG.

## Requirements

| Feature | Designed behaviour | Undesigned (design in code) | Decisions |
|---|---|---|---|
| F-182 marketing site | Site-Home 8 sections (hero with drawn-on critters, how it works, guides, votes, trip day, critters, pricing/perks from server-driven perk list — block B T11, CTA), Site-Header/Footer, official App Store + Google Play badges (no custom badges), `<critter-sticker>` IO-lazy draw-on + reduced motion | mobile nav drawer, 404, language switcher (shipped locales), cookie-free analytics notice | C48 perks from `perks` catalog; no web checkout |
| F-183 invite landing + /join | Site-Invite: SSR personalised from `GET /v1/links/{token}/preview` (crew name, inviter first name, place, member count, countdown to expiry), QR for desktop, code lookup form (6-char), store handoff via phase-21 `Handoff`; Site-Referral page `/r/{code}` | expired, full crew (seat cap), revoked, rate-limited, unknown code, desktop vs mobile | public-safe subset only; invite/referral previews are never edge-cached (`Cache-Control: private, no-store`); opens counted in the Worker with the phase-21 bot filter (API counts nothing) |
| F-184 tips journal | Site-Tips index with categories, Tip Article MDX (content from `packages/content/src/tips`, produced by content factory 18), RSS, per-article OG, AI-assisted disclosure line (EU AI Act Art. 50), reading time, related tips | empty category, draft preview (admin token) | D16 |
| F-185 legal set | privacy, terms, subscription terms (auto-renew disclosures), location notice, AI disclosure, affiliate disclosure, community guidelines, support/help URL; each doc versioned (semver + effective date + changelog), `/legal/<doc>` latest + `/legal/<doc>/<version>`; app shows version and records acceptance in `consents`; deletion web flow `/account/delete` (block B): sign-in via phone OTP (Turnstile + per-IP/per-number limits + D14 country allow-list through the phase-09 sender router) or Sign in with Apple / Google on web (Better Auth social) → confirm → `request_account_deletion` → grace notice; anonymous-only accounts see "delete in the app: You → Delete account"; data export pointer | material-change banner; unknown version 404 | D18 counsel review (non-code) |
| F-186 OG / share images | Public kinds `/og/{kind}/{slug}.png` (tip, locals) keyed by public slug; private kinds `/og/{kind}/{token}.png` (invite, referral, proposal, recap, plan) keyed by the link token (never internal id) and cached in R2 under `HMAC(secret, kind‖id‖version)`; rendered with Takumi (wasm) in the Worker from the prerendered critter atlas + static fonts; `og.render` job pre-warms on create/update | fallback generic card on error; revoked/expired token → 404 + R2 purge of that key (revoke event → purge job); cache purge on version change | D16 |
| F-092 web previews (block B) | public-safe pages: proposal (3a-10 style summary: place, dates window, per-person estimate band, crew shown as a count + anonymous critter stickers; names/avatars only for members with names consent per the phase-52 toggle model), recap (3m-9 postcard + awards, photo-free unless published), read-only plan (days/items, no prices per member, no private fields), locals pages (`/locals/<place>` critter gallery of 4 forms); all with store handoff + OG | unlisted vs public (from 52 flags), revoked link, noindex for unlisted | C3 never exposed |

## Architecture & contracts

| Area | Delta |
|---|---|
| API | `services/api/src/routes/public-previews.ts` (sole owner of `GET /v1/public/{kind}/{token}`, kinds proposal/recap/plan; P, bot-filtered, 60/min/IP) → zod public projections (`PublicProposal`, `PublicRecap`, `PublicPlan`); kind=plan reads phase 52's materialised `community.shared_plan_public` via the shared fn `readPublicPlan(token)` exported from `packages/domain/src/community/` (52 does not expose a second route); `GET /v1/public/locals/{place_slug}` (catalog) — single doc delta in api-contracts §5.7 |
| Authz | new DB role `public_reader` (NOLOGIN, used via `SET LOCAL ROLE public_reader`): SELECT only on security-barrier public views (`public.proposal_public`, `public.recap_public`, `community.shared_plan_public`, locals catalog view) with explicit column allow-lists; no base-table grants; never `app_system`. Testcontainers test asserts no C2/C3 column in any view and that `public_reader` cannot read base tables; phase-54 RLS fuzz covers the role |
| Web data | `apps/web/src/lib/api/client.ts` (typed `hc` client; `cf` cache 60 s + SWR only for tips/locals/home; invite, referral, proposal, recap, plan previews `no-store`) |
| Worker | `services/worker/src/jobs/og/render.ts`: consumes `og.render` → `GET https://critterpass.app/og/{kind}/{id}.png?warm=1` (render stays in one place) |
| Legal content | `packages/content/src/legal/<doc>/<version>.mdx` + `index.ts` registry (zod frontmatter: version, effective_at, summary_of_changes); `client_config.legal_versions` fed from registry at build |
| Tips | `packages/content/src/tips/*.mdx` (zod frontmatter: slug, category, guide_id, ai_assisted, published_at, og) |
| Infra | `infra/cloudflare/web/wrangler.jsonc`: routes both hosts, R2 binding `OG_CACHE`, env vars (API base), no secrets committed |
| Edits to phase-21 files | `apps/web/src/pages/{i,j,r}/[...slug].astro` (block A) and `{p,plan,locals}/[...slug].astro` (block B) switch to preview components from `components/previews/` (content only; handoff logic untouched) |

## Tasks

Block A (wave 10): T1, T2, T4, T5, T6, T7, T10. Block B (wave 19): T3, T8, T9, T11.

### T1 — Site layout, tokens, header/footer, 404, i18n
- Goal: shell for all pages.
- Files: `apps/web/src/layouts/{Base,Site}.astro`, `apps/web/src/components/site/{Header,Footer,MobileNav,StoreBadges,LangSwitch}.astro`, `apps/web/src/pages/404.astro`, `packages/i18n/locales/en/web/*.po`, `infra/cloudflare/web/wrangler.jsonc`.
- Steps: 1. Token CSS import; fonts subset preload. 2. Header/Footer per renders; mobile drawer. 3. Official badges. 4. Lingui web catalog.
- Tests: `pnpm --filter @cp/web test:e2e -- site/shell`; `pnpm --filter @cp/web build`.
- Done when: Playwright visual diff vs `Site-Header.png`/`Site-Footer.png` within threshold at 1440 and 390 widths.
- Status: done — d66842a2

### T2 — Home page (8 sections)
- Goal: F-182.
- Files: `apps/web/src/pages/index.astro`, `apps/web/src/components/site/home/*.astro`, `apps/web/tests/site/home.spec.ts`.
- Steps: 1. Seven sections per render with `<critter-sticker>`; pricing/perks section slot left for T11. 2. Reduced motion.
- Tests: `pnpm --filter @cp/web test:e2e -- site/home`; `pnpm --filter @cp/web lighthouse`.
- Done when: visual diff passes for the seven sections; Lighthouse perf/a11y ≥95 mobile.
- Status: done — f97884a1 (Lighthouse on staging, mobile: home 96 perf / 100 a11y, tips 98 / 100; pricing slot stays for T11)

### T3 — Public preview API + `public_reader` role (block B)
- Goal: safe data for web.
- Files: `services/api/src/routes/public-previews.ts`, `packages/domain/src/public/*.ts` (projection schemas), `packages/db/migrations/<ts>_public_reader_role.sql`, `services/api/test/public-previews/*.test.ts`, `packages/db/test/permissions/public-projections.test.ts`.
- Steps: 1. `public_reader` role + security-barrier views for proposal/recap with explicit allow-lists; grant on 52's `community.shared_plan_public`. 2. Handlers run `SET LOCAL ROLE public_reader`; kind=plan calls 52's `readPublicPlan(token)`. 3. Token validation (revoked/expired/unlisted → 404). 4. Proposal crew = count + stickers; names only with consent. 5. Rate limit + bot filter reuse from 21.
- Tests: `pnpm --filter @cp/api test -- public-previews`; `pnpm --filter @cp/db test -- public-projections`.
- Done when: projection test fails if any column tagged C2/C3 is selected; `public_reader` SELECT on any base table is denied; revoked token returns 404.
- Status: partly done — c0462e1d (`public_reader`, `public.proposal_public` and `GET /v1/public/proposal/{token}`), d223edf7 (the plan kind), 92531d1d (`public.perks_public` and `GET /v1/catalog/perks` for the pricing section). Left: the recap kind (a recap is shared as an image and has no link or token; needs the founder's answer on a shareable recap link) and the locals projection (needs the founder's rule for what a public locals page may show while critter names stay hidden until found)

### T4 — Invite landing + /join + referral
- Goal: F-183.
- Files: `apps/web/src/components/previews/{InviteCard,JoinForm,ReferralCard,Countdown,Qr}.astro`, edits to `apps/web/src/pages/{i,j,r}/[...slug].astro`, `apps/web/tests/site/invite.spec.ts`.
- Steps: 1. SSR from link preview with `Cache-Control: private, no-store` (no edge cache/SWR). 2. All error states. 3. QR on desktop. 4. Code lookup. 5. Human-open counting in the Worker using the phase-21 bot filter (POST to the phase-21 open counter).
- Tests: `pnpm --filter @cp/web test:e2e -- site/invite`.
- Done when: expired/full/revoked/unknown each render designed-in-code states; an invite revoked after a first view renders the revoked state on the next request; bot UA does not increment opens; visual diff vs `Site-Invite.png`, `Site-Referral.png`.
- Status: done — 623732db, 794adea8 (a `www.` host now counts as its apex and each Wrangler environment sets `LINKS_ENV`, so production pages never link to staging; human opens are still counted by the api preview route through the Worker's proxied visitor IP/UA and its bot filter, as api-contracts §5.6 specifies)

### T5 — OG image service (base kinds: invite, referral, tip)
- Goal: F-186 render + cache core.
- Files: `apps/web/src/pages/og/[kind]/[id].png.ts`, `apps/web/src/lib/og/{templates/*.tsx,atlas,render,cache}.ts`, `services/worker/src/jobs/og/render.ts`.
- Steps: 1. Takumi wasm render with atlas sprites + static fonts. 2. Route resolves private kinds by link token only; R2 key = `HMAC(secret, kind‖id‖version)`. 3. Revoke/expiry → 404 + R2 delete (purge job on revoke event). 4. Worker pre-warm job. 5. Fallback card.
- Tests: `pnpm --filter @cp/web test -- og` (golden PNG diff per kind + revoked-token test); `pnpm --filter @cp/worker test -- og`.
- Done when: invite/referral/tip render 1200×630 < 300 KB; cache hit on second request (header assert); a revoked invite token returns 404 and its R2 object is gone; an internal id in the URL returns 404.
- Status: done — 1bd74b77, a91e1f34 (cards draw on first request and are cached in R2; `og.render` warms a code's card when an invite is created or a referral code minted, and purges it when a code is rotated, an invite revoked or a code expires)

### T6 — Tips journal + RSS
- Goal: F-184.
- Files: `apps/web/src/pages/tips/{index.astro,[category].astro,[slug].astro}`, `apps/web/src/pages/rss.xml.ts`, `apps/web/src/content/config.ts`, `packages/content/src/tips/schema.ts`, `apps/web/tests/site/tips.spec.ts`.
- Steps: 1. Content collection from package. 2. Article layout per render with AI disclosure. 3. RSS + sitemap.
- Tests: `pnpm --filter @cp/web test:e2e -- site/tips`; `pnpm --filter @cp/web build` (schema validation).
- Done when: invalid frontmatter fails build; RSS validates (`pnpm tsx tools/scripts/web/validate-rss.ts`).
- Status: done — 8897e9f9 (one designed article ships; the rest come from the content factory)

### T7 — Legal set + versioning
- Goal: F-185 pages.
- Files: `packages/content/src/legal/**`, `apps/web/src/pages/legal/{index.astro,[doc]/index.astro,[doc]/[version].astro}`, `apps/web/tests/site/legal.spec.ts`.
- Steps: 1. Registry + zod. 2. Pages per Site-Legal render with TOC and version history. 3. Draft docs authored from product decisions, marked `counsel_review: pending` banner until counsel sign-off flag set.
- Tests: `pnpm --filter @cp/content test -- legal`; `pnpm --filter @cp/web test:e2e -- site/legal`.
- Done when: every doc has latest + versioned URL; registry exposes versions to `client_config`.
- Status: done — 41abcc4a (`legalVersions()` is exported for `client_config`; seeding the `legal.versions` ops_config key belongs with the consents work in phase 45)

### T8 — Web account deletion flow (block B)
- Goal: store-required deletion URL usable by every non-anonymous user.
- Files: `apps/web/src/pages/account/{delete.astro,delete/confirm.astro,delete/done.astro}`, `apps/web/src/lib/api/auth.ts`, `apps/web/tests/site/deletion.spec.ts`.
- Steps: 1. Sign-in options: phone OTP via Better Auth through the phase-09 sender router (country allow-list), Cloudflare Turnstile verified server-side, per-IP and per-number rate limits; Sign in with Apple (web Services ID) and Google (web client) via Better Auth social; CORS allow-list for web origin. 2. Anonymous-only notice ("delete in the app"). 3. Confirm screen lists what is deleted/kept (C5 records). 4. Calls `request_account_deletion`; done page with grace period.
- Tests: `pnpm --filter @cp/web test:e2e -- site/deletion` (against local compose stack); `pnpm --filter @cp/api test -- web-otp-guard`.
- Done when: phone, Apple and Google sign-in each create an `account_deletions` row for the signed-in uid; OTP without Turnstile token, over rate limit, or to a non-allow-listed country is rejected without sending; unauthenticated call rejected.
- Status: blocked — `request_account_deletion` exists now; still needs founder accounts for web sign-in: an Apple Services ID, a Google web OAuth client and Cloudflare Turnstile keys

### T9 — Web previews: proposal, recap, plan, locals (block B)
- Goal: F-092.
- Files: `apps/web/src/components/previews/{Proposal,Recap,Plan,Locals}Preview.astro`, edits to `apps/web/src/pages/{p,plan,locals}/[...slug].astro`, `apps/web/tests/site/previews.spec.ts`.
- Steps: 1. Layouts derived from 3a-10/3m-9/3o-4 styles; proposal crew as count + anonymous stickers. 2. noindex for unlisted. 3. `no-store` for token pages. 4. Handoff CTA.
- Tests: `pnpm --filter @cp/web test:e2e -- site/previews`.
- Done when: each preview renders from seeded local stack; unlisted pages carry `noindex`; revoked token shows gone state; proposal preview shows no avatar or name without consent.
- Status: partly done — 4915f7c5 (the proposal's first days on the invite ticket), d223edf7 (the published plan on its plan link). Left: the recap preview and the locals page, both waiting on the founder answers named under the public preview API task

### T11 — Private OG kinds, locals OG, home pricing (block B)
- Goal: complete F-186 kinds and F-182 pricing.
- Files: `apps/web/src/lib/og/templates/{proposal,recap,plan,locals}.tsx`, `apps/web/src/components/site/home/Pricing.astro`, `apps/web/tests/site/og-private.spec.ts`.
- Steps: 1. Proposal/recap/plan templates keyed by link token, content from T3 projections only (no names/avatars without consent). 2. Locals template by public slug (critter forms from 40). 3. Pricing section from `/v1/catalog/perks` at build (build fails if unreachable in production; no hard-coded perks).
- Tests: `pnpm --filter @cp/web test -- og` (golden per new kind + revoked plan link → 404); `pnpm --filter @cp/web test:e2e -- site/home`.
- Done when: all 7 kinds render 1200×630 < 300 KB; revoked plan/recap/proposal tokens 404 with R2 purged; pricing section matches Site-Home render.
- Status: partly done — 008ddcf8 (home pricing from `/v1/catalog/perks`, read by the Worker per request since the home page is server-rendered, with `/pricing` and its card `/og/page/pricing.png`; Site-Home draws no pricing, so the section is logged in `docs/undesigned-states.md`), d223edf7 (the plan card). A proposal shares the invite card. Left: the recap and locals cards, with their previews

### T10 — Deploy pipeline + link-preview verification
- Goal: production readiness.
- Files: `.github/workflows/web.yml` (web job only), `apps/web/tests/site/unfurl.spec.ts`.
- Steps: 1. Build + `wrangler deploy` per env. 2. Unfurl test using OG metadata parser against staging. 3. Cache headers.
- Tests: `pnpm --filter @cp/web test:e2e -- site/unfurl`; `actionlint .github/workflows/web.yml`.
- Done when: staging deploy green; every route has og:title/og:image/twitter:card.
- Status: done — e42cedd9 (staging deployed and the link-preview check passes against staging.critterpass.app)

## Phase acceptance criteria
- [ ] Site pages visually match renders at desktop + mobile widths
- [ ] Invite/join/referral all states implemented; no edge cache on personalised previews; opens counted in the Worker for humans only
- [ ] OG for 7 kinds; private kinds keyed by token + HMAC cache key; revoke → 404 + R2 purge
- [ ] Tips MDX with RSS and AI disclosure
- [ ] Legal docs versioned; deletion web flow works end-to-end for phone, Apple and Google users; OTP abuse guards (Turnstile, limits, allow-list) tested
- [ ] Web previews expose only public projections via `public_reader` (permission test green)
- [ ] Lighthouse ≥95 perf/a11y on home + tips

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Takumi wasm size/CPU limit in Workers | pre-warm via job; fall back to static per-kind cards |
| Preview data leak | explicit allow-list views read as least-privilege `public_reader` + contract test + phase-54 fuzz |
| SMS pumping via web OTP | Turnstile + per-IP/per-number limits + country allow-list; OTP spend alert (54) |
| Counsel changes legal text | versioned registry; text edits only |

## Non-code dependencies
| Item | If not ready |
|---|---|
| Domain `critterpass.app` + `go.` (D20) | staging on workers.dev subdomain |
| Counsel-reviewed legal text | draft text shipped with review banner in staging only; production release blocked in phase 54 |
| Tips content from content factory | build passes with zero tips; index shows designed empty state |

## Open questions
1. Doc delta (single, api-contracts §5.7): `GET /v1/public/{kind}/{token}` (owned here; plan via 52's `readPublicPlan`) and `/v1/public/locals/{slug}`; data-model: `public_reader` role; OG URL keyed by token.
2. Web deletion auth: phone OTP + Apple + Google on web; anonymous accounts delete in-app — default assumed.
3. Community guidelines owned here or phase 52 — default: page here, content from 52.
4. Plan wave table (plan.md) needs the block-B row (wave 19) — controller edit.
