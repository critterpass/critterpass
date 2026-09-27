# Apple extension targets on Expo SDK 58 / Xcode 27 / UIScene

Date: 2026-09-27
Status: PASS on generate/build/sign-for-simulator and entitlements; INCOMPLETE on
device-signing, on-device memory and on-device intent-latency (no Apple ID/API-key session in
Xcode, no physical iPhone, `.p8` unrelated — see Founder follow-ups). Phase not done until those
are filled.

## Context

D3 needs a widget extension (static widget + Live Activity + AlarmKit presentation + App Intent
button), a Notification Service extension and a Notification Content extension, all signed and
embedded under Expo SDK 58 preview.7 / React Native 0.88 RC / Xcode 27 / iOS 27 SDK, sharing an
App Group and a Keychain access group with the host app (system-architecture.md §4.8;
api-contracts-async.md §3.1–§3.2, §6). The plan's default was "a fork of `@bacons/apple-targets`
as a git dependency; if it cannot sign/build … fall back to an in-repo config plugin" — written
against `plans/reports/fact-check-260926-1143-mobile-framework-report.md`, which found the
published package stuck on the SDK 55 line and the maintainer's own SDK 57 upgrade still an
unmerged draft.

## Criteria (phase-02 §Requirements, "Apple targets")

| # | Criterion | Result |
|---|---|---|
| 1 | `@bacons/apple-targets` fork or in-repo plugin generates targets and **signs** them on SDK 58 / Xcode 27 / UIScene | PASS for simulator (ad hoc "sign to run locally"); **INCOMPLETE for a real device/EAS-equivalent signature** — see Method/Findings |
| 2 | Widget ext: widget + Live Activity + AlarmKit UI + App Intent | PASS — all four compile and link in one target |
| 3 | Notification Service ext | PASS — builds, embeds, signs for simulator |
| 4 | Notification Content ext | PASS — builds, embeds, signs for simulator |
| 5 | App Group + shared Keychain group (host app + every extension) | PASS |
| 6 | Widget peak memory < 20 MB | **INCOMPLETE — device-only measurement, no device in this environment** |
| 7 | Intent round-trip < 2 s | **INCOMPLETE — device-only measurement, no device in this environment** |

## Method

