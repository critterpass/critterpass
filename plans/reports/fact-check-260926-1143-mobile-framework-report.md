# Fact-check — Mobile Client Framework Report

Target: `plans/reports/researcher-260926-1143-mobile-framework-report.md` · Checked 2026-09-26 · Method: primary sources (npm registry `npm view`, GitHub API/raw, pub.dev API, Apple doc JSON endpoints, Apple Guidelines/DPLA HTML, Expo changelog `.md`, Android/Flutter/SWM docs). Secondary sources flagged. Research report not edited.

## Verdict summary

- 39 load-bearing claim rows checked (some bundle related sub-claims): **31 confirmed**, **2 refuted** (#5, #30), **3 outdated** (#12, #19, #21), **3 uncertain** (#14, #27, #38).
- **The recommendation (Expo SDK 58 + RN Skia + Reanimated + hand-written Swift extensions) still holds.** No finding is RN-specific enough to flip the ranking. The main RN-specific hit is **apple-targets lagging Expo SDKs**: C3 drops ~4 → ~3.5, weighted ≈4.33 vs Flutter 3.65.
- Must-fix items for the plan:
  1. Reanimated 4.7/Worklets 0.13 is **required** (not optional) on RN 0.88.
  2. The toolchain is **Xcode 27 / iOS 27 SDK** (UIScene is mandatory), not "Xcode 26.4+".
  3. apple-targets 5.0.0 is the **SDK 55-line** release. SDK 57 support is an unmerged 6.0.0 PR, and SDK 58 is unaddressed.
  4. The Android Live Updates mapping is largely **ineligible** under Google's use-case policy.
  5. Adaptive layout (iOS 27 resizable apps, iPhone Duo, Android sw600dp) is missing entirely.

## Claims table

| # | Claim (report §) | Verdict | Correction / nuance | Source |
|---|---|---|---|---|
| 1 | SDK 58 beta 2026-09-15, RN 0.88 RC, GA 3–4 wks later (TL;DR, §5.1) | confirmed | GA is gated on the **RN 0.88 stable** release ("release SDK 58 shortly after"). npm `react-native@next` is now 0.88.0-rc.2 (2026-09-21) | expo.dev/changelog/sdk-58-beta ; `npm view react-native` |
| 2 | SDK 58: expo-widgets Android (dedicated Hermes), native tabs stable, libSQL removed, R8 default, `scanDocumentAsync`, Expo Modules 2.0 (§5.1) | confirmed | Expo Modules 2.0 is **beta** in SDK 58. SDK 58 also ships `expo-app-intents` (alpha) and SPM groundwork (CocoaPods still default) | expo.dev/changelog/sdk-58-beta.md |
| 3 | SDK 57 = RN 0.86/React 19.2; pins RN 0.86.3, React 19.2.3, Rea 4.5.1, Worklets 0.10.1, RNGH ~2.32.0, Skia 2.6.2 (§12) | confirmed | — | expo.dev/changelog/sdk-57 ; raw `sdk-57/.../bundledNativeModules.json` |
| 4 | SDK 58 branch pins RN 0.88.0-rc.1, React 19.3.0, Rea 4.6.0, Worklets 0.12.2, RNGH ~3.2.1, Skia 2.11.2 (§5.2) | confirmed | Pins are accurate as of today. The expo `sdk-58` branch package.json reads 58.0.0-preview.5, while npm `next` = preview.7 | raw `sdk-58/.../bundledNativeModules.json` |
| 5 | "Take Reanimated 4.7 if Expo GA pins it" (§5.2) | **refuted** | The SWM compat table says **Rea 4.6.x does NOT support RN 0.88**, and 4.7.x (RN 0.86–0.88) pairs with Worklets 0.13.x. On RN 0.88, Rea 4.7/Worklets 0.13 is **mandatory**, so plan on it | docs.swmansion.com/react-native-reanimated/docs/guides/compatibility |
| 6 | npm latest: expo 57.0.25, RN 0.87.1, Rea 4.7.0, Worklets 0.13.0, RNGH 3.3.0, Skia 2.13.0, apple-targets 5.0.0, VisionCamera 5.2.3, maplibre-rn 11.4.0 (§12) | confirmed | Also checked: teleport 1.2.2, @napi-rs/canvas 1.0.9, purchases 10.10.2, audio-api 0.13.6, drizzle 0.45.3 (1.0.0-rc.5 on `rc` tag) | `npm view <pkg> dist-tags` |
| 7 | Reanimated 4.7.0 (2026-09-18): SET experimental behind `ENABLE_SHARED_ELEMENT_TRANSITIONS`; RN 0.86–0.88 (§4.2) | confirmed | Release notes say the fixes bring SET "closer to a stable release". No ETA | GitHub release 4.7.0 ; npm time |
| 8 | Rea perf: ≤100 animated comps low-end Android / ≤500 iOS; flags; 120 fps default since RN 0.82 (§4.2) | confirmed | — | docs.swmansion.com/.../guides/performance |
| 9 | RNGH 3.0.0 stable 2026-05-28 (§5.1) | confirmed | 3.3.0 on 2026-09-11 | npm time |
| 10 | Expo Router zoom transition: alpha, iOS 18+ only, SDK 55+, ~1 s delay (§4.2, §11) | confirmed | Also: Stack only, not with header nav bars, single child. Android is unsupported | docs.expo.dev/router/advanced/zoom-transition |
| 11 | expo-widgets: isolated JS runtime; only `@expo/ui/swift-ui`; no hooks/async/imports; iOS-only in SDK 57; buttons iOS 17+; `widgetsDirectory` (§4.3) | confirmed | SDK 58 adds Android, LA `staleDate` and stable ActivityKit IDs. Whether EAS Update can update the widget bundle is still undocumented | docs.expo.dev/versions/latest/sdk/widgets ; sdk-58-beta.md |
| 12 | **apple-targets 5.0.0 (peer expo ≥52) is the SDK 58 extension route; "pin 5.0.x"** (§5.2, §11) | **outdated** | Maintainer PR #210 (2026-09-25, open) says 5.0.0 is "the version published for the **SDK 55 line**" and moves to **6.0.0, peer `expo >=57`**. Main last changed 2026-07-17. There is no SDK 58 / Xcode 27 / UIScene validation. Open bugs: incremental-prebuild crash (#201), duplicate app-intent targets (#202). README says SDK 53+, and only the widget target is tested end-to-end. EvanBacon made 388 commits vs ≤8 for the next contributor | GitHub API `EvanBacon/expo-apple-targets` (PR #210, issues, contributors) ; README |
| 13 | Expo inline modules experimental (SDK 56+), `xcodeProjectTargets` adds them to extra targets (§5.2) | confirmed | — | docs.expo.dev/modules/inline-modules-reference |
| 14 | Chrome Canvas2D is Skia, so Skia device pixels "should match" (TL;DR, §4.1) | uncertain | The premise is confirmed (skia.org: "graphics engine for Google Chrome and ChromeOS, Android, Flutter"). The parity inference is unproven (GPU vs CPU raster, AA defaults, and RN Skia 2.11.2 fixed "paint AA default"). Keep the S1 golden-diff gate | skia.org ; Shopify/react-native-skia releases |
| 15 | RN Skia 2.11 = Skia m152; 2.12 SPM; 2.13 on 2026-09-24 (§5.2) | confirmed | 2.13.0 **removes legacy-arch support**, which is harmless because the plan is New-Arch only | GitHub releases ; npm time |
| 16 | RN Skia web: CanvasKit 2.9 MB gz; 16 WebGL contexts/page (§4.8) | confirmed | — | shopify.github.io/react-native-skia/docs/getting-started/web |
| 17 | VisionCamera v5 = Nitro rewrite, modular, Skia plugin (5.0.0 on 2026-04-16) (§4.4) | confirmed | — | margelo.com/blog/whats-new-in-visioncamera-v5 ; npm time |
| 18 | RN 0.84 Hermes V1 default + legacy arch removed; 0.85 New Animation Backend experimental opt-in (§4.2, §5.1) | confirmed | Nuance: 0.84 excludes legacy code from iOS builds **by default**, and the interop layer remains. The Animation Backend needs 0.85.1+ on the experimental channel | reactnative.dev/blog/2026/02/11/react-native-0.84 ; .../2026/04/07/react-native-0.85 |
| 19 | Toolchain: "Xcode 26.4+ (SDK 56+ minimum)" (§5.2) | **outdated** | It is right for SDK 56/57 (docs table: iOS 16.4+, Xcode 26.4+). SDK 58 is "built for iOS 27", and iOS 27 SDK apps **must use the UIScene lifecycle** (prebuild now generates SceneDelegate.swift). Xcode 27 replaces Simulator with Device Hub. Plan on **Xcode 27**. Custom AppDelegate code and extension targets need the scene migration | sdk-58-beta.md ; docs.expo.dev/versions/latest |
| 20 | SDK 56: Hermes V1 default, Expo UI stable, expo-widgets iOS stable, min iOS 16.4, ~40% faster Android cold start, diffs 58% smaller (§4.7, §4.10) | confirmed | Vendor numbers | expo.dev/changelog/sdk-56 |
| 21 | "Expo keeps 3 SDKs/yr, each ~1 yr support" (§4.7, §11) | **outdated** | About 1-year support is confirmed. The cadence is not: 2026 had SDK 55 (Feb 25), 56 (May 20), 57 (Jun 30) and 58 (~Oct), so **4/yr**. SDK 57 says Expo is "exploring" more frequent optional non-breaking SDKs. Expect a larger upgrade tax and third-party lag (see #12) | npm `expo` time ; expo.dev/changelog/sdk-57 |
| 22 | Hermes V1 memory regression with worklets fixed in expo@57.0.9 (§11) | confirmed | A separate dev-only startup regression was fixed in 57.0.17 (RN 0.86.3) | sdk-57.md "Known regressions" |
| 23 | expo-maps alpha; expo-haptics presets only (§4.4) | confirmed | The haptics docs recommend the **Pulsar haptics SDK** for custom patterns, which is an alternative to a hand-written AHAP module | docs.expo.dev/.../maps ; .../haptics |
| 24 | Flutter 3.47.5/Dart 3.13.4 (2026-09-18); Impeller only engine on iOS, default Android API 29+ with OpenGL fallback; Flutter web unsuitable for text-rich/SEO sites (§5.4, §4.8) | confirmed | Flutter docs point to Jaspr/HTML for SEO sites. Package versions also confirmed on pub.dev: home_widget 0.10.0, live_activities 2.6.0, drift 2.35.0, riverpod 3.4.3, go_router 18.0.1 | flutter releases_macos.json ; docs.flutter.dev/perf/impeller ; docs.flutter.dev/platform-integration/web/faq ; pub.dev API |
| 25 | Live Activities: 8 h active + ≤4 h lock screen (12 h max); 4 KB static+dynamic; images ≤ presentation size; animation modifiers ignored; push-to-start 17.2; broadcast channels iOS 18; broadcast cannot start an LA (§4.3, §7) | confirmed | Nuances: on iOS 18 a push-to-start payload can carry `input-push-channel` (start + subscribe). The broadcast capability is enabled only in the Push Notifications Console, not Xcode. Priority-10 pushes count toward an hourly budget, while priority 5 does not. Height over 160 pt is truncated | Apple doc JSON: activitykit/displaying-live-data… ; …/starting-and-updating…push-notifications |
| 26 | AlarmKit iOS 26+: overrides Focus + silent; `NSAlarmKitUsageDescription` required; widget extension expected for countdown (§4.3) | confirmed | "Otherwise, the system may unexpectedly dismiss alarms and fail to alert" | Apple doc JSON: alarmkit (introducedAt 26.0) ; alarmkit/scheduling-an-alarm-with-alarmkit |
| 27 | Communication notifications (INSendMessageIntent in NSE, avatar, can break Focus) usable for the **guide persona as sender** (§4.3, 5b) | uncertain | The mechanism is confirmed. But Apple frames it as "direct communications" between people, Focus breakthrough needs Focus-status authorization plus an explicit sender choice, and the doc restricts it to that case. An AI persona as the sender is not validated against App Review/HIG. Crewmate messages are fine | Apple doc JSON: usernotifications/implementing-communication-notifications |
| 28 | App Review 2.5.2 (last updated 2026-06-08) + DPLA §3.3.1(B) permits interpreted code that does not change the primary purpose (§4.7) | confirmed | **DPLA now verified from Apple's primary text**: (a) no change of primary purpose, (b) no bypass of signing/sandbox, (c) no storefront. This resolves report Unresolved #4 | developer.apple.com/app-store/review/guidelines ; developer.apple.com/support/terms/apple-developer-program-license-agreement |
| 29 | Android Live Updates: Android 16+, Standard/BigText/Call/Progress/Metric, `POST_PROMOTED_NOTIFICATIONS`, `setRequestPromotedOngoing`, no custom RemoteViews (§4.3) | confirmed | Also required: ongoing, `contentTitle`, not colorized, not a group summary, channel ≠ IMPORTANCE_MIN. OEMs may add criteria | developer.android.com/develop/ui/views/notifications/live-update |
| 30 | "Only chat/ads disallowed"; 5a LA equivalents map to Android Live Updates, "critter nearby" merely *may* not qualify (§4.3, §11) | **refuted** (understated) | The disallowed list also covers **alerts, upcoming calendar events, quick access, ambient info, and activities initiated by other parties**. So **crew converging** (other parties), **storm warning** (alert), **leave-by** (upcoming event) and likely **critter nearby** (ambient) are ineligible. Only user-initiated active tracking fits (e.g. the ride in 3h, maybe the flight-day pickup). Plan standard ongoing/heads-up notifications and Glance instead | same as #29 |
| 31 | Widget extension ~30 MB jetsam ceiling (not in official docs) (§4.3) | confirmed (unofficial) | Multiple Apple forum threads (`limit=30 MB`) plus FB8832751. Still no Apple doc, so treat it as empirical | developer.apple.com/forums/thread/713561 ; feedback-assistant/reports#177 |
| 32 | Glance 1.2.0 stable 2026-08-26; target API 36/37 (§4.3, §5.2) | confirmed | Play: new apps and updates **must target API 36 from 2026-08-31** (extension to 2026-11-01). Android 17 (API 37) was released 2026-06-16 (secondary) | developer.android.com/jetpack/androidx/releases/glance ; Play target-API help (via search) ; Wikipedia Android_17 |
| 33 | EAS: Free/Starter $19/Production $199; 50k MAU incl.; $0.005/MAU 50k–200k; iOS medium $2, Android $1; so 100k MAU ≈ $449 (§9) | confirmed | Math checks out ($199 + 50k × $0.005). Omitted from the model: bandwidth, where Production includes 1 TiB and then **$0.10/GiB** (asset-heavy OTA) | expo.dev/pricing |
| 34 | Shorebird Pro $20 (50k), Business $400 (1M), $1/2,500 overage (§9) | confirmed | — | shorebird.dev/pricing |
| 35 | iOS 26 on 79% of iPhones (2026-06-07); iOS 27 released 2026-09-14 (§10, §5.2) | confirmed | Secondary (MacRumors, 9to5Mac, AppleInsider). iOS 27 supports the same devices as iOS 26 | macrumors.com/2026/06/09/… ; 9to5mac.com/2026/09/09/… |
| 36 | Kotlin Swift export Alpha; CMP iOS stable (1.8.0), CMP 1.12.x (§3, §12) | confirmed | Swift export docs page modified 2026-08-28 | kotlinlang.org/docs/native-swift-export.html ; blog.jetbrains.com CMP 1.12.0 |
| 37 | SO 2025 pro devs: TS 48.8%, Kotlin 11.5%, Dart 6.1%, Swift 5.7% (§4.9) | confirmed | — | survey.stackoverflow.co/2025/technology |
| 38 | State of RN 2025: 3,501 responses; Expo Router 71% (§4.9) | uncertain | The landing page did not expose these numbers (only "New Arch 80%"). Low weight | results.stateofreactnative.com |
| 39 | Lynx 4.1.0 (2026-09-07), 1,272 open issues; Skip free/OSS since v1.7 (Jan 2026); WatermelonDB last publish 2025-07-24 (§4.11, §4.5) | confirmed | — | GitHub API lynx-family/lynx ; skip.dev/blog/skip-is-free ; npm time |

(Rows 6, 24, 25, 33 and 39 bundle closely related sub-claims. The verdict counts treat each numbered row as one claim.)

## Important omissions

1. **iOS 27 makes iPhone apps resizable, and iPhone Duo ships soon.** The iOS 27 SDK *requires* the UIScene lifecycle. Per the Expo SDK 58 notes, `requireFullScreen` no longer opts out and `ScreenOrientation.lockAsync` may have no effect. iPhone Duo (foldable, 7.6" inner / 5.4" outer) goes on preorder 2026-10-16 and ships 2026-10-23, and Expo promises day-one support once the SDK lands. The design is fixed at 390×844 portrait, so the plan needs adaptive layouts, resize-aware Skia canvases and an iPad/Duo layout policy. This applies to every framework. Sources: sdk-58-beta.md; apple.com/newsroom/2026/09/apple-unveils-iphone-duo (via search).
2. **Android large-screen resizability.** Targeting API 36 (now mandatory on Play) ignores `screenOrientation`/`resizeableActivity`/aspect limits on sw ≥600dp; there is a temporary opt-out `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`. **API 37 removes the opt-out.** Foldables and tablets will render the phone design full-window. Source: developer.android.com/about/versions/17/changes/ff-restrictions-ignored.
3. **Liquid Glass is mandatory under the iOS 27 SDK** (secondary sources only). `UIDesignRequiresCompatibility` is reportedly ignored. Expo Router native tabs, `@expo/ui`, system sheets and alerts all get glass chrome, which may clash with the passport/brush-pen look. Decide between JS-drawn custom tab/nav chrome and accepting glass. Flutter is unaffected because it draws its own chrome. SDK 58 `expo-glass-effect` reports `isLiquidGlassAvailable = true` on iOS 27 builds.
4. **apple-targets fallback plan is missing.** The report's exit path, "bare workflow", is valid. Also consider:
   - (a) waiting for 6.x and verifying SDK 58/Xcode 27;
   - (b) forking, or writing an in-repo config plugin;
   - (c) Expo first-party routes: `expo-widgets` for simple widgets and LA plus **`expo-app-intents` (SDK 58, alpha)**. Its App Intent types must live in the **app target** because Apple's metadata extraction only reads the app target, which matters for the "I'M UP" `LiveActivityIntent` and vote intents.

   Add "apple-targets on SDK 58 + Xcode 27 + UIScene" as an explicit S4 pass criterion.
5. **Android alarm/full-screen policy** (answers report Unresolved #6; Play help and Android 14 behaviour pages, seen via search). On Android 14+, `USE_FULL_SCREEN_INTENT` is auto-granted only to apps whose *core* function is alarms or calls, and `USE_EXACT_ALARM` is restricted the same way. Critterpass qualifies for neither, so it needs user-granted `SCHEDULE_EXACT_ALARM` and a heads-up notification. "Rings through DND" on Android needs a user grant of DND/channel bypass. Budget for this in PO decision 3.
6. **Android background dwell while locked.** It needs a foreground service of type `location`, a Play FGS-type declaration and the Play background-location declaration with a demo video. The report covers only the iOS review. *Not verified this session (search budget exhausted).*
7. **RN 0.87 Strict TypeScript API is the default.** The deep-import opt-out is removed after 0.88, and `InteractionManager` and others were removed. This matters when vetting libraries such as FlashList, keyboard-controller and maplibre on 0.88.
8. **Pulsar haptics SDK** (recommended in the Expo docs) is an alternative to the custom Core Haptics module for the stamp thud.
9. **EAS bandwidth overage** ($0.10/GiB) and the Apple **April 2027 iOS 27 SDK submission deadline** (secondary) are missing from cost and timeline.

## Impact on recommendation

- **The ranking still holds.** Items 1–3 and 5–6 of the omissions hit every framework equally, and some hit native harder.
- RN-specific deltas:
  - apple-targets lag (C3 −0.5, so weighted ≈4.33);
  - mandatory Rea 4.7 on RN 0.88, which is a fix and not a risk;
  - the faster Expo cadence (C9/C7 upkeep).
- The Flutter gap stays above 0.6, and no §6 flip condition is triggered.
- Required plan edits:
  1. Pin Rea 4.7.x/Worklets 0.13.x.
  2. Use the Xcode 27 toolchain plus a UIScene check in S4.
  3. Add apple-targets SDK 58 validation or a fork to S4 and the risk table.
  4. Add an adaptive-layout workstream (iOS 27 resizable, iPhone Duo, Android sw600dp) to the spike (S9) and the plan.
  5. Rewrite the Android 5a mapping: Live Updates only for user-initiated tracking; the rest as standard notifications and Glance.
  6. Make a Liquid Glass/native-tabs decision.
  7. Record the Android alarm policy outcome.

## Unresolved questions

1. When will apple-targets 6.x ship, and will it support SDK 58, Xcode 27, UIScene and SPM? Or should we fork now?
2. When does RN 0.88 go stable? That date gates SDK 58 GA.
3. Is an AI-persona "sender" acceptable for communication notifications under App Review/HIG? No Apple statement was found.
4. The Liquid Glass opt-out removal in the iOS 27 SDK is backed by secondary sources only. It needs Apple release notes.
5. The Apple April 2027 iOS 27 SDK deadline is secondary only (Expo-adjacent issues and blogs).
6. iPhone Duo SDK: size classes and continuity behaviour. Expo says support will follow "as soon as the SDK is available".
7. Is the expo-widgets extension bundle updatable over EAS Update? It is still undocumented.
8. The Android FGS-location and Play background-location declaration details were not verified this session.
9. The State of RN 2025 figures (3,501 responses / Expo Router 71%) are unverified.
