# Critterpass: web, deep links, growth infrastructure and engineering ops (tech stack research)

Date 2026-09-26. Researcher report. Inputs: `scratchpad/requirements-brief.txt`, `screens.json` (screens 3a-1..3a-13, 3m-9, 3n-6..3n-11, 3o-4, 3p-1..3p-6, 4b-3), site text (`Site-Home/Tips/Tip-Article/Invite/Referral/Legal`), and the companion design reports `design-analysis-260926-1143-web-store-social-report.md` (the link contract, §2) and `design-analysis-260926-1143-critter-render-engine-report.md` (Node prerender verified on `@napi-rs/canvas`).
Every version, price and limit below was checked live on 2026-09-26. Sources are in the Key claims table (§9). Items marked **[unverified]** could not be confirmed (the web-search budget ran out part-way through). Treat them as assumptions.

**Framework dependency:** this report assumes **React Native + Expo** for the app, as the render-engine report recommends. Every section says what changes if the app is Flutter or native (§7).

---

## 0. TL;DR: recommendations

| # | Area | Recommendation | Runner-up | Flips if |
|---|---|---|---|---|
| 1 | Marketing site | **Astro 7** (static pages + on-demand SSR only for `/i/*`, `/p/*`, `/r/*`) | Next.js 16.3 | the team wants one React meta-framework for web and a future web app, or needs Vercel-native features |
| 2 | Hosting | **Cloudflare Workers** (static assets free and unlimited; $5/mo paid plan for SSR/OG CPU) + R2 for images | Vercel Pro ($20/seat) | Next.js is chosen; preview-deploy DX outweighs cost |
| 3 | Tips CMS | **MDX in the repo** via Astro content collections (`@astrojs/mdx` 8) | Keystatic (git-backed UI on the same files); Sanity if many non-dev editors | more than ~2 non-technical editors, or localised articles in 3+ languages |
| 4 | OG/share images | **Build-time critter atlas** (`@napi-rs/canvas`, unmodified design scripts, already verified) + **request-time composition with Takumi 2.14** (WASM on Workers; WOFF2 and variable fonts, which Archivo's `wdth` axis needs) cached in R2/CDN | Satori 0.33 + resvg with static font instances; full-fidelity fallback is a Node service rendering whole cards on `@napi-rs/canvas` | Takumi regressions or maintenance risk (§5.3) |
| 5 | Universal Links / App Links | Own `critterpass.app` + alternate host `go.critterpass.app`; AASA + `assetlinks.json` served from Workers; Android 15+ **Dynamic App Links** for server-side path rules | – | – |
| 6 | Deferred deep links | **First-party, no vendor SDK in v1.** Android: Play Install Referrer (deterministic). iOS: web CTA copies the link, then first launch runs `detectPatterns` (no prompt) and shows a `UIPasteControl` "Paste your invite" (no prompt). Plus the 6-char code (3a-11) and a phone-hash match after OTP | **Airbridge DeepLink Plan** (free under 10K MAU) | paid UA spend becomes material → MMP (AppsFlyer/Adjust) + ATT + AdAttributionKit |
| 7 | Referral attribution | First-party ledger on the same link payload; server-side qualification events; App Attest / Play Integrity + phone uniqueness | MMP referral module | same as #6 |
| 8 | Product analytics | **PostHog Cloud EU** (analytics, flags, experiments, surveys, mobile replay, one SDK) | Amplitude (2M events free) | event volume explodes and cost exceeds ~$1–2k/mo, or the growth team demands Amplitude-grade cohort tooling |
| 9 | Crash/perf | **Sentry** (RN SDK 8.28, Expo plugin, EAS source maps, replay, profiling; backend too) | Crashlytics (free; no official RN) | budget is zero and native-only |
| 10 | Flags / remote config | **PostHog feature flags** (1M requests/mo free) + a hard-coded kill-switch fallback | GrowthBook OSS 5.1 self-host | PostHog cost or latency |
| 11 | Paywall A/B | **RevenueCat Experiments** (in Pro: free under $2.5k MTR, then 1%), *if the payments report picks RevenueCat* | Superwall (free under $10k paywall revenue, then 1%) | the paywall needs remote-designed layouts beyond what RevenueCat Paywalls can express |
| 12 | CI/CD | **EAS Build/Submit/Update + EAS Workflows** (Maestro jobs) for the app; **GitHub Actions** for lint, types, unit, backend and web | fastlane 2.240 + GitHub Actions macOS ($0.062/min), or Codemagic (500 free M2 min/mo) | EAS cost at scale, or the app goes Flutter/native |
| 13 | OTA | **EAS Update**, `runtimeVersion: fingerprint`, staged rollouts; policy: fixes and content only | hot-updater 0.36 (OSS, self-host on R2) | EAS Update MAU fees bite (~100k+ MAU) |
| 14 | Monorepo | **pnpm workspaces + Turborepo 2.11** | Nx 23 | many generators and strong module boundaries needed; team is Nx-experienced |
| 15 | Testing | Vitest 5 (packages, backend, web) · Jest 30 + jest-expo + RNTL 14 (app components) · **Maestro 2.10** E2E on EAS Workflows · renderer golden tests (Node vs Chromium refs) · Maestro `assertScreenshot` in "motion-freeze" mode · Playwright 1.63 (web + OG) · Testcontainers 12 / PGlite (backend) · **promptfoo** evals gate | Detox 20.51 (grey-box RN) | flake budget unacceptable with black-box Maestro |
| 16 | Localisation | **Lingui 6** (ICU messages, PO catalogs, metro transformer; shared by app, web and email) + **Tolgee Cloud** (OSS, ICU-aware editor) | Localazy (key-based pricing, unlimited languages; cheapest for 16 languages, but ICU support unverified) or Crowdin | launch locale count ≥8 and cost dominates → Localazy |
| 17 | Email | **Resend** (React Email; $20/50k, $35/100k) on a `mail.` subdomain | Postmark ($15/10k; stronger transactional-only reputation) | deliverability problems |
| 18 | SMS OTP | Behind the auth provider's BYO-SMS hook: **Twilio Verify + Fraud Guard**, or **Prelude** (cheaper, anti-fraud included); WhatsApp OTP for SEA | Vonage Verify | SEA SMS cost or fraud spikes |
| 19 | Postcards (Pass+) | **PostGrid** (API test mode, 245 countries, local print in US/CA/UK/AU/EU) | Prodigi (UK-printed stamped postcards from £0.40 + postage) or Lob (US-origin only) | the crew base is US-only → Lob/PostGrid domestic |
| 20 | Backend observability | **OpenTelemetry SDK** (traces/metrics stable; logs still "development") → **Grafana Cloud** free tier (50 GB logs/traces) + Sentry for errors | Axiom (500 GB/mo free) | log volume >50 GB/mo |
| 21 | Compliance | No ATT in v1 (no tracking); privacy manifests; in-app **and** web deletion; Declared Age Range / Play Age Signals for Texas SB 2420; EU AI Act Art. 50 AI disclosure; Apple 5.1.2(i) explicit consent for third-party AI | – | an ads/MMP SDK is added → ATT prompt + label changes |

**Indicative tooling cost** (excludes LLM, maps, flights, hosting of the core backend, postcards): **~$300–450/mo at launch (≤10k MAU)**, **~$2–3k/mo at 100k MAU** (§6).

---

## 1. Context

- Small team, TypeScript-leaning. No code yet; design only (149 screens).
- Growth loop = **crew invites**: link or 6-char code → install → prefilled 3-tap pass (3a-10..3a-13). Target: "About fifteen seconds from opening the link to here" (3a-13 caption).
- Web = marketing plus a **link surface**: personalised Invite landing ("WINSTON WANTS YOU IN BALI", code SUNNY4 with countdown, desktop QR), Referral ("critterpass.app/i/WINST8", stamps), Tips journal ("new every Thursday"), Legal ("UPDATED SEPT 2026", draft copy).
- Critter art is procedural Canvas2D (~140 KB JS). It cannot run in Satori/edge renderers, but it runs unmodified in Node on `@napi-rs/canvas` (render-engine report, measured).
- Heavy native surfaces (widgets, Live Activities, AlarmKit, App Intents; 5a–5c) mean frequent native releases. OTA can't carry most of these changes.
- Money: Pass+ ($3.99/mo, $29.99/yr), Trip Boost (~$12), paywall and limit prompts (4a–4f). Physical postcard perk (3m-9).
- Languages: 3n-8 shows English, 中文（简体）, Bahasa Indonesia, 日本語 "+12 more" = **16 app languages**. Currencies home/local/both.
- Privacy-heavy: background location dwell (3l), live crew location plus SOS (3g/3k), calendar, contacts prefill ("FROM WINSTON'S CONTACTS", 3a-12), dietary profiles, voice, camera, email import (3h), account deletion with 30-day undo (3n-9..11).

## 2. Evaluation criteria (tied to screens)

| ID | Criterion | Screens / evidence | Weight |
|---|---|---|---|
| C1 | Invite → install → prefilled pass conversion and reliability | 3a-10 "Opened from WhatsApp · 2 min ago", 3a-11 "Paste a link / Pasted from Winston's message", 3a-12, 3a-13 "15 seconds"; Site-Invite QR "opens straight into the Bali Six, or the store" | 5 |
| C2 | Rich share previews with critter art | invite/proposal/recap links (3f-1, 3m-9 POSTCARD/STORY 9:16/POSTER, 3o-4), Tips "Share · Send to the group chat" | 4 |
| C3 | Content velocity plus SEO for Tips/Legal | Tips "new every Thursday", categories, "KEEP READING"; Legal TOC | 3 |
| C4 | Referral attribution plus anti-fraud | Site-Referral "one stamp per friend, a friend has to be new", statuses PENDING/ALMOST/STAMPED | 4 |
| C5 | Web motion fidelity plus performance | Home "hover to say hi", canvas critters, marquee | 3 |
| C6 | Localisation scale (16 languages, ICU plurals, currency) | 3n-8; Archivo condensed display type (text expansion risk) | 4 |
| C7 | Observability of AI/long-running/offline flows | 3b pitch streaming, 3c draft job progress, 3k offline outbox | 4 |
| C8 | Release safety with many native extensions | 5a Live Activities, 5b notifications, 5c widgets; 3n-5 alternate icons | 4 |
| C9 | Compliance surface | 3l location dwell, 3g live location, 3n-9..11 deletion, 3p-2 auto screenshot, 3p-6 rating rules, AI guide | 5 |
| C10 | Paywall/limit experimentation | 4a paywall, 4f contextual limit prompts, first-trip-free | 3 |
| C11 | Physical postcard fulfilment | 3m-9 "Mail a real one to each of you · PASS+" | 2 |
| C12 | Small-team TCO / ops burden / vendor count | – | 5 |

Scores in the matrices are 1 (poor) to 5 (best), judged against these criteria.

---

## 3. Options matrices

### 3.1 Marketing site framework

| Option | C2 OG | C3 content/SEO | C5 motion/perf | C1 per-link SSR | C6 i18n | C12 TCO/host-freedom | Notes |
|---|---|---|---|---|---|---|---|
| **Astro 7.3.5** | 4 (Takumi/satori by hand) | 5 (content collections, MDX 8, sitemap) | 5 (zero-JS default, islands; critters as one small island) | 4 (`prerender=false` routes on the CF adapter 14.3) | 5 (built-in routing) | 5 (Cloudflare-owned but MIT; runs anywhere) | Astro 7.0 shipped 2026-06-22; team joined Cloudflare 2026-01-16 |
| Next.js 16.3.6 | 5 (`next/og` built-in) | 4 | 3 (React runtime on every page) | 5 | 3 (next-intl DIY) | 3 (best on Vercel; Hobby is non-commercial) | 16.3 stable 2026-08-03 |
| SvelteKit / TanStack Start | 3 | 3 | 4 | 4 | 3 | 4 | no shared React with the app; smaller talent pool for RN devs |

→ **Astro.** The site is ~90% static content plus 3 dynamic link routes. React islands (`@astrojs/react` 7) let it reuse TS packages (tokens, critter renderer).

### 3.2 Hosting

| Option | Cost | Edge SSR/OG | Storage/egress | Fit |
|---|---|---|---|---|
| **Cloudflare Workers** | Free: 100k req/day, 10 ms CPU. Paid **$5/mo**: 10M req, 30M CPU-ms, up to 5 min CPU; **static assets free, unlimited** | Takumi WASM (3.7 MB raw) fits the 64 MiB limit; OG needs the paid CPU | R2 $0.015/GB-mo, **zero egress** | 5 |
| Vercel | Pro $20/seat/mo, 1 TB transfer; Hobby is **non-commercial** | `next/og` native | Blob/egress metered | 4 (if Next) |
| Netlify | Credit-based: Pro $20 = 3,000 credits; bandwidth 20 credits/GB, deploy 15 credits | Functions | – | 3 (credit math is opaque for viral spikes) |
| Railway | $5/$20 plans + ~$20/vCPU-mo, $10/GB-mo, $0.05/GB egress | container Node (good for a `@napi-rs/canvas` render service) | egress cost | 2 for the site, 4 for the backend |

→ **Cloudflare** for site, links, OG and assets. The backend host is a separate decision (backend report).

### 3.3 Tips CMS

| Option | Editors | Git/PR review | Localisation | Cost | Risk |
|---|---|---|---|---|---|
| **MDX in repo** (Astro collections) | devs / tech-comfortable writers | 5 | folder per locale | $0 | – |
| Keystatic 0.6.9 (Thinkmill; last npm 2026-08-26) | non-devs via local/GitHub UI | 5 (commits to repo) | not documented **[unverified]** | $0 (Keystatic Cloud optional) | pre-1.0 |
| Sanity | many editors | 2 | unlimited locales | Free: 20 seats, 10k docs; Growth $15/seat | vendor lock, API quotas |
| Payload 3.90 | self-host admin | 3 | yes | infra | Payload Cloud paused new projects after the Figma acquisition (2025-06) |

→ Start with MDX. Add Keystatic on the same files if a non-dev writer joins. Guide-bylined articles ("By Tokek, Bali") = frontmatter `guide: gecko` that renders the atlas sticker.

### 3.4 OG / share image rendering

| Option | Critter art | Fonts (Archivo `wdth`) | Runtime | Speed | Risk |
|---|---|---|---|---|---|
| **Atlas PNG + Takumi 2.14** | prerendered PNG/WebP from the atlas | WOFF2 + variable (`fontVariationSettings`) | Workers WASM (1.5 MB gz), Node native | 2–10× Satori (vendor claim) | young project (~3k★), single main maintainer |
| Atlas + Satori 0.33.5 (+resvg) | same | TTF/OTF/WOFF only, **no WOFF2**, no variable axes → static instances needed | Workers WASM | baseline | limited CSS (no calc/z-index) |
| Node `@napi-rs/canvas` 1.0.9 whole-card render | draws critter live (seeded) | registers TTF; variable-axis support **[unverified]** | Node container | fast, CPU-bound | layout by hand (no flexbox) |
| Headless Chromium (Playwright / Browser Rendering) | exact design HTML | all | heavy | slow, costly | cold starts |

→ Atlas + Takumi at request time for per-link images. Build-time Playwright exports for store/social assets (render-engine report §4). Keep JPEG/WebP under 300 KB for margin. **Meta's documented WhatsApp limit is <600 KB, ≥300 px wide, aspect ≤4:1, `<head>` within the first 300 KB of HTML.**

### 3.5 Deferred deep linking / attribution

| Option | iOS deferred mechanism | Android | Free tier | Price after | RN SDK | Privacy/ATT | C1 | C12 |
|---|---|---|---|---|---|---|---|---|
| **First-party** | clipboard (`detectPatterns` → `UIPasteControl`) + code + phone match | Install Referrer (deterministic, 90 d) | – | infra only | `expo-clipboard` `ClipboardPasteButton` (iOS 16+) + small native module for `detectPatterns` | no third-party data flow | 4 | 4 |
| Branch | NativeLink = the same clipboard trick (Branch says "not deterministic"); premium plan | referrer | trial only ("Basics") | custom; third-party estimates $500+/mo | `react-native-branch` 7.0.0 | privacy-manifest disclosure | 4 | 2 |
| AppsFlyer OneLink | vendor matching | referrer | Zero plan: 12k conversions/yr, **no deferred DL** | Growth $0.07/conversion | `react-native-appsflyer` 7.0.2 | MMP (ATT if IDFA) | 4 | 2 |
| Adjust | vendor | referrer | Base ≤1,500 attributions/mo for ≤12 months **[secondary source]** | custom | `react-native-adjust` 5.8.0 | MMP | 4 | 2 |
| **Airbridge DeepLink Plan** | deferred DL, QR, custom domain, generation API | referrer | **free <10K MAU** | pay-as-you-grow (not public) | `airbridge-react-native-sdk` 4.10.0 | – | 4 | 4 |
| ChottuLink | deferred | referrer | free 25K MAU; $39/150K; $99/500K (self-published) | – | `react-native-chottulink-sdk` 1.1.2 | – | 3 (young) | 4 |
| App Clip (Apple) | deterministic: the clip renders the ticket and hands the token to the full app via App Group | n/a (Play Instant retired Dec 2025) | – | – | `react-native-app-clip` 0.9.1 / Expo targets | – | 5 | 2 (extra target; **15 MB cap if QR-invoked**, 100 MB digital-only iOS 17+) |

→ **First-party v1.** Vendors don't solve iOS better: Apple bans fingerprinting "regardless of whether a user gives your app permission to track", and vendor iOS deferral falls back to the same clipboard trick. Our flow also needs app-specific prefill (seat token → private prefill endpoint), which no vendor models. Re-evaluate the App Clip after measuring the iOS not-installed funnel.

### 3.6 Product analytics

| | Free tier | Price after | Flags/experiments | Mobile replay | EU hosting | C7 | C10 | C12 |
|---|---|---|---|---|---|---|---|---|
| **PostHog** | 1M events, 5K recordings, 1M flag req, 1,500 survey responses, 100K exceptions, 100K AI events, 10 GB logs | ~$0.00005/event (1–2M), tiered down; mobile replay 2× web price **[secondary]** | included | GA for RN (screenshot mode), iOS, Android, Flutter | Frankfurt | 4 | 5 | 5 |
| Amplitude | 2M events; 10K replays; unlimited flags; 1 experiment | Plus "from $0" usage-based; Growth custom | limited count | yes | yes | 4 | 3 | 3 |
| Mixpanel | 1M events; 10K replays; 10 flags; 1K MEU experiments | Growth calculator | included | yes | EU residency | 4 | 4 | 3 |

→ **PostHog** consolidates analytics, flags, experiments, surveys (3p feedback, NPS), replay and LLM analytics under one SDK and one DPA. Watch: event discipline, because motion-heavy UIs tempt over-instrumentation. Disable RN autocapture of touches; send a named event taxonomy.

### 3.7 Crash & performance

| | Free | Paid | RN/Expo | Backend | Extras |
|---|---|---|---|---|---|
| **Sentry** | Developer (1 user): 5k errors, 5M spans, 50 replays | Team $26/mo (50k errors, unlimited users); Business $80 | `@sentry/react-native` 8.28 (2026-09-24), Expo config, EAS source-map upload | `@sentry/node` 11 (OTel-based) | Snapshots (beta 2026-06-11), Size Analysis (Emerge), profiling $0.25/UI-hr |
| Crashlytics | free | – | no official RN (community `@react-native-firebase`) | no | Crash Insights |
| SmartBear Insight Hub (ex-Bugsnag) | 7,500 events + 1M spans **[secondary]** | event + span packs | yes | yes | OTel-native |
| Embrace | trial | custom | yes | – | mobile-RUM depth |

→ **Sentry** (one tool for app, backend and web; shake-to-report 3p-1/3p-2 can use Sentry User Feedback with screenshot attachment, or our own endpoint).

### 3.8 CI/CD & release

| | App builds | Signing | OTA | E2E | Cost (small team) | Lock-in |
|---|---|---|---|---|---|---|
| **EAS (Build/Submit/Update/Workflows)** | iOS $2 / Android $1 per medium build | managed credentials | EAS Update (Free 1k MAU, Starter 3k, Production 50k; Starter overage $0.005/MAU) | `maestro` job on EAS simulators/emulators | Starter $19 + $45 credit; Production $199 + $225 credit | RN/Expo only |
| fastlane 2.240 + GH Actions | macOS $0.062/min (after the Jan-2026 price cut) | `match` | none (add hot-updater / EAS Update standalone) | self-run | cheap per minute, costly in maintenance | none |
| Codemagic | 500 free M2 min/mo; $0.095/min M2 | managed | CodePush service $1/2,500 installs or from $99/mo | yes | mid | low |
| Xcode Cloud | 25 compute h/mo included; 100 h $49.99 | Apple | none | XCTest | cheap | iOS only |

→ **EAS** (native extensions via config plugins; fingerprint runtime). GitHub Actions handles non-mobile jobs (Linux $0.006/min).

### 3.9 Monorepo

| | Task cache | Remote cache | Expo fit | Non-JS | Complexity |
|---|---|---|---|---|---|
| **pnpm 12 workspaces + Turborepo 2.11** | yes | Vercel or self-host | Expo: first-class pnpm; isolated installs supported since SDK 54; auto Metro config since SDK 52; autolinking resolution since SDK 55 | Rust/Python/Go experimental (2.11, 2026-09-18) | low |
| Nx 23.2 | yes | Nx Cloud | Expo plugin | many plugins | higher |
| Bun workspaces | – | – | supported by Expo | – | runtime divergence risk on EAS **[unverified]** |

Layout: `apps/{mobile,web,api}` + `packages/{critter-art,critter-render-cli,design-tokens,i18n,link-contract,api-types,email,analytics-events,config}`. `link-contract` holds the versioned zod schema for the resolver response (R9 in the design report), shared by web, app and API.

### 3.10 Mobile E2E

| | RN/Expo | Flake | Visual | Cloud | Cost |
|---|---|---|---|---|---|
| **Maestro 2.10** (2026-08-31; 15.8k★) | black-box YAML, EAS `maestro` job | low (auto-wait) | `assertScreenshot` (2026-03), crop, threshold | Maestro Cloud $250/device/mo; or EAS | free local |
| Detox 20.51 | grey-box, RN-synchronised | lowest for RN | none native | self | free |
| Appium 3.8 | any | higher | plugins | device farms | free + farm |

### 3.11 Localisation TMS (≈2,000 unique UI lines / ≈8k words counted from `screens.json`, incl. sample data; 16 target languages)

| | Pricing basis | Entry price | ICU | OSS/self-host | Fit for 16 langs |
|---|---|---|---|---|---|
| **Tolgee** | hosted words | Free 30k words, 3 seats; Translate €58/mo, Optimise €133/mo (annual); 400k MT credits | yes (`@tolgee/format-icu` editor/format) | yes | 3–4 (word-based cost grows with languages) |
| Localazy | **source keys** (unlimited languages) | Free 200 keys; $29 (1k keys), **$89 (3.5k keys)**, $199 (10k) | **[unverified]** | no | 5 on cost |
| Crowdin | hosted words × target languages | Pro ~$50–59/mo for 60k words **[conflicting secondary]** | yes | no | 2–3 |
| Lokalise | processed words (re-priced Nov 2025) | Explorer $149/mo; Growth $379 | yes | no | 2 |

### 3.12 Email / SMS / postcards / observability: see deep-dives §5.8–5.11.

---

## 4. Target architecture (web + links + ops)

```
critterpass.app (Astro on CF Workers)          go.critterpass.app (alt UL host, same Worker)
 ├ / /tips/* /legal/* /crew  (static, prerendered)   └ /i/* /p/* /r/*  (UL/App Link target for CTA taps)
 ├ /i/{code}[/{seat}]  (SSR, noindex, Smart App Banner, clipboard-copy CTA, QR)
 ├ /og/{kind}/{id}.png (Takumi, cache R2+CDN by {id}:{version})
 ├ /.well-known/apple-app-site-association, /.well-known/assetlinks.json (+dynamic_app_link_components)
 └ /account/delete (Google Play web deletion URL) , /help
         │ fetch (service token)                          ▲ PNG atlas (build-time, @napi-rs/canvas)
         ▼                                                │
api.critterpass.app  links resolver · click log (bot-filtered) · seat claim · referral ledger · prefill (attested)
         │ OTel → Grafana Cloud · errors → Sentry · product events → PostHog (server-side for qualification)
App (Expo): expo-router UL handling · first-launch resolver (Install Referrer | pasteboard detect → UIPasteControl | code) · PostHog · Sentry · EAS Update
```

### 4.1 Invite flow, tech sequence (3a-10..3a-13)
1. Share (app): `POST /links` → `{code6, seatToken?}`. URL `https://critterpass.app/i/BALI6X/{seat}?c=wa`. `c` comes from the share-sheet `activityType` when available.
2. Preview bots (WhatsApp, iMessage, Telegram, Slack, X): serve OG only; log as `preview`, not `click`.
3. Human open, app installed: the UL fires only when the tap comes from another domain and not inside some in-app browsers. The landing CTA links to `go.critterpass.app/...` so a same-page tap still triggers the UL. Android Chrome gets `intent://…;package=…;S.browser_fallback_url=…`.
4. Not installed: CTA tap → `navigator.clipboard.writeText(fullLink)` (user gesture) → App Store / Play. Play URL carries `&referrer=cp_code%3DBALI6X%26cp_seat%3D…%26cp_click%3D…`.
5. First launch (before 3a-1, ≤1.5 s skeleton):
   - Android: Install Referrer, called once (`react-native-play-install-referrer` 2.0.1 or a 20-line Expo module on `installreferrer:2.2`).
   - iOS: `UIPasteboard.detectPatterns([.probableWebURL])` raises no alert (Apple doc). If a match is likely, show 3a-11 "Paste your invite" as `ClipboardPasteButton` (UIPasteControl, no alert), then validate host/path/HMAC.
   - Else: 3a-1 with "I have an invite code" highlighted.
   - After OTP (3a-8): server matches the salted E.164 hash of seats the inviter created from contacts.
6. `GET /invites/{seat}/prefill`: attested device (`@expo/app-integrity` = App Attest + Play Integrity, **alpha**), rate-limited, TTL = code expiry. Then 3a-12 prefill → `POST /claim` (transactional seat cap).
7. Funnel events (PostHog, server-side where possible): `link_preview`, `link_click`, `store_click`, `install_attributed{via:referrer|paste|code|phone}`, `prefill_viewed`, `pass_issued`, `seat_claimed`. The p50/p90 time-to-3a-13 metric proves or disproves the 15-second target.

### 4.2 Why not a vendor, and when to switch
- Vendors earn their fee on **paid UA attribution** (SKAN/AdAttributionKit postbacks, ad-network integrations, fraud). Critterpass v1 growth is organic/viral.
- Tripwire: paid UA >$5–10k/mo, or a need for multi-touch attribution across ad networks → add AppsFlyer/Adjust. Then ATT prompt, `NSPrivacyTracking` domains and privacy-label changes follow, and deep links can move to the MMP.
- A deep-link-only vendor (Airbridge free <10K MAU) is a cheap **insurance option** if the first-party iOS funnel underperforms before an App Clip is built.

---

## 5. Deep-dives

### 5.1 Marketing site (Astro on Cloudflare)
- Pages: Home (critter islands with IO-lazy draw-on and a static WebP LCP fallback), Tips list/article (MDX, RSS, JSON-LD `Article` with the guide as `author` persona plus a human reviewer credit, since the Tips page claims "checked by people who've been"), Invite (SSR), Referral (static explainer v1; the dashboard is a PO decision, see the design report Q1), Legal (MDX, versioned, anchors match the TOC), `/account/delete`, 404.
- i18n: Astro built-in `i18n` routing. **en only at launch**; add `/{locale}/` plus `hreflang` when locale #2 ships (YAGNI).
- Web analytics: PostHog in cookieless/memory persistence mode, so no consent banner is needed. Verify with counsel per market.
- Fonts: self-hosted WOFF2 subsets (Instrument Serif, Geist, Geist Mono, Caveat, Archivo variable). The OG renderer uses the same WOFF2 through Takumi.
- Security: `/i/*` pages `noindex`, no invitee PII in HTML (the invitee name appears only in-app via the seat token), per-IP rate limits, Turnstile on the "FIND MY CREW" code form.

### 5.2 Universal Links / App Links specifics
- AASA served by the Worker with `content-type: application/json` and no redirects. Components include `/i/*`, `/p/*`, `/r/*`, `/plan/*`, `/app/*` and exclude `/tips*`, `/legal*`, `/account*`. Add `webcredentials` for passkeys/OTP autofill; `appclips` later.
- Apple fetches AASA through its CDN, so changes propagate with delay **[unverified exact timing]**. Test with `?mode=developer` on dev builds.
- Android: static intent filters with `autoVerify` + `assetlinks.json`. On Android 15+ with Play services, `dynamic_app_link_components` in `assetlinks.json` adds or excludes paths/query/fragment server-side without an app update (doc updated 2026-09-16).
- Known breakers: in-app browsers (Instagram, TikTok) suppress UL handoff. A user who once chose "Open in Safari" disables UL for the domain, so always show an explicit "Open in app" button. Same-domain taps don't fire UL, hence the alternate host.
- App Clip (v1.1 candidate): Expo supports it through a config plugin/targets. Keep it **digital-invocation-only** to get the 100 MB limit. A QR invocation (Site-Invite "Scan with your phone camera") caps the clip at **15 MB**, so the desktop QR should point to the web URL, not an App Clip Code.

### 5.3 OG / share-image pipeline
- Build time: `critter-render` CLI (render-engine report) → atlas `critters/{id}/{form}/{pose}@{size}.webp|png` → R2.
- Request time: Worker route `/og/{kind}/{id}.png` → fetch resolver JSON → Takumi `ImageResponse` (API-compatible with `next/og`) → cache on key `{kind}:{id}:{contentVersion}` → `Cache-Control: public, max-age=31536000, immutable` with a versioned URL.
- User-generated share images (recap story 9:16, poster, postcard 3m-9, 3o-4 plan card) render **on device** (RN Skia snapshot, per the render-engine report), so personal photos never leave the phone unless the user shares.
- Golden tests: Playwright renders each OG template with fixtures; pixel-diff against baselines in CI.
- Maintenance hedge: keep templates in Satori-compatible JSX (flexbox only, inline styles). Swapping Takumi ↔ Satori is then a one-file change, at the cost of static font instances.

### 5.4 Analytics, flags, experiments
- **PostHog Cloud EU**: `posthog-react-native` 4.78, `posthog-node` 5.54 (server-side events for referral qualification, boosts, claims), web snippet.
- Event taxonomy lives in `packages/analytics-events` (typed). Person profiles only after sign-in. The anonymous-first passport (3a-6 before account) is `$anon_distinct_id`, aliased at sign-in.
- Flags: remote kill-switches for LLM features, sponsored picks, live map. Client flags cached for offline (3k offline mode). Server flags evaluated locally in the API for latency.
- Experiments: paywall layout/copy/price-offering tests go through **RevenueCat Experiments**, because they test real store products/offerings. UI/onboarding tests go through PostHog experiments. Apple's App Store product-page optimisation (store-side) is separate.
- Avoid Statsig: OpenAI bought it in Sep-2025, then its brand and customers moved to Amplitude on 2026-05-05. Roadmap churn.
- Mobile replay: off by default. Enable at a low sample on onboarding/paywall only, with full masking. Sentry and PostHog screenshot replay can't mask Skia canvas content selectively. Critter art is harmless, but the map and chat need view-level masks.

### 5.5 CI/CD, signing, OTA policy
- **EAS Workflows**:
  - PR: lint, types, unit (GH Actions) → EAS Android build (cheaper) + Maestro smoke.
  - Nightly: iOS sim build + full Maestro + screenshot suite.
  - `main`: production builds → EAS Submit to TestFlight / Play internal.
  - Tags: store release.
- Signing: EAS-managed credentials (ASC API key); backup export in the password manager. Separate bundle IDs for dev/preview/prod. App Groups/entitlements for widgets, Live Activities, notification service/content extensions and alarms are declared in config plugins.
- **OTA policy** (write it into the repo `docs/`):
  - Apple DPLA §3.3.1(B): interpreted code may be downloaded only if it does not change the app's primary purpose, does not bypass signing, sandbox or OS security, and creates no storefront.
  - App Review 2.5.2: no downloaded code that "introduces or changes features".
  - Google Play Device & Network Abuse: no self-update outside Play, with an exception for code in a VM/interpreter "such as JavaScript in a webview or browser".
  - → OTA for bug fixes, copy, content, tuning and flag-gated UI of already-reviewed features only. New features ship in store builds.
  - `runtimeVersion: {policy: "fingerprint"}` so JS never lands on an incompatible native build. Staged rollouts (5% → 25% → 100%) gated on Sentry crash-free sessions.
- Cost hedge at scale: **hot-updater** (OSS, v0.36.x, self-host bundles on R2) or Codemagic CodePush replaces EAS Update MAU fees.

### 5.6 Testing strategy (small team, motion-heavy)

| Layer | Tool | What |
|---|---|---|
| Pure TS | Vitest 5 | critter-art geometry (seeded determinism), link-contract schemas, money splitting / currency rounding (3i), date heatmap (3c-3), ICU message compile |
| Renderer golden | Node `@napi-rs/canvas` vs Chromium refs from the untouched design scripts | thresholds from the render-engine report (mean abs <0.5/255) |
| RN components | Jest 30 + jest-expo 57 + RNTL 14 | logic/state of cards, forms, a11y labels. No snapshot-of-JSX tests (low signal) |
| Motion | "motion-freeze" build flag: global animation clock injected (Reanimated/Skia clock → fixed t), confetti seeded, typewriter completes instantly | Maestro `assertScreenshot` with `cropOn` at named keyframes (t=0, mid, end) for ~30 hero moments (stamp thud, pass issued, egg hatch, recap cards) |
| E2E | Maestro 2.10 flows on EAS | onboarding (anonymous → pass → sign-in), invite link (UL via `openLink`), code join, paywall (StoreKit test config / Play test tracks), offline outbox, deletion + undo |
| Visual PR review | Sentry Snapshots (beta) or Maestro baseline diffs committed | choose one; Sentry pricing after beta **[unverified]** |
| Web | Playwright 1.63 | pages, OG templates, AASA/assetlinks contract tests, WhatsApp OG size budget (<300 KB, head <300 KB) |
| Backend | Vitest + Testcontainers 12 (Postgres/Redis) or PGlite 0.5 for fast unit-DB | link resolver, seat-claim race (parallel claims), referral qualification, deletion cascade (30-day job), idempotent webhooks |
| Contract | recorded fixtures for third parties (LLM, flights, OCR) + MSW 2 | fixtures refreshed by a scheduled job against real sandboxes (no fake data in prod paths) |
| AI evals | promptfoo 0.123 (MIT; OpenAI acquisition announced 2026-03-09) in CI; Langfuse (MIT, ClickHouse since 2026-01-16) datasets if the AI report picks it | guide persona adherence ("a few words of the local language"), itinerary constraints (must-dos, budget privacy: never leak private maxes), redraft diff correctness, dietary flags. Gate on regression vs baseline, not absolute score |
| Perf | Reassure 1.6 (RN render perf) + Sentry profiling | list/drag screens (3e) |

### 5.7 Localisation pipeline
- Library: **Lingui 6** (April 2026). ICU MessageFormat syntax in PO catalogs, compile-time extraction, `@lingui/metro-transformer` for RN, the same catalogs for Astro and React Email.
  - MF2 (`messageformat` 4.0) is not needed. `Intl.MessageFormat` (TC39) is stalled, so don't plan for native MF2.
- Flow: `lingui extract` in CI → push source to the TMS → MT/AI pre-translate with glossary (critter names are **not translated**: Tokek, Pon…; guide "local words" stay in the source language) → human review for launch locales → pull PR → `lingui compile` → typed.
- Pseudo-locale (`en-XA` accented + 35% expansion) in the Maestro screenshot suite. Archivo condensed display type and fixed stamp shapes will overflow first.
- Guide LLM output is localised at generation time (prompt includes the user locale). Separate from UI strings.
- Numbers/currency/dates: `Intl` (Hermes Intl) with explicit currency display rules (home/local/both, 3n-8). Rates are cached offline.
- TMS pick: **Tolgee** (ICU-aware editor, OSS escape hatch, free to start). Switch to **Localazy** if ≥8 launch locales and its ICU handling checks out, because key-based pricing with unlimited languages is ~$89/mo for 3.5k keys.

### 5.8 Transactional email & SMS OTP
- Email use cases: deletion confirmation/undo ("We emailed this to w•••@gmail.com", 3n-11), feedback replies (3p-3 "A human reads every one"), invite-by-email share, receipts for web purchases (if any), data export ready (3n-6).
- **Resend** (`resend` 6.30, React Email 6.11) on `mail.critterpass.app` with SPF/DKIM/DMARC. The free tier caps at 100/day, so start on Pro $20.
- Separate streams (transactional vs product updates) to protect reputation. Postmark is the runner-up; its message streams are built in.
- Inbound email (3h booking import "Find bookings in my email") is **not** a Resend/Postmark concern if implemented via Gmail/Outlook read-only OAuth. Postmark inbound processing (Pro+) is an option for a forward-to address `trips@…`.
- SMS OTP (3a-8, third option after Apple/Google):
  - Auth provider decision belongs to the backend report. Use its BYO-SMS hook to send via **Twilio Verify** ($0.05/success + SMS fee, US $0.0083; Fraud Guard for pumping) or **Prelude** (from €0.032/verification PAYG; anti-fraud; SMS, WhatsApp, RCS, Telegram, Viber).
  - SEA: offer WhatsApp OTP first where supported.
  - Mandatory: country allowlist, per-IP/device/number velocity limits, App Attest / Play Integrity on the send endpoint, `autocomplete="one-time-code"` / SMS Retriever for autofill (3a-8 "SMS code autofills").

### 5.9 Print-on-demand postcards (Pass+ perk, 3m-9)

| Vendor | Origin/coverage | Per card | International | API | Notes |
|---|---|---|---|---|---|
| Lob | printed in US; international = USPS First-Class only, 4×6 only, +5–7 business days; 240+ countries; no tracking after "International Exit" | Developer $0.905, Startup ($260/mo) $0.645 | + intl postage (USPS intl postcard $1.75 from 2026-07-12) | mature, test mode | US-centric |
| **PostGrid** | local print US/CA/UK/AU/EU; 245 countries | US 4×6 First Class $0.902; CA $2.12 | "from $0.82 + international postage" | test mode on free Starter (500 mailings/mo) | best global fit for a single API |
| Stannp | UK + US; "anywhere in the world" | US $0.94 (<1k) → $0.70 | surcharge **[unverified]** | yes | UK strength |
| Prodigi | UK-printed stamped postcard (6×4), ships worldwide, 24 h production | from £0.40 + postage | Royal Mail intl price **[unverified]** | Print API | lowest print cost; slower to SEA/US |

- **Cost model** (≈ per trip = crew size × per-card): US-domestic crew of 6 ≈ $5.40. International crew of 6 ≈ $15 (PostGrid $0.82 + $1.75) to ~$25 (UK-origin to SEA/US) **[partly unverified]**.
- vs Pass+ $29.99/yr: **a single Pass+ member who takes 2–3 crew trips a year can cost more in postage than they pay.** Needs caps (see PO decisions).
- Also needs: postal address collection per crew member (new PII: consent, privacy policy, deletion), address verification (Lob/PostGrid APIs), print-safe 300-dpi render of the recap postcard. The critter is from the atlas; the photo is the user's, and printing it needs explicit consent from everyone shown **[legal check]**.

### 5.10 Privacy & compliance checklist (engineering-owned parts)
- **ATT**: not required if nothing is shared with other companies to track across apps (ATT doc). PostHog/Sentry are first-party analytics under DPAs. Adding an MMP/ads SDK triggers ATT plus `NSPrivacyTracking`.
- **Privacy manifests**: app-level `PrivacyInfo.xcprivacy` (Expo `ios.privacyManifests`), with required-reason APIs declared (UserDefaults, file timestamps, boot time, disk space). "Regardless of whether a user gives your app permission to track, fingerprinting is not allowed." Verify each SDK ships its own manifest.
- **App privacy labels / Play Data safety**: generate from one `data-inventory.yaml` in the repo (data type → purpose → linked? → retention → processor). This also feeds the privacy policy. The design report found the legal draft misses phone, contacts prefill, calendar, inbox import, dietary data, live location, postcards.
- **Apple 5.1.2(i)** (guidelines updated 2026-06-08): "clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission". This needs an explicit consent moment before the first guide chat/voice/camera (3j). It fits 3a-9's contextual style.
- **Apple 5.1.1(viii)**: apps may not compile personal information "not directly from the user or without the user's explicit consent". **5.1.2(v)**: contact-based outreach only "at the explicit initiative of that user on an individualized basis", no select-all, and show the message preview. For the 3a-12 prefill ("Winston filled in what he knows"):
  - keep inviter-supplied fields minimal (first name, home airport, 2 taste hints);
  - show them only to the invitee via the seat token;
  - TTL-delete if unclaimed;
  - invitee confirms/edits;
  - the privacy policy discloses it.
- **Account deletion**:
  - Apple 5.1.1(v): in-app initiation. Deletion may be non-immediate, but the timeline must be stated, and immediate deletion must also be available if scheduling around a subscription.
  - Revoke Sign in with Apple tokens (`/auth/revoke`).
  - Remind about the App Store subscription (3n-9 already does).
  - Google Play: in-app path **and a web deletion URL** + Data safety deletion answers → `/account/delete` on the site (verify identity via sign-in link).
  - 30-day undo (3n-10/11) is fine; the job must hard-delete on day 30 and log the proof.
- **Location**: Apple 5.1.5 (notify/consent; location APIs "shouldn't be used to provide emergency services", which matters for the crew SOS wording in 3k).
  - Retention proposal: raw fixes never leave the device except (a) live-share sessions (TTL = share end + ≤1 h, matching "auto-off after 1h") and (b) encounter verification (server receives place ID + dwell proof, not a trail).
  - Recap route map drawn from itinerary stops, **or** the privacy copy changes. This resolves the "not a trail of coordinates" contradiction found in the design report.
- **Age**:
  - Apple's new ratings (4+/9+/13+/16+/18+; questionnaire due 2026-01-31).
  - Texas SB 2420 enforceable since the Supreme Court denied stays on 2026-07-06. Developers assign age categories, use store age signals only for compliance, and need parental consent flows for minors. Apple Declared Age Range API (iOS 26) and Google Play Age Signals API (Texas signals for accounts created after 2026-05-28; global rollout by end-2026).
  - Utah delayed to 2027-05-06; Louisiana to 2027-07-01.
- **EU AI Act Art. 50** applies from **2026-08-02**: people must be informed they're interacting with AI "from the start of the first interaction", and the "obvious" exception is read narrowly. Critters are characters, so add an explicit "AI guide" label in chat headers and onboarding. The design has none.
- **CCPA regs** (effective 2026-01-01): risk assessments for sensitive PI such as precise geolocation. Applies only above CCPA thresholds. Log it for later.
- **Shake-to-report screenshots** (3p-2) may contain crew chat/location: show a preview, let the user remove it (the design has ×), and strip EXIF.

### 5.11 Backend observability
- `@opentelemetry/sdk-node` (JS SDK 2.x; traces+metrics **stable**, logs **development**) auto-instrumentation (HTTP, DB, queues) plus manual spans around LLM calls: `gen_ai.*` attributes, token counts, latency, cost. The long-running itinerary draft job (3c) gets a trace per job with task-progress events. The same IDs flow to the client progress UI.
- Export via an OTel Collector (or direct OTLP) → **Grafana Cloud** free tier: 10k metric series, 50 GB logs, 50 GB traces, 14-day retention, 3 users. Pro $19/mo base.
- Errors → Sentry (`@sentry/node` 11 is OTel-based, so spans correlate).
- Structured JSON logs with `trace_id`, never PII. Log redaction for phone, email, location and message bodies.
- SLOs: link resolver p95 <150 ms, OG p95 <800 ms uncached, first-launch deferral resolution p95 <1.5 s, push delivery lag, crash-free sessions ≥99.5%.
- Alternative: **Axiom** (500 GB/mo free, 30-day retention; $25/mo Cloud, 1 TB included) if log volume grows.

---

## 6. Cost estimates (monthly, USD, excluding backend compute, LLM, maps/flight APIs, store fees)

Assumptions: 3 engineers; ~200 events/MAU/mo; 40 iOS + 40 Android EAS builds/mo; 2 emails/MAU/mo; 25% of new users on phone OTP.

| Item | Launch (≤10k MAU) | 100k MAU | Basis |
|---|---|---|---|
| Cloudflare Workers + R2 | $5–10 | $10–40 | $5 plan; static free; R2 $0.015/GB, no egress |
| PostHog | $0–50 | ~$650 (+~$150 if 1% mobile replay) | 1M free; tiered per-event **[secondary rates]** |
| Sentry | $26 | $80–300 | Team → Business / reserved volume |
| EAS | ~$130 (Starter $19 + ~$75 builds after the $45 credit + ~$35 Update overage) | ~$450 (Production $199 + Update overage ~$0.005/MAU **[rate for the Production tier unverified]**) | expo.dev/pricing |
| EAS Workflows / Maestro CI minutes | $30–120 | $100–250 | $0.018–0.150/min |
| GitHub (Team + Actions Linux) | ~$12 + minutes | ~$12 + minutes | $0.006/min Linux |
| Resend | $20 | ~$125 (100k + 100k overage @ $0.90/1k) | resend.com |
| SMS OTP | ~$50–100 | ~$300–800 (SEA rates higher **[unverified]**) | Twilio $0.05 + fee / Prelude from €0.032 |
| Localisation TMS | €0–58 | €133 (Tolgee) or $89 (Localazy) | + one-off human review, the dominant cost: ~8k words × N languages **[unverified rates]** |
| Grafana Cloud / Axiom | $0 | $19–150 | free tiers |
| RevenueCat | $0 (< $2.5k MTR) | 1% of MTR | revenuecat.com |
| Deep linking | $0 | $0 (Airbridge free <10K MAU only) | first-party |
| **Subtotal** | **~$300–450** | **~$2.0–3.0k** | |
| Postcards (variable) | per trip $5–25 per crew | same, × Pass+ trips | §5.9 |

---

## 7. Where choices depend on the mobile-framework decision

| Area | RN/Expo (assumed) | Flutter | Native Swift/Kotlin |
|---|---|---|---|
| CI/CD | EAS | Codemagic (Flutter-first) or fastlane + GH Actions | Xcode Cloud (25 h free) + fastlane; Gradle on GH Actions |
| OTA | EAS Update / hot-updater | Shorebird **[unverified 2026 state]** | none (store only) |
| E2E | Maestro (works for all) / Detox (RN only) | Maestro / `integration_test` / Patrol **[unverified]** | Maestro / XCUITest / Espresso |
| i18n library | Lingui (ICU, PO) | `intl` ARB (ICU) | String Catalogs `.xcstrings` + Android `strings.xml` (the TMS handles all; keep ICU-compatible keys) |
| Pasteboard / UIPasteControl | `expo-clipboard` `ClipboardPasteButton` + tiny `detectPatterns` module | platform channel | direct |
| Monorepo | pnpm + Turborepo covers app/web/api | Flutter outside the JS graph (Melos); Turborepo 2.11 experimental non-JS | Xcode/Gradle outside; shared TS only for web/api |
| Analytics / crash | PostHog / Sentry RN SDKs | both have Flutter SDKs | both native |
| OG / renderer | shared TS critter core | TS core kept for web + pipeline; Dart port golden-tested | same, with a Swift/Kotlin port |

---

## 8. Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| iOS not-installed invite funnel leaks (clipboard ignored, the user copies something else, a different device) | M/H | 6-char code always visible on web and first-launch screen; phone-hash match; measure `install_attributed.via`; App Clip (digital-only) in v1.1 if iOS deferral is <60% of Android |
| In-app browsers block UL (Instagram, TikTok) | H/M | `go.` host, explicit "Open in app", clipboard copy on every CTA, Smart App Banner |
| Takumi maturity (young, small maintainer base) | M/M | Satori-compatible templates; golden tests; Node `@napi-rs/canvas` fallback service |
| `@expo/app-integrity` is **alpha** | M/M | pin the version; wrap it behind our own interface; degrade to rate limits plus short TTL |
| Vendor ownership churn in 2025–26 (Astro→Cloudflare, Payload→Figma, Statsig→OpenAI→Amplitude, Promptfoo→OpenAI, Langfuse→ClickHouse, Emerge→Sentry) | H/L–M | prefer MIT/OSS and export-friendly tools; one abstraction package per vendor (`packages/analytics-events`, `packages/flags`) |
| PostHog cost blow-up from chatty motion UI | M/M | typed taxonomy, no touch autocapture, sampling, billing alerts, per-product caps |
| OTA used for features → review rejection | L/H | written OTA policy, fingerprint runtime, PR label `ota-safe` checked in the workflow |
| SMS pumping fraud | M/H | Fraud Guard / Prelude anti-fraud, country allowlist, attestation, prefer Apple/Google sign-in |
| Postcard unit economics & delivery (international, no tracking) | H/M | caps, regional launch, "sent" not "delivered" status copy, reprint policy |
| Contacts-derived prefill vs Apple 5.1.1(viii) / 5.1.2(v) | M/H | minimal fields, per-contact invites, preview, TTL, invitee confirmation, policy text |
| EU AI Act Art. 50 non-disclosure (critters feel human) | M/H | "AI guide" label at first interaction plus a persistent marker in chat |
| Texas SB 2420 / age assurance | M/M | age-range APIs wired behind a flag; minimum age decision; parental-consent path if <18 is allowed |
| 16-language launch overwhelms QA; Archivo condensed overflow | H/M | launch with en + 3; pseudo-locale screenshots; LLM pre-translate + human review per locale |
| pnpm 12 is fresh (2026-08-26); EAS image support **[unverified]** | L/M | pin via `packageManager`; fall back to pnpm 11 if EAS lags |
| Maestro screenshot flake on motion | M/M | motion-freeze build, `cropOn`, thresholds 97–99%, keyframe-only baselines |

---

## 9. Decisions the product owner must make

1. **Deferred-link vendor**:
   - (a) first-party only [recommended];
   - (b) first-party + Airbridge free tier as insurance;
   - (c) MMP now (only if paid UA is planned in the first 6 months).
2. **App Clip for invites**: (a) v1.1 after funnel data [recommended]; (b) v1 (extra iOS target, ~1–2 weeks **[estimate]**).
3. **Launch locales**:
   - (a) en only;
   - (b) en + zh-Hans + id + ja (the 4 shown in 3n-8) [recommended];
   - (c) all 16 (≈ +8k words × 15 of review and QA).
   - Also en-GB vs en-US voice (the site copy is British).
4. **Postcard perk rules**:
   - (a) one card per crew member per trip, max 2 Pass+ trips/yr per subscriber;
   - (b) only to Pass+ members in the crew;
   - (c) launch regions US/UK/EU/AU/CA first, then SEA;
   - (d) drop the perk to digital-only for v1.
   - Also: address collection UX (not designed).
5. **Minimum age / rating**: (a) 13+ with Texas parental-consent flow; (b) **16+** (simplest across GDPR member states and Texas, and matches UGC chat plus live location) [recommended]; (c) 18+.
6. **Analytics data region**: PostHog EU (Frankfurt) [recommended for GDPR] vs US (lower latency for US users; neither is SEA-local).
7. **Mobile session replay**: off / sampled with masks on onboarding and paywall only [recommended] / broad.
8. **Tips authorship**: devs + writers in MDX [recommended] vs non-dev editors (Keystatic UI) vs headless CMS (Sanity).
9. **OTA scope policy**: fixes + content only [recommended] vs also flag-gated UI tweaks. Release cadence (e.g., weekly store builds).
10. **Email sender identity**: "Tokek from Critterpass" persona in From-name vs a neutral brand. Replies to a human inbox (3p "A human replies within two days"): which helpdesk?
11. **SMS channel**: SMS only vs WhatsApp OTP first in SEA (cheaper, but ties to Meta).
12. **AI disclosure wording and placement** (Art. 50 + Apple 5.1.2(i) consent): a one-time consent screen vs inline in the first guide chat.
13. **Referral dashboard surface** (design report Q1): in-app (not designed) vs web with signed handoff.

---

## 10. Key claims

| Claim | Source | Date | Confidence |
|---|---|---|---|
| Astro latest 7.3.5; 7.0.0 released 2026-06-22; 6.0.0 2026-03-10 | https://github.com/withastro/astro/releases ; npm registry `astro` | 2026-09-24 | High |
| Cloudflare acquired The Astro Technology Company; Astro stays open source and deployable elsewhere | https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-astro-to-accelerate-the-future-of-high-performance-web-development/ | 2026-01-16 | High |
| Next.js 16.3 stable 2026-08-03; latest 16.3.6 | https://nextjs.org/blog/next-16-3 ; npm `next` | 2026-08-03 / 09-26 | High |
| CF Workers Paid $5/mo, 10M req, 30M CPU-ms; static assets free & unlimited; Free 10 ms CPU | https://developers.cloudflare.com/workers/platform/pricing/ | updated 2026-08-28 | High |
| Workers: 64 MiB uncompressed size, 128 MB memory, up to 5 min CPU (paid) | https://developers.cloudflare.com/workers/platform/limits/ | updated 2026-09-05 | High |
| R2 $0.015/GB-mo, zero egress | Workers pricing page (above) | 2026-08-28 | High |
| Vercel Hobby is personal non-commercial; Pro $20/mo | https://vercel.com/pricing | accessed 2026-09-26 | High |
| Netlify credit plans (Pro $20 = 3,000 credits; 20 credits/GB bandwidth) | https://www.netlify.com/pricing/ | accessed 2026-09-26 | High |
| Railway Hobby $5, Pro $20; ~$20/vCPU-mo, ~$10/GB-mo, egress $0.05/GB | https://railway.com/pricing | accessed 2026-09-26 | High |
| Satori: no WOFF2, SVG output, no calc/z-index; latest 0.33.5 | https://github.com/vercel/satori ; GitHub release | 2026-09-22 | High |
| Takumi 2.14.0: Rust, WASM for Workers, WOFF2 + variable fonts, PNG/WebP out; WASM 3.7 MB raw / 1.5 MB gz; `next/og`-compatible | https://github.com/kane50613/takumi ; https://takumi.kane.tw/docs/comparison-to-satori | 2026-09-15 | High (perf claims = vendor) |
| Critter scripts run unmodified in Node on `@napi-rs/canvas` 1.0.9 with pixel parity to Chromium | design-analysis-260926-1143-critter-render-engine-report.md | 2026-09-26 | High (measured) |
| WhatsApp previews: `<head>` in first 300 KB; image ≥300 px wide, ≤4:1, <600 KB | https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews | accessed 2026-09-26 | High |
| Firebase Dynamic Links shut down 2025-08-25 | https://firebase.google.com/support/dynamic-links-faq ; Airbridge blog | 2025-08-25 | High |
| `detectPatterns` (iOS 15+) does not trigger the paste alert; `detectValues` does | https://developer.apple.com/documentation/uikit/uipasteboard/detectpatterns(for:completionhandler:)-23vwn | accessed 2026-09-26 | High |
| UIPasteControl (iOS 16+) pastes without a user prompt | https://developer.apple.com/documentation/uikit/uipastecontrol | accessed 2026-09-26 | High |
| expo-clipboard provides `ClipboardPasteButton` (UIPasteControl, iOS 16+); docs at SDK 57 | https://docs.expo.dev/versions/latest/sdk/clipboard/ | accessed 2026-09-26 | High |
| Play Install Referrer 2.2: referrer URL + click/install timestamps; available 90 days; Play installs only | https://developer.android.com/google/play/installreferrer/library | accessed 2026-09-26 | High |
| Android 15+ Dynamic App Links via `dynamic_app_link_components` (needs Play services) | https://developer.android.com/training/app-links/configure-assetlinks | updated 2026-09-16 | High |
| App Clip: 100 MB only for iOS 17+ digital-only invocation; 15 MB for iOS 16+ (QR/NFC/App Clip Code) | https://developer.apple.com/help/app-store-connect/reference/app-uploads/maximum-build-file-sizes | accessed 2026-09-26 | High |
| Branch NativeLink = clipboard-based iOS deferral, "not deterministic", premium plan | https://help.branch.io/developer-hub/docs/nativelink-deferred-deep-linking | updated 2026-08-24 | High |
| Branch plans Basics/Essentials/Enterprise, no public prices | https://www.branch.io/pricing/ | accessed 2026-09-26 | High |
| AppsFlyer Zero: 12k conversions, no deferred DL; Growth $0.07/conversion | https://www.appsflyer.com/pricing/ ; https://www.appsflyer.com/pricing/deep-linking/ | accessed 2026-09-26 | High |
| Airbridge DeepLink Plan free below 10K MAU, includes deferred DL | https://www.airbridge.io/en/blog/enterprise-budget-for-deep-linking | 2026-02-23 (upd. 03-29) | Medium (vendor blog) |
| Adjust Base free ≤1,500 attributions/mo for up to 12 months | web-search snippet (G2/aggregators); adjust.com returned 429 | – | Low |
| ChottuLink free 25K MAU; $39/150K; $99/500K | https://chottulink.com/blog/firebase-dynamic-links-shut-down-5-best-alternatives-for-2026/ | 2026-08-17 | Medium (self-published) |
| Apple: fingerprinting not allowed regardless of ATT consent; required-reason APIs enforced since 2024-05-01 | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api | accessed 2026-09-26 | High |
| Apple DPLA §3.3.1(B): interpreted code may be downloaded if it doesn't change primary purpose, bypass OS security, or create a storefront | https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ | accessed 2026-09-26 | High |
| App Review 2.5.2 (no downloaded code changing features); 5.1.1(v) in-app deletion; 5.1.1(viii); 5.1.2(i) third-party AI disclosure/consent; 5.1.2(v) contacts outreach; 5.1.5 location; guidelines last updated 2026-06-08 | https://developer.apple.com/app-store/review/guidelines/ | 2026-06-08 | High |
| Google Play: no self-update outside Play; exception for code in a VM/interpreter (e.g., JS in webview) | https://support.google.com/googleplay/android-developer/answer/16559646 | accessed 2026-09-26 | High |
| Apple account deletion: non-immediate allowed if timeline stated; SIWA token revocation; subscription notice | https://developer.apple.com/support/offering-account-deletion-in-your-app/ | accessed 2026-09-26 | High |
| Google Play: in-app deletion path + web deletion link + Data safety answers | https://support.google.com/googleplay/android-developer/answer/13327111 | accessed 2026-09-26 | High |
| PostHog free: 1M events, 5K recordings, 1M flag req, 100K exceptions, 1,500 surveys, 100K AI events, 10 GB logs | https://posthog.com/pricing | accessed 2026-09-26 | High |
| PostHog per-event $0.00005 (1–2M), $0.0000343 (2–15M); mobile replay 2× web | flexprice.io / userorbit.com guides (secondary) | 2026 | Medium |
| PostHog mobile replay GA (RN screenshot mode); EU Cloud Frankfurt; DPA; cookieless | https://posthog.com/docs/session-replay/mobile ; https://posthog.com/docs/privacy/gdpr-compliance | accessed 2026-09-26 | High |
| Amplitude free 2M events, 10K replays, unlimited flags | https://amplitude.com/pricing | accessed 2026-09-26 | High |
| Mixpanel free 1M events, 10K replays, 10 flags | https://mixpanel.com/pricing/ | accessed 2026-09-26 | High |
| Statsig: OpenAI acquisition 2025-09-02; brand/customers to Amplitude 2026-05-05 | https://www.convert.com/blog/a-b-testing/statsig-moves-to-amplitude/ ; https://www.statsig.com/blog/openai-acquisition | 2026-05-06 | Medium-High |
| Sentry Developer free (1 user, 5k errors, 5M spans); Team $26; Business $80 | https://sentry.io/pricing/ | accessed 2026-09-26 | High |
| Sentry Snapshots beta for all users | https://blog.sentry.io/snapshots-available-beta/ | 2026-06-11 | High |
| Crashlytics docs list iOS/Android/Flutter/Unity (no official RN) | https://firebase.google.com/docs/crashlytics | upd. 2026-09-24 | High |
| RevenueCat Pro: free to $2,500 MTR then 1%; Experiments/Paywalls/Targeting included | https://www.revenuecat.com/pricing/ | accessed 2026-09-26 | High |
| Superwall: free to $10k/mo paywall-attributed revenue, then 1% | https://superwall.com/pricing | accessed 2026-09-26 | High |
| EAS: Starter $19 (+$45 credit), Production $199 (+$225); iOS build $2/$4, Android $1/$2; Update MAU 1k/3k/50k; Starter overage $0.005/MAU | https://expo.dev/pricing | accessed 2026-09-26 | High |
| EAS Workflows `maestro` job on simulator/emulator builds | https://docs.expo.dev/eas/workflows/examples/e2e-tests/ | modified 2026-07-22 | High |
| EAS Update fingerprint runtime policy | https://docs.expo.dev/eas-update/runtime-versions/ | accessed 2026-09-26 | High |
| Codemagic 500 free M2 min; $0.095/min M2; CodePush $1/2,500 installs | https://codemagic.io/pricing/ | accessed 2026-09-26 | High |
| Xcode Cloud 25 compute h/mo with the membership; paid tiers from $49.99/100 h | https://developer.apple.com/news/?id=ik9z4ll6 (+ secondary for tiers) | 2023-12 / 2026 | Medium-High |
| GitHub Actions hosted price cut 2026-01-01 (Linux $0.006, macOS $0.062/min); self-hosted fee postponed | https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/ (+ secondary) | 2025-12-16 | Medium-High |
| fastlane 2.240.1 active | GitHub release | 2026-09-15 | High |
| Expo monorepos: pnpm/npm/yarn/bun; isolated installs SDK 54+; auto Metro SDK 52+; autolinking resolution SDK 55 | https://docs.expo.dev/guides/monorepos/ | accessed 2026-09-26 | High |
| Turborepo 2.11 (2026-09-18): Rust/Python/Go (experimental), faster startup, `devEngines.packageManager` | https://turborepo.dev/blog/2-11 | 2026-09-18 | High |
| Versions: pnpm 12.6.0 (12.0.0 2026-08-26), Nx 23.2.1, turbo 2.11.4, expo 57.0.25, eas-cli 24.8.0 | npm registry | 2026-09-26 | High |
| Maestro CLI 2.10.0 released 2026-08-31; `assertScreenshot` visual testing (2026-03-02); Cloud $250/device/mo | GitHub releases; https://maestro.dev/blog/visual-testing ; https://maestro.dev/pricing | 2026-08-31 | High |
| Detox 20.51.x, Appium 3.8.0 | npm / GitHub | 2026-09 | High |
| Promptfoo acquisition by OpenAI announced; stays open source | https://www.promptfoo.dev/blog/promptfoo-joining-openai/ ; https://openai.com/index/openai-to-acquire-promptfoo/ | 2026-03-09 | High |
| Langfuse joined ClickHouse; stays MIT/self-hostable | https://langfuse.com/blog/joining-clickhouse | 2026-01-16 | High |
| Lingui 6 (2026-04-22); RN via `@lingui/metro-transformer` | https://lingui.dev/ ; npm | 2026-04-22 | High |
| `Intl.MessageFormat` TC39 proposal stuck | https://github.com/tc39/proposal-intl-messageformat/issues/49 | accessed 2026-09-26 | Medium-High |
| Tolgee free 30k words/3 seats; Translate €58, Optimise €133, Manage €373 (annual); ICU via FormatIcu | https://tolgee.io/pricing ; https://docs.tolgee.io/js-sdk/formatting | accessed 2026-09-26 | High |
| Localazy free 200 keys; $29/1k, $89/3.5k, $199/10k keys; unlimited languages | https://localazy.com/pricing | accessed 2026-09-26 | High |
| Lokalise Explorer $149, Growth $379, Advanced $1,049 | https://lokalise.com/pricing | accessed 2026-09-26 | High |
| Crowdin Pro ~$50–59/mo for 60k hosted words | costbench.com / search snippet (conflicting) | 2026 | Low |
| Resend Free 3k/mo (100/day); Pro $20/50k, $35/100k; overage $0.90/1k | https://resend.com/pricing | accessed 2026-09-26 | High |
| Postmark Basic $15/10k ($1.80/1k), Pro $16.50 ($1.30/1k), Platform $18 ($1.20/1k); dev 100/mo free | https://postmarkapp.com/pricing | accessed 2026-09-26 | High |
| Twilio Verify $0.05/successful verification + channel fee (US SMS $0.0083) | https://www.twilio.com/en-us/verify/pricing | accessed 2026-09-26 | High |
| Prelude PAYG €0.032/verification; multi-channel; anti-fraud tiers | https://prelude.so/pricing | accessed 2026-09-26 | Medium (channel rates unclear) |
| Lob postcards: Developer $0.905, Startup ($260/mo) $0.645; international US-origin, 4×6 only, +5–7 business days, limited tracking | https://www.lob.com/pricing/print-mail ; https://help.lob.com/print-and-mail/building-a-mail-strategy/international-mail | accessed 2026-09-26 | High |
| PostGrid US 4×6 $0.902, CA $2.12; free Starter 500/mo; 245 countries; intl "from $0.82 + postage" | https://www.postgrid.com/pricing-print-mail/ (+ search snippet) | accessed 2026-09-26 | Medium-High |
| Stannp US postcards $0.94→$0.70 by volume, postage included | https://www.stannp.com/us/detailed-pricing | accessed 2026-09-26 | High |
| Prodigi classic postcard: UK-printed, stamped direct mail, from £0.40 | https://www.prodigi.com/products/cards-and-stationery/postcards/classic-postcards/ | accessed 2026-09-26 | High |
| USPS international postcard $1.70 → $1.75 effective 2026-07-12 | https://about.usps.com/newsroom/national-releases/2026/0409-usps-recommends-new-prices-for-july.pdf | 2026-04-09 | High (proposal; PRC-approved per secondary) |
| Apple age ratings 13+/16+/18+; answers required by 2026-01-31 | https://developer.apple.com/news/upcoming-requirements/?id=07242025a | 2025-07-24 | High |
| Texas SB 2420 enforceable after SCOTUS denied stays | https://www.infolawgroup.com/insights/2026/7/7/supreme-court-clears-the-way-texass-app-store-accountability-act-is-now-enforceable ; SCOTUSblog | 2026-07-06/07 | High |
| Utah ASAA delayed to 2027-05-06; Louisiana to 2027-07-01 | web-search snippets (Wiley / McDermott) | 2026 | Medium |
| Declared Age Range API (iOS 26) | https://developer.apple.com/documentation/declaredagerange | accessed 2026-09-26 | High |
| Play Age Signals returns Texas signals for accounts after 2026-05-28; global by end-2026 | https://developer.android.com/google/play/age-signals/overview (+ secondary) | 2026 | Medium |
| EU AI Act Art. 50 applies 2026-08-02; disclose AI from first interaction; "obvious" exception narrow | https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act | accessed 2026-09-26 | High |
| CCPA regs effective 2026-01-01 (risk assessments; ADMT from 2027-01-01) | White & Case / FMG summaries | 2025-10 / 2026 | Medium-High |
| OTel JS: traces & metrics stable, logs development; browser experimental | https://opentelemetry.io/docs/languages/js/ | accessed 2026-09-26 | High |
| Grafana Cloud free: 10k series, 50 GB logs, 50 GB traces, 14 d; Pro $19 | https://grafana.com/pricing/ | accessed 2026-09-26 | High |
| Axiom free 500 GB/mo ingest, 30 d; Cloud $25/mo incl. 1 TB | https://axiom.co/pricing | accessed 2026-09-26 | High |
| `@expo/app-integrity` (App Attest + Play Integrity) is alpha | https://docs.expo.dev/versions/latest/sdk/app-integrity/ | accessed 2026-09-26 | High |
| Sanity free 20 seats/10k docs; Growth $15/seat | https://www.sanity.io/pricing | accessed 2026-09-26 | High |
| Payload joined Figma; Payload Cloud paused new projects | https://www.figma.com/blog/payload-joins-figma/ (+ secondary) | 2025-06-17 | Medium-High |

---

## 11. Unresolved questions
1. Mobile framework final pick (RN/Expo assumed). If Flutter or native, §7 swaps apply.
2. Auth provider (backend report): does it support BYO SMS provider hooks and WhatsApp OTP? This decides Twilio vs Prelude integration effort.
3. Is paid UA planned in the first 6–12 months? This decides MMP/ATT now or later.
4. Exact Airbridge pricing above 10K MAU and its RN/Expo config-plugin support; Adjust Base terms (the site returned 429).
5. Does EAS Build's image support pnpm 12? Is the EAS Update overage rate on the Production plan the same as Starter's $0.005/MAU?
6. PostHog per-unit rates beyond the free tier (secondary sources only); mobile replay free allotment.
7. Localazy ICU MessageFormat support (docs 404); Keystatic localisation support.
8. Royal Mail / Stannp / Prodigi international postage for SEA/US destinations; PostGrid real SEA delivery path (local print vs US-origin).
9. Can `@napi-rs/canvas` render Archivo's variable `wdth` axis for a Node-side full-card fallback?
10. Apple AASA CDN propagation time in 2026 (not verified).
11. Sentry Snapshots pricing after beta.
12. Whether a cookieless PostHog web setup removes the need for a consent banner in each launch market (legal).
13. Consent requirements for printing photos of crew members on physical postcards (legal).
14. Human translation budget per locale (rates not researched).