- Toolchain established first, for real: Xcode 27.0 (27A266a) and the iOS 27.0 simulator runtime
  were present; CocoaPods was not (`pod: command not found`) — installed via
  `brew install cocoapods` (1.17.0, with its own Homebrew Ruby 4.0.7; system Ruby was 2.6.10,
  below CocoaPods' floor). A baseline `npx expo prebuild --platform ios` + `pod install` +
  `xcodebuild … -sdk iphonesimulator` with **no extension targets** built clean
  (`** BUILD SUCCEEDED **`) before touching anything else, so every later failure or pass could
  be attributed to the extensions, not the base toolchain.
- Re-checked the fork question empirically rather than trusting the six-month-old research
  report as final: `npm view @bacons/apple-targets dist-tags` still shows `latest: 5.0.0` (the
  SDK-55-line release); the maintainer's SDK 57 upgrade
  (`EvanBacon/expo-apple-targets` PR #210) is still an open **draft**, with the maintainer's own
  2026-09-26 comment reading "Still not merging: … xcodebuild shards need to go green," targeting
  Xcode **26.4** (not 27) with no UIScene mention. `@kingstinct/expo-apple-targets` (a name that
  looked like a maintained fork) turned out to be a same-source mirror last published 2025-01-02,
  not a real alternative. No maintained fork reaches SDK 58 / Xcode 27 / UIScene, so there is
  nothing safe to fork from without taking on de novo Xcode-project-generation maintenance — see
  Chosen path for what that means for this ADR's recommendation.
- Tried the currently-published `@bacons/apple-targets@5.0.0` **unmodified** anyway, since a
  config plugin's `xcodeproj`-editing code is often SDK-version-agnostic even when the package's
  own README/CI hasn't been validated past an older SDK. Added it as a `devDependency`, wired
  `apps/mobile/targets/{widgets,notification-service,notification-content,_shared}/**`
  (`expo-target.config.js` per target + real Swift, not placeholders — see Findings), registered
  `'@bacons/apple-targets'` in `app.config.ts`'s `plugins`, and added
  `ios.entitlements` (App Group + Keychain group) at the **app** level (the plugin does not
  propagate a target's entitlements up to the host app).
- Built with `xcrun xcodebuild -workspace CritterpassDev.xcworkspace -scheme <target-or-app>
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath … [flags]`
  (one target's scheme first, then the whole `CritterpassDev` scheme, which builds every
  embedded extension as a dependency). Verified real embedding with
  `find CritterpassDev.app/PlugIns -iname '*.appex'`, installed the built `.app` on a freshly
  created iOS 27.0 simulator (`iPhone 17 Pro`) with `xcrun simctl install|launch`, and confirmed
  the process stayed alive (`launchctl list`) rather than crash-looping.
- Attempted a **real device-style signed build** (`-sdk iphoneos -destination 'generic/platform=iOS'
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=YFND2EEW8S -allowProvisioningUpdates`) specifically
  to get real signing evidence beyond "simulator doesn't enforce provisioning" — see Findings for
  the exact, reproducible failure.
- `tools/spikes/apple-targets/verify-simulator-install.sh` is the rerunnable harness for the
  build → install → launch → screenshot steps; `tools/spikes/apple-targets/
  print-test-vector-signature.swift` and the AlarmKit/ActivityKit code are exercised together
  with T8/T9 (same targets, same App Group) rather than duplicated.

## Raw numbers / evidence

```
Baseline (no extensions):   xcodebuild … -sdk iphonesimulator            → ** BUILD SUCCEEDED **
CritterpassWidgets scheme:  widget + Live Activity + AlarmKit + AppIntent → ** BUILD SUCCEEDED **
CritterpassDev scheme:      app + all 3 extensions + cp-app-group module  → ** BUILD SUCCEEDED **
PlugIns/ in the installed .app:
  CritterpassWidgets.appex, CritterpassNotificationService.appex, CritterpassNotificationContent.appex
simctl install + launch:    app.critterpass.dev, PID assigned, alive after 2s (launchctl list)
```

Device-style signed build (`-sdk iphoneos`, automatic signing, team `YFND2EEW8S`):

```
error: No Accounts: Add a new account in Accounts settings. (target 'CritterpassWidgets')
error: Provisioning profile "iOS Team Provisioning Profile: *" doesn't include the App Groups capability.
error: Provisioning profile "iOS Team Provisioning Profile: *" doesn't support the group.app.critterpass App Group.
error: Provisioning profile "iOS Team Provisioning Profile: *" doesn't include the com.apple.security.application-groups entitlement.
** BUILD FAILED **
```

`security find-identity -v -p codesigning` in the login keychain:

```
1) … "Apple Development: Quoc Khanh (S8H6HTF3KK)"
2) … "Developer ID Application: Quoc Khanh (YFND2EEW8S)"
```

## Findings

1. **The currently-published, unmodified `@bacons/apple-targets@5.0.0` generates and builds all
   three target types under Expo SDK 58 preview.7 / Xcode 27 / iOS 27 SDK**, contradicting the
   pessimistic extrapolation from the maintainer's stalled SDK 57 draft. It uses Xcode 16+
   `PBXFileSystemSynchronizedRootGroup`s (one per target directory) instead of listing every file
   in the `.pbxproj`, which is why this kept working across an SDK the maintainer has not
   validated: the mechanism is a generic, mostly SDK-agnostic `xcodeproj`-editing operation, not
   something wired to Expo/RN internals that drift release to release. It also correctly
   auto-generates each target's `Info.plist` (`NSExtensionPointIdentifier` per type,
   `NSExtensionPrincipalClass` derived from the target name) the first time only
   (`if (!fs.existsSync(filePath))`) — hand-editing `apps/mobile/targets/notification-content/Info.plist`
   afterward (to set the real `cp.vote` category instead of the generated placeholder) is
   therefore safe and persists across `expo prebuild` reruns.
2. **`_shared/*.swift` is compiled into every extension target *and* the main app target** via a
   `PBXFileSystemSynchronizedBuildFileExceptionSet` the plugin adds to each target's root
   synchronized group — confirmed by the app-level entitlements being required for `_shared`'s
   `ActionsClient`/`KeychainActionKeyStore` (Security/CryptoKit) to compile into
   `CritterpassDev` itself, not only the extensions.
3. **Entitlements set inside a target's own `expo-target.config.js` never propagate to the host
   app.** The host app needed its own `ios.entitlements` (App Group + Keychain group) added in
   `app.config.ts` — a completely separate, standard Expo config path, not an apple-targets
   feature. Missing this produces no build error at all; it silently leaves
   `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)` returning `nil` at runtime
   for any code running in the app process (T8's `cp-app-group` module, `ImUpIntent`).
4. **AlarmKit's real API (iOS 26 SDK, verified against the installed `AlarmKit.swiftmodule`
   swiftinterface, not documentation) differs from the bundled Xcode "AlarmKit-SwiftUI-Integration"
   sample**: `AlarmPresentationState.Mode` is `case countdown(Countdown)` /
   `.paused(Paused)` / `.alert(Alert)` — enum cases **with associated values**, not the bare
   `.countdown` the sample compares with `==`; and `Countdown` carries
   `totalCountdownDuration`/`fireDate`/`startDate`, not the sample's `countdownEndDate`. Fixed by
   pattern-matching (`if case .countdown(let countdown) = context.state.mode`) and
   `Text(countdown.fireDate, style: .timer)`. Worth flagging because whoever writes the real
   `_shared/ActivityAttributes/*` for phase 48 will hit the same stale-sample trap.
5. **CocoaPods is not preinstalled even though Xcode is.** `npx expo run:ios`/prebuild's own
   pod-install step needs it; this is a one-time environment setup
   (`brew install cocoapods`), not a project-code finding, but worth recording since it silently
   blocks *both* candidate paths (fork or in-repo plugin) equally.
6. **The device-style signed build fails on account/provisioning, not on anything this phase
   controls**, and for two independent reasons: (a) Xcode has no Apple ID or App Store Connect
   API key registered ("No Accounts"), so automatic signing cannot mint a provisioning profile
   with the newly-added App Groups capability at all; (b) even the one static
   "Apple Development" certificate already in the keychain belongs to team `S8H6HTF3KK`, not
   `YFND2EEW8S` — the team `app.config.ts` configures and the one with a (distribution-only,
   not-usable-for-this) "Developer ID Application" cert. Both are accounts-and-portal state a
   spike agent cannot create; see Founder follow-ups for the exact fix.
7. `expo prebuild`'s default `Info.plist` for the main app already includes
   `UIApplicationSceneManifest` (`UIApplicationSupportsMultipleScenes: false`) with zero extra
   configuration — Expo SDK 58's template is UIScene-ready out of the box, so "UIScene lifecycle
   compatibility" was a non-issue once the toolchain itself worked.

## Verdict

**PASS** on generate/build/sign-for-simulator, all four widget-target features (static widget,
Live Activity, AlarmKit presentation, App Intent), the two notification extensions, and the
App Group/Keychain entitlement chain (host app + all three extensions). **INCOMPLETE** on the
three criteria that need real hardware or a real signing identity: a genuinely signed
(non-simulator) build, on-device widget peak memory, and on-device intent round-trip latency —
none of these can be produced honestly from this environment (phase-02's own "Device evidence"
rule: simulator numbers never count as memory/latency evidence).

## Chosen path

**The published `@bacons/apple-targets@5.0.0`, unmodified — no fork, no in-repo config plugin.**
This reverses the plan's stated default ("a fork … as a git dependency") on empirical grounds,
not on a re-read of the same research: the fact-check report's pessimism was about the
*maintainer's own* stalled SDK 57 draft, not about whether the *already-published* package's
generic `xcodeproj` editing still functions on a newer SDK, which this ADR measured directly and
found working end to end. Building or hosting an actual fork (patch the source, stand up a git
remote, pin a commit) was considered and rejected: no patch was needed, and creating a
persistent public fork of a third-party repository under the founder's GitHub identity is an
infra/ownership decision for the founder, not something a spike should do unprompted merely
because the plan named "fork" as the default without anticipating that the unforked package
would simply work. If a future Expo/RN/Xcode upgrade breaks this again, the documented fallback
(`apps/mobile/plugins/with-apple-targets.ts`, in-repo config plugin → bare workflow) is still the
right exit, in that order.

## Founder follow-ups

- **Add an Apple ID or an App Store Connect API key under Xcode → Settings → Accounts** (or pass
  `-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID` to `xcodebuild`) so
  automatic signing can register the App Groups capability and mint a provisioning profile for
  `app.critterpass.dev` and its three extensions. Without this, no device or EAS-equivalent
  signed build is possible regardless of which target-generation path is used.
- **Team ID mismatch**: the only "Apple Development" certificate in this machine's login keychain
  is issued for team `S8H6HTF3KK`; `app.config.ts` configures `appleTeamId: 'YFND2EEW8S'`, which
  currently only has a "Developer ID Application" (non-App-Store) certificate. Confirm which team
  should actually own `app.critterpass.*` and issue an Apple Development / Distribution
  certificate for that team.
- **Physical iPhone 13+ run** (phase-02 non-code dependency table): install the signed build,
  run the `xctrace` widget-memory template (to be added alongside T10's device scripts) and
  confirm the App Intent → Live Activity round trip is under 2 s.
- **EAS build**: once signing is fixed, a `development` profile EAS build is the natural way to
  distribute this to the founder's device without a local Mac in the loop; not run in this pass
  per the "prefer local simulator builds, no EAS without need" instruction, since it could not
  have signed successfully anyway.

## Rerun

```
brew install cocoapods   # one-time, if not already present
cd apps/mobile && npx expo prebuild --platform ios && cd ios && pod install
xcrun xcodebuild -workspace CritterpassDev.xcworkspace -scheme CritterpassDev \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/cp-apple-targets-derived CODE_SIGNING_ALLOWED=NO
tools/spikes/apple-targets/verify-simulator-install.sh <simulator-udid> \
  /tmp/cp-apple-targets-derived <screenshot-out.png>
rm -rf /tmp/cp-apple-targets-derived   # DerivedData is several GB; do not leave it around
```
