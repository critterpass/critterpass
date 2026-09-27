# App Clip: built now, offered behind `links.app_clip`

Date: 2026-09-28
Status: Decided (D15). Built and simulator-verified; store builds leave the clip out until the
founder registers its bundle ids (see Founder follow-ups).

## Context

D15 makes first-party deep links the launch path: Universal Links, the Play Install Referrer on
Android and, on iOS, the paste control plus the six-character code. iOS has no deterministic
install referrer, so the paste funnel is the weakest step. An App Clip is the deterministic
fallback: the invite link opens a small native experience, and the full app installed from it
receives the link through the shared App Group. Before launch there are no invite installs to
measure, so a "build it if the funnel underperforms" rule could never trip; the clip is built now
and switched on by a server flag when the numbers say so.

## Decision

- **Build it now, ship it dark.** `apps/mobile/targets/app-clip` is a native SwiftUI App Clip
  (`@bacons/apple-targets` type `clip`, no JavaScript bundle, about 2 MB). Opened from an invite
  (`/i/<code>[/<seat>]`, `/j/<code>`) or referral (`/r/<code>`) link on a CritterPass link host,
  it prints the crew ticket from `GET /v1/links/{code}/preview` and offers the full app through
  the App Store overlay. Any other link shows a plain "Get CritterPass" card. Digital invocation
  only (links, Safari, Messages); no App Clip Codes.
- **Handoff through the App Group.** On open, the clip writes
  `state/clip-link.json` (`{schema: 1, generated_at, url}`) to `group.app.critterpass`. At first
  launch the full app reads and clears it (`cp-deferred-link` `consumeClipLink`, under a week old
  only) before the paste check, and claims it with `claim_attribution {clip_url}`, which the api
  validates against the environment's link hosts and records as `install_attributions.via = clip`.
- **The flag.** `links.app_clip` is a typed, public `ops_config` key (default off). The api serves
  it at `GET /v1/links/settings` from `client_config`, so only an audience-`all` value counts. The
  web Worker reads it (cached 60 s, off on any api failure) and only while it is on:
  - adds `appclips.apps` (`<TeamID>.<app>.clip` for each app the host vouches for) to
    `/.well-known/apple-app-site-association`;
  - adds `app-clip-bundle-id=<app>.clip, app-clip-display=card` to the handoff page's
    `apple-itunes-app` Smart App Banner.
  With the flag off neither appears (unit tests in `apps/web/src/lib/links/handoff-model.test.ts`,
  Playwright in `apps/web/tests/links/`).
- **When to switch it on.** Compare iOS deferred-link success with Android's
  (the PostHog `install_attributed.via` split). Turn the flag on when
  iOS is below 60 % of Android, evaluated first on the TestFlight / Play beta cohort once each
  platform has at least 30 invite installs, and again after launch at 200.
- **Which builds embed it.** Development builds only for now (`APP_CLIP_VARIANTS` in
  `apps/mobile/app.config.ts`), bundle id `app.critterpass.dev.clip`. Staging and production
  builds leave the target out until `app.critterpass.staging.clip` and `app.critterpass.clip`
  exist in the developer portal with App Groups and Associated Domains, because a
  non-interactive EAS store build cannot register a new bundle id or provision it. Adding a
  variant to `APP_CLIP_VARIANTS` is the only code change needed then.

## Alternatives considered

- **React Native App Clip** (the `expo-app-clip` default, `exportJs: true`): reuses screens but
  ships Hermes and the JS bundle, far over what a ticket needs, and couples clip size to the app.
  Rejected for a single native screen.
- **Build only after the funnel fails:** could never trigger before launch (no installs to
  measure) and would put a native target, provisioning and App Review on the critical path at the
  moment the funnel is already losing people.
- **A Worker environment variable instead of an `ops_config` flag:** simpler, but flipping it
  would need a deploy; the ops console already audits and versions typed flags.

## Verification

- Host-side XCTests (`pnpm --filter @cp/mobile ios:test`): link parsing, preview decoding, ticket
  wording and the App Group handoff file; `cp-deferred-link` tests cover reading it back.
- Jest: `resolveOnFirstLaunch` claims a clip link as `via: clip` before any paste check; api
  resolver and database route tests cover `clip_url` and `GET /v1/links/settings`.
- Simulator: see the build notes in the pull request that introduced the clip (e2e-test build,
  clip launched with `_XCAppClipURL`, ticket rendered, full app consuming the handoff).

## Founder follow-ups

- Register `app.critterpass.staging.clip` (and later `app.critterpass.clip`) in the Apple
  developer portal with App Groups (`group.app.critterpass`) and Associated Domains, then add the
  variant to `APP_CLIP_VARIANTS` and run one staging build so EAS provisions it.
- In App Store Connect, set up the App Clip default experience (invocation URL on the link host,
  header image 1800×1200) once a build with the clip is uploaded.
- Flip `links.app_clip` in the ops console only when the gate above says so.
