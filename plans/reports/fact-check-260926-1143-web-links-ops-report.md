# Fact-check: web, deep links, growth, ops tooling report

Target: `plans/reports/researcher-260926-1143-web-links-ops-report.md` · Checked 2026-09-26 · Method: npm registry, GitHub API, and vendor/platform primary pages (Apple doc JSON, Android/Play docs, EC FAQ, pricing pages). The WebSearch budget was exhausted, so only WebFetch and curl were used. Where no primary page could be reached, the verdict is "uncertain".

## Verdict summary
- 45 claims checked:
  - 41 confirmed; 4 of these have a sub-part that stays uncertain (#8, #16, #38, #41).
  - 1 outdated: Airbridge's free DeepLink Plan (#18).
  - 1 partly refuted: PostGrid's international/EU claims (#44).
  - 2 uncertain: PostHog cost at 100k MAU (#22), Utah/Louisiana delay dates (#37).
- **The recommendation still holds.** None of the 21 TL;DR picks changes. Four adjustments:
  1. Drop "Airbridge free <10K MAU" as the insurance option.
  2. Re-model PostHog cost for identified events.
  3. Pin pnpm and Maestro on EAS images.
  4. Fix the PostGrid international wording.

## Claims table

| # | Claim (report §) | Verdict | Correction / note | Source |
|---|---|---|---|---|
| 1 | Astro latest 7.3.5; 7.0.0 released 2026-06-22; 6.0.0 2026-03-10 (§3.1) | confirmed | npm times: 7.3.5 2026-09-24, 7.0.0 2026-06-22, 6.0.0 2026-03-10. `@astrojs/cloudflare` 14.3.3, `@astrojs/mdx` 8.0.2, `@astrojs/react` 7.0.0 (released 2026-09-22) | registry.npmjs.org/astro |
| 2 | Cloudflare acquired Astro 2026-01-16; stays OSS and deployable elsewhere | confirmed | "Astro will remain open source… whether they host on Cloudflare or elsewhere". The npm `astro` license is MIT | cloudflare.com press release 2026 |
| 3 | Next.js 16.3 stable 2026-08-03; latest 16.3.6 | confirmed | 16.3.0 on 2026-08-03; 16.3.6 on 2026-09-22 | registry.npmjs.org/next |
| 4 | CF Workers: Free 100k req/day and 10 ms CPU; Paid $5 with 10M req and 30M CPU-ms; up to 5 min CPU; static assets free and unlimited | confirmed | Paid default CPU is 30 s, configurable up to 5 min. Overage $0.30/M req, $0.02/M CPU-ms. Page updated 2026-08-28 | developers.cloudflare.com/workers/platform/pricing |
| 5 | Workers 64 MiB bundle, 128 MB memory | confirmed | "64 MiB uncompressed… no compressed size limit". 128 MB includes WASM allocations. 1 s startup budget for global scope | developers.cloudflare.com/workers/platform/limits (upd. 2026-09-05) |
| 6 | R2 $0.015/GB-mo, zero egress | confirmed | Omitted from the cost model: Class A $4.50/M, Class B $0.36/M ops. Negligible at launch | Workers pricing page |
| 7 | Takumi 2.14: WASM on Workers, WOFF2 and variable fonts, PNG/WebP, `next/og`-compatible; WASM 3.7 MB raw / 1.5 MB gz; ~3k★, single maintainer | confirmed | 2.14.0 released 2026-09-15. Measured `takumi_wasm_bg.wasm` = 3.82 MB raw / 1.62 MB gz. 3,026★. Owner has 2,859 commits; next human contributor has 6, so the bus-factor risk is real. Licence MIT OR Apache-2.0 | takumi.kane.tw/docs/comparison-to-satori; GitHub README (fontVariationSettings); npm pack |
| 8 | Satori 0.33.5: no WOFF2, no calc, no z-index, no variable axes | confirmed (variable axes: uncertain) | README: "WOFF2 is not supported", "calc isn't supported", "no z-index". The README does not mention variable fonts either way | github.com/vercel/satori; npm |
| 9 | WhatsApp preview: `<head>` in first 300 KB; image <600 KB, ≥300 px wide, ≤4:1 | confirmed | Exact wording matches | developers.facebook.com/…/whatsapp/link-previews |
| 10 | `UIPasteboard.detectPatterns` (iOS 15+) raises no paste alert | confirmed | "the system doesn't notify the user about reading the contents". iOS 15.0+ | Apple doc JSON detectpatterns(for:completionhandler:) |
| 11 | UIPasteControl (iOS 16+) pastes without a prompt; expo-clipboard `ClipboardPasteButton` wraps it (SDK 57) | confirmed | expo-clipboard also has `hasUrlAsync()`. It probably misses URLs that were written as plain text, so a small `detectPatterns` module is still justified. Latest expo-clipboard is 57.0.2 | Apple UIPasteControl doc; docs.expo.dev/versions/latest/sdk/clipboard |
| 12 | Play Install Referrer 2.2: referrer URL, click/install timestamps, available 90 days | confirmed | "available for 90 days and won't change unless the application is reinstalled". The page does not state "Play installs only", but that is implicit | developer.android.com/google/play/installreferrer/library |
| 13 | Android 15+ Dynamic App Links via `dynamic_app_link_components` (needs Play services); doc updated 2026-09-16 | confirmed | Caveat: dynamic rules "cannot expand the scope" of the manifest. Every host and path (incl. `go.`) must be declared statically; dynamic rules can only narrow or exclude | developer.android.com/training/app-links/configure-assetlinks |
| 14 | App Clip limits: 100 MB only for iOS 17+ digital-only invocation; 15 MB for iOS 16+ with QR/NFC/App Clip Code | confirmed | Below iOS 16 the limit is 10 MB | developer.apple.com/help/app-store-connect/…/maximum-build-file-sizes |
| 15 | AASA fetched via Apple CDN; `?mode=developer`; same-domain taps don't fire UL | confirmed | "When a user browses your website in Safari and taps a universal link in the same domain, the system opens that link in Safari". Each subdomain "must serve its own apple-app-site-association file", so `go.critterpass.app` needs its own AASA and its own entitlement entry. CDN propagation time is still undocumented | Apple doc JSON: associated-domains entitlement; allowing-apps-and-websites-to-link |
| 16 | Branch NativeLink = clipboard deferral; Branch says it is "not deterministic"; premium plan | confirmed (quote: uncertain) | Mechanism and "requires a premium plan" confirmed; page updated 2026-08-24. The cited page does **not** contain "not deterministic". It also notes that on iOS 16+ the SDK's pasteboard check triggers the system paste prompt | help.branch.io/…/nativelink-deferred-deep-linking |
| 17 | AppsFlyer Zero: 12k conversions/yr, no deferred DL; Growth $0.07/conversion | confirmed (nuance) | The 12k is a **first-year** welcome package, not a recurring yearly allowance. Deferred DL is only in the Standard+ deep-linking tiers, which are custom-priced | appsflyer.com/pricing; /pricing/deep-linking |
| 18 | Airbridge DeepLink Plan free under 10K MAU, including deferred DL (runner-up #6, "insurance option" §4.2, cost table) | **outdated** | The claim appears only in a Feb/Mar-2026 blog post. The live pricing page lists only **Core $40+/mo** (30-day trial, 500K data points, then $0.0001/point; includes deferred DL, links and QR) and Growth (custom). `/en/deeplink-plan` redirects to the Core plan page. Treat the free tier as discontinued unless sales confirms it | airbridge.io/en/pricing (fetched 2026-09-26); airbridge.io/en/blog/enterprise-budget-for-deep-linking |
| 19 | Firebase Dynamic Links shut down 2025-08-25 | confirmed | Links now return 404 | firebase.google.com/support/dynamic-links-faq |
| 20 | Play Instant retired Dec 2025 | confirmed | "Starting December 2025, Instant Apps cannot be published… Instant APIs will no longer work" | developer.android.com/topic/google-play-instant |
| 21 | PostHog free tier: 1M events, 5K recordings, 1M flag requests, 1,500 surveys, 100K exceptions, 100K AI events, 10 GB logs; per-event $0.00005 (1–2M), $0.0000343 (2–15M); mobile replay 2× web | confirmed (now primary) | Docs pricing tiers match. Mobile replay has its own free allowance: 2,500 recordings/mo, $0.01 per recording falling to $0.003 (web is $0.005). Report's Q6 is resolved | posthog.com/pricing; posthog.com/docs/product-analytics/pricing; /docs/session-replay/pricing |
| 22 | PostHog ≈ $650/mo at 100k MAU (200 events/MAU) | uncertain (likely understated) | The flat-tier maths gives ≈ $643. But PostHog docs say "anonymous events can be up to 4× cheaper than identified ones", and the plan sends identified events after sign-in, which is most app traffic. Real cost may be materially higher. Re-price in PostHog's calculator with person profiles | posthog.com/docs/data/anonymous-vs-identified-events |
| 23 | PostHog mobile replay GA (RN screenshot mode); EU Cloud | confirmed | "generally available on Android, iOS, React Native, and Flutter". RN "always record[s] in screenshot mode", which is not configurable | posthog.com/docs/session-replay/mobile |
| 24 | Sentry: Developer free (5k errors, 5M spans, 50 replays, 1 user); Team $26; Business $80; UI profiling $0.25/h; `@sentry/react-native` 8.28 (2026-09-24); `@sentry/node` 11 | confirmed | Prices are billed annually. `@sentry/node` 11.0.0 is only 3 days old (2026-09-23); 10.x (10.75.3) is still maintained | sentry.io/pricing; npm |
| 25 | Statsig: OpenAI acquisition 2025-09-02; brand and customers to Amplitude 2026-05-05 | confirmed | Statsig blog note: "acquired by Amplitude on May 5, 2026… original team stayed at OpenAI" | statsig.com/blog/openai-acquisition; convert.com (2026-05-06) |
| 26 | EAS: Starter $19 (+$45 credit), Production $199 (+$225); iOS $2/$4, Android $1/$2 per build; Update 1k/3k/50k MAU; Starter overage $0.005/MAU; Production overage unverified | confirmed | Production overage is the same tier ladder: $0.005 falling to $0.00085/MAU (resolves Q5b). Workflows minutes: Linux $0.018–0.035, macOS $0.075–0.150 | expo.dev/pricing |
| 27 | EAS Workflows `maestro` job; fingerprint runtime; staged rollouts; pnpm 12 on EAS unverified | confirmed + new fact | `type: maestro` job confirmed (doc modified 2026-07-22). Fingerprint policy and percentage rollouts confirmed. **The SDK-57 EAS images ship pnpm 11.9.0 and Maestro 2.6.1**, not pnpm 12 or Maestro 2.10. Pin with eas.json `pnpm: "12.x"` or `corepack: true` (resolves Q5a / risk row) | docs.expo.dev/build-reference/infrastructure; docs.expo.dev/eas/json; …/eas/workflows/examples/e2e-tests; …/eas-update/runtime-versions |
| 28 | GitHub Actions hosted price cut 2026-01-01: Linux $0.006, macOS $0.062/min; self-hosted fee postponed | confirmed | — | docs.github.com/…/actions-runner-pricing; github.blog changelog 2025-12-16 |
| 29 | Turborepo 2.11 (2026-09-18) with experimental Rust/Python/Go; pnpm 12 (12.0.0 on 2026-08-26); Expo monorepo support: isolated installs SDK 54+, auto Metro SDK 52+, autolinking resolution SDK 55 | confirmed | turbo 2.11.4, pnpm 12.6.0, expo 57.0.25, eas-cli 24.8.0 | turborepo.dev/blog/2-11; docs.expo.dev/guides/monorepos; npm |
| 30 | Maestro 2.10.0 (2026-08-31); `assertScreenshot` (2026-03-02) with `cropOn`/threshold; Cloud $250/device/mo | confirmed | `assertScreenshot` exists since CLI 2.2.0 (default threshold 95%), so EAS's bundled 2.6.1 already has it | GitHub releases API; maestro.dev/blog/visual-testing; maestro.dev/pricing |
| 31 | RevenueCat Pro free to $2.5k MTR, then 1%, Experiments included; Superwall free to $10k/mo paywall revenue, then 1% | confirmed | — | revenuecat.com/pricing; superwall.com/pricing |
| 32 | OTA rules: DPLA §3.3.1(B) interpreted-code conditions; App Review 2.5.2; Play Device & Network Abuse VM/interpreter exception | confirmed | The DPLA text matches (primary purpose, no bypass of signing/sandbox, no storefront). The Play exception is "code that runs in a virtual machine or an interpreter… (such as JavaScript in a webview or browser)" | Apple DPLA page; App Review Guidelines; support.google.com/…/16559646 |
| 33 | App Review Guidelines last updated 2026-06-08; 5.1.2(i) "including with third-party AI… explicit permission"; 5.1.1(v), 5.1.1(viii), 5.1.2(v), 5.1.5 | confirmed | All quoted texts match. Also confirmed: fingerprinting ban "regardless of whether a user gives your app permission to track", and required-reason APIs enforced from 2024-05-01. The DPLA also has §3.3.3(O) for the Declared Age Range API | developer.apple.com/app-store/review/guidelines; describing-use-of-required-reason-api |
| 34 | Account deletion: Play needs in-app path + web link + Data safety answers | confirmed | — | support.google.com/…/13327111 |
| 35 | `@expo/app-integrity` (App Attest + Play Integrity) is alpha | confirmed | "currently in alpha and will frequently experience breaking changes"; latest 57.0.2 | docs.expo.dev/versions/latest/sdk/app-integrity |
| 36 | Texas SB 2420 enforceable after SCOTUS denied stays on 2026-07-06 | confirmed (law-firm source) | The ruling covered only the stay; the merits challenges are ongoing | infolawgroup.com 2026-07-07 |
| 37 | Utah delayed to 2027-05-06; Louisiana to 2027-07-01 | uncertain | No primary source was reachable. The report's own source is search snippets | — |
| 38 | Play Age Signals returns Texas signals for accounts created after 2026-05-28; global by end-2026; Declared Age Range API (iOS 26) | confirmed / "global by end-2026" uncertain | The page (upd. 2026-07-20) also covers **Brazil since 2026-03-17**, and its ToS **forbid** use of the signals for "advertising, marketing, user profiling, or analytics". No global date appears. Declared Age Range is iOS 26.0+ | developer.android.com/google/play/age-signals/overview; Apple doc JSON declaredagerange |
| 39 | EU AI Act Art. 50 applies from 2026-08-02; inform "from the start of the first interaction"; "obvious" exception narrow | confirmed | Grace period to **2026-12-02** only for Art. 50(2) marking, for systems placed on the market before Aug 2026 | digital-strategy.ec.europa.eu FAQ |
| 40 | Resend Free 3k/mo (100/day); Pro $20/50k, $35/100k; overage $0.90/1k | confirmed | — | resend.com/pricing |
| 41 | Twilio Verify $0.05/success + US SMS $0.0083, with Fraud Guard; Prelude €0.032/verification PAYG | confirmed (Fraud Guard: uncertain) | Fraud Guard does not appear on the Verify pricing page. Prelude says "messages at cost, zero markup", so carrier fees are likely on top of €0.032. Basic anti-fraud is in PAYG; advanced anti-fraud needs Startup (€360/mo) | twilio.com/en-us/verify/pricing; prelude.so/pricing |
| 42 | Lingui 6 (ICU, PO, metro transformer); Tolgee Free 30k words/3 seats, €58/€133/€373 annual; Localazy $89 for 3.5k keys, unlimited languages | confirmed | Lingui 6.0.0 on 2026-04-22, latest 6.8.0. Localazy prices come from the FAQ ("Autopilot ($89/mo) to Business ($199/mo)"). ICU support is still not stated on the Localazy page (Q7 stays open) | lingui.dev; tolgee.io/pricing; localazy.com/pricing |
| 43 | Grafana Cloud free: 10k series, 50 GB logs, 50 GB traces, 14 d, 3 users; Pro $19. OTel JS: traces/metrics stable, logs development. Axiom 500 GB free, $25 incl. 1 TB | confirmed | — | grafana.com/pricing; opentelemetry.io/docs/languages/js; axiom.co/pricing |
| 44 | PostGrid: local print US/CA/UK/AU/**EU**; 245 countries; US 4×6 $0.902; CA $2.12; intl "from $0.82 + postage"; free Starter 500/mo | partly refuted | Confirmed: $0.902, $2.12, Starter 500/mo, "245+ countries". **Not found:** EU local print (the pricing page names US/CA/UK/AU only) and "from $0.82 + postage". The only $0.827 on the pricing page is a *B&W letter, standard class* price, and international rates are "contact sales". The international crew cost (~$15) is unverified | postgrid.com/pricing-print-mail; postgrid.com/international-mail |
| 45 | USPS international postcard $1.70 → $1.75 from 2026-07-12 | confirmed | USPS release of 2026-04-09 (PRC filing) | about.usps.com …/0409-usps-recommends-new-prices-for-july.pdf |

### Extra spot-checks (all confirmed unless noted)
- Vercel Hobby is "personal, non-commercial"; Pro $20/seat, 1 TB included.
- Netlify Pro $20 = 3,000 credits; 20 credits/GB; 15 credits per deploy.
- Railway: Hobby $5, Pro $20; ≈$20/vCPU-mo, ≈$10/GB-mo, $0.05/GB egress.
- Sanity Free 20 seats/10k docs; Growth $15/seat. Payload Cloud: "deployment of new projects is currently paused" (payloadcms.com/cloud-pricing). Figma blog dated 2025-06-17.
- Amplitude Free 2M events, 10K replays, unlimited flags, 1 experiment. Mixpanel Free 1M events, 10K replays, 10 flags, 1k MEU.
- Crashlytics lists Apple/Android/Flutter/Unity only (no RN).
- Codemagic 500 free M2 min, $0.095/min, CodePush $1/2,500 installs or $99/mo.
- Xcode Cloud 25 h/mo included. The "$49.99/100 h" tier is **not** on the cited page: uncertain.
- Lob Developer $0.905, Startup $0.645 ($260/mo). Stannp US $0.94→$0.70 incl. postage (plus a $0.82 tier at 1k–9,999). Postmark $15/$16.50/$18 per 10k.
- Versions confirmed on npm: posthog-react-native 4.78.0, posthog-node 5.54.1, resend 6.30.0, react-native-branch 7.0.0, react-native-appsflyer 7.0.2-v2, airbridge-react-native-sdk 4.10.0, react-native-adjust 5.8.0, react-native-chottulink-sdk 1.1.2, react-native-play-install-referrer 2.0.1, hot-updater 0.36.15, promptfoo 0.123.1 (MIT), detox 20.51.4, @keystatic/core 0.6.9 (2026-08-26), @napi-rs/canvas 1.0.9, vitest 5.0.2, jest-expo 57.0.5, RNTL 14.0.1, Playwright 1.63.0.
- Not verifiable: Adjust (429), Branch pricing (403), ChottuLink pricing page (404), CCPA regs (cppa.ca.gov refused connection).

## Important omissions
1. **Airbridge free tier is gone** (claim 18). The "(b) first-party + Airbridge insurance" PO option and the "$0 deep linking at 100k" cost-row footnote need updating. Real insurance options: Airbridge Core $40+/mo, Branch or AppsFlyer (custom price), or the App Clip.
2. **PostHog identified-event premium (up to 4×)** is not modelled, so the 100k-MAU estimate is optimistic. Mitigations: `person_profiles: 'identified_only'`, anonymous server-side events where there is no person join, and re-quoting with the calculator.
3. **EAS image toolchain lag.** SDK-57 images ship pnpm 11.9.0 and Maestro 2.6.1. Pin pnpm via eas.json `pnpm`/`corepack` and pin the Maestro CLI in workflows. Otherwise local runs and EAS runs diverge.
4. **Alternate UL host setup.** `go.critterpass.app` needs its own AASA, `applinks:go.critterpass.app` in the entitlement, and an Android manifest intent-filter host. Dynamic App Links cannot add hosts or paths that the manifest does not declare.
5. **Age-signal use restrictions and other jurisdictions.** The Play Age Signals ToS ban analytics/marketing use, so don't forward the signals to PostHog. Brazil ECA Digital signals have been live since 2026-03-17. California AB 1043 (Digital Age Assurance Act) is not mentioned; its effective date is 2027-01-01 per my prior knowledge, not verified here.
6. **EU AI Act Art. 50(2)** (machine-readable marking of synthetic audio/image/text) could apply if Critterpass counts as a *provider* of the guide's TTS voice or generated images, not only the Art. 50(1) chatbot disclosure. Grace to 2026-12-02 applies only to systems already on the market. Needs a legal read.
7. **Branch's iOS 16+ paste prompt** confirms why the first-party `UIPasteControl` design matters. The report could cite it as evidence for recommendation #6.
8. **Takumi bus factor is quantifiable.** About 88% of commits come from one maintainer. The Satori-compatible-template hedge is necessary, not optional.
9. **`@sentry/node` 11.0.0 is 3 days old.** Consider 10.x until 11.0.x patches land.
10. **AppsFlyer Zero's 12k conversions are first-year only.** After year 1 it is effectively pay-per-conversion.
11. **Missing costs:** R2 operation charges, Prelude/Twilio carrier fees, and PostGrid international postage. The postcard unit-economics warning still stands, and is probably worse for SEA.

## Does the recommendation still hold?
Yes. The core picks are verified on primary sources:
- Astro 7 on Cloudflare Workers.
- Build-time atlas plus Takumi OG.
- First-party deferred links (Install Referrer + `detectPatterns`/`UIPasteControl`).
- PostHog, Sentry, EAS + Maestro, pnpm + Turborepo, Lingui + Tolgee, Resend.
- The compliance checklist.

The one outdated claim (Airbridge free tier) only touches the optional insurance/runner-up path. The PostHog cost gap changes the budget, not the choice. PostHog stays the pick unless a re-quote exceeds the report's own ~$1–2k/mo flip threshold.

## Unresolved questions
1. Is the Airbridge free DeepLink plan still sold via sales, or is it discontinued? The pricing page no longer shows it.
2. What is PostHog's actual cost at 100k MAU with identified events? Needs a calculator run or a sales quote.
3. Utah (2027-05-06) and Louisiana (2027-07-01) delay dates; the Play Age Signals global rollout date; California AB 1043 obligations for developers.
4. PostGrid international: local print in the EU, and the real SEA per-card price.
5. Is Twilio Fraud Guard included in the Verify price? Prelude carrier cost by SEA country.
6. Does Art. 50(2) marking apply to Critterpass's own guide voice or images, i.e. is it a provider or only a deployer?
7. Xcode Cloud paid tier prices (not on the cited page).
8. Adjust Base free-tier terms (site returned 429).
