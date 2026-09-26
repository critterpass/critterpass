# Critterpass — Mobile Client Framework Research

Date: 2026-09-26 · Scope: mobile client framework + exact library set · Inputs: `scratchpad/requirements-brief.txt`, `scratchpad/screens.json`, `design/*.js` renderer, sibling engine probe (`scratchpad/engine-probe/`), web research (all sources accessed 2026-09-26).

---

## TL;DR

- **Recommend: Expo (SDK 58, React Native 0.88, New Architecture only) + TypeScript.** Start on the SDK 58 beta now and pin to GA (Expo expects GA 3–4 weeks after the 2026-09-15 beta). Motion: Reanimated 4.7 + Worklets 0.13 + Gesture Handler 3.x. Critter renderer: **@shopify/react-native-skia 2.x**. Apple extensions: **hand-written Swift** targets via **@bacons/apple-targets 5.0** (one widget extension for widgets, Live Activities and the AlarmKit presentation, plus a Notification Service extension, a Notification Content extension and shared App Intents). Android: Kotlin Glance widgets and Live Updates through Expo inline modules or config plugins.
- **Why:** about 84% of the 140 KB critter renderer is pure geometry and data, and it runs **unchanged** in TypeScript. Only the ~8 KB Canvas2D painter gets a Skia adapter. Chrome's Canvas2D is itself Skia, so the pixels should match. The same package also feeds the marketing site, OG and share images, store assets and widget PNGs. With one TS/React codebase across mobile and web, a small team can move faster. EAS Update gives OTA fixes.
- **Unavoidable native code (any framework):** about 4.5–7k LOC Swift and 2.5–3.5k LOC Kotlin (my estimate). No cross-platform framework removes it. Expo removes the Xcode-project plumbing: Continuous Native Generation (CNG) plus apple-targets.
- **Runner-up: Flutter 3.47.** It is best-in-class for custom painting and motion (Impeller, Hero, shaders). It loses on renderer reuse (a Dart port, or baked geometry plus a Dart painter, and the JS copy still has to live on for web), on web sharing (Flutter web is not suited to an SEO marketing site), on OTA cost and on the hiring pool. Fully native (SwiftUI + Compose) comes a close third. It is the best fit if **iOS ships first and Android comes later**.
- **Main risks in the recommended stack:** Reanimated shared-element transitions are still **experimental** behind a flag (4.7.0). The Expo Router Apple zoom transition is **alpha** and iOS 18+ only. The widget extension has a 30 MB memory ceiling. apple-targets depends on one maintainer. A **2-week spike** with pass/fail thresholds (§8) settles these before commit.

---

## 1. Context (what drives the choice)

- The app is iPhone-first in design (390×844) and uses iOS-only surfaces: Live Activities and Dynamic Island (5a), interactive, lock screen and StandBy widgets (5c), AlarmKit leave-by alarm that breaks through DND (5b), communication notifications with a per-guide avatar (5b), and notification actions without unlocking (5b). The marketing site promises "Free on iPhone and Android".
- Signature visual: procedural brush-pen critters (`design/doodles.js`, `critters-draw-1.js`, `critters-draw-2.js`, `critters-data.js`, 139,575 bytes), covering 150 locals + 6 guides + icon set. The renderer covers draw-on, blink, sticker outline and locked silhouette. Critters must also appear in widgets, Live Activities, notifications, app icons, share images, the site and store assets.
- Nearly every screen has bespoke motion: springs, "grow into page", card flings (3d swipe), drag with 15-minute snapping (3e), room drag (3c), hold-to-fill ring (3l-4), slide-to-board (3f), odometers, confetti, stamp thud + shake, page turns (3m recap), typewriter streaming (3b/3j).
- Offline mode with an outbox (3k), background location dwell of 50 m that keeps counting while locked (3l), camera overlays (3j-3 menu translation, 3l-4 encounter), maps with animated critter markers (3d-4, 3g crew map), music themes + SFX + TTS phrase cards (3h/3k/3n), haptics throughout.
- Team: small (assumed 3–5 engineers). No code exists yet.

## 2. Evaluation criteria (weights tied to Critterpass features)

| # | Criterion | Weight | Critterpass drivers |
|---|---|---|---|
| C1 | Critter renderer reuse (Canvas2D → device) | 15 | every screen, 3l Critterdex (150×4), 3n avatar, 5a/5c extension art, site, store/social kits |
| C2 | Motion at 120 fps | 15 | 3a passport open, 3d swipe, 3e 15-min snap drag, 3c room drag, 3f slide-to-board, 3l hold ring, 3m page turns, confetti, odometers |
| C3 | iOS/Android extension integration + data sharing | 15 | 5a (6 LA variants, "I'M UP" from lock screen), 5b (comm notifs, rich poster voting, AlarmKit), 5c (interactive/lock/StandBy widgets), Android Glance + Live Updates |
| C4 | Device capabilities | 10 | camera overlays (3j-3, 3l-4), maps + live crew (3d-4, 3g), background location dwell (3l), audio/TTS (3h, 3n), haptics |
| C5 | Offline-first local DB | 5 | 3k offline + outbox, plan/bookings/wallet cache |
| C6 | i18n | 5 | UI locales + critter local words (Balinese, Japanese, Icelandic, Spanish, Portuguese, Quechua), currency (3n) |
| C7 | OTA + release velocity | 10 | LLM-prompt/UI iteration, copy fixes, paywall tuning (4) |
| C8 | Code sharing with web | 10 | the site (Home, Tips, Invite, Referral) shows critters; invite/referral deep links; OG/share images |
| C9 | Hiring + team velocity (small team) | 10 | 149 screens, 2 platforms, web |
| C10 | App size + startup | 5 | 5 fonts, music themes, maps SDK, camera |

## 3. Options matrix (1 = poor, 5 = best; weighted /5)

| Option | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Expo / React Native (NA)** | 5 | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 5 | 3 | **4.40** |
| Flutter 3.47 | 3 | 5 | 4 | 4 | 5 | 4 | 3 | 2 | 3 | 4 | 3.65 |
| Native (SwiftUI + Compose) | 3 | 5 | 5 | 5 | 4 | 3 | 1 | 2 | 2 | 5 | 3.55 (×~1.8 UI effort) |
| Kotlin + Compose Multiplatform | 3 | 3 | 3 | 3 | 4 | 4 | 1 | 2 | 3 | 3 | 2.80 |
| Lynx (brief) | 2 | 3 | 1 | 2 | 2 | 3 | 3 | 4 | 2 | 3 | ~2.4 (low confidence) |

Sensitivity check: drop RN C2 to 3 and raise Flutter C1 to 4 (baked geometry works well), and the scores are RN 4.25 vs Flutter 3.80. The ranking holds unless team skills or launch scope change (§6 flip conditions).

Score rationale in brief:
- C1: RN reuses geometry 1:1 and ports only the painter. Everyone else either ports ~117 KB of geometry or bakes it with a Node step, then writes painters in 1–2 languages, and keeps the JS copy for web.
- C2: Flutter and native have mature shared-element transitions and a single UI thread model. RN is strong (worklets on the UI thread, Skia), but its shared-element transition is experimental and it has documented limits on the number of animated components.
- C3: All options need Swift/SwiftUI for extensions. Native scores 5 (no bridge). RN/Expo scores 4 (CNG + apple-targets + Swift inline modules). Flutter scores 4 (checked-in Xcode project, Pigeon or method channels). CMP scores 3 (Swift export is still Alpha, and there are Kotlin/Native widget-memory issues).
- C7: EAS Update is first-party. Shorebird is paid and third-party. Native and CMP have no code OTA.
- C8: RN shares TS packages with any JS site. Flutter web is officially unsuited to text-rich SEO sites.

---

## 4. Deep-dives

### 4.1 C1 — Porting the brush-pen renderer

**What the code actually is** (measured locally):

| Layer | Bytes | DOM-coupled? | Notes |
|---|---|---|---|
| Geometry builders + data (`K.*` in doodles.js 19.3 KB, draw-1 37.3 KB, draw-2 41.1 KB, data 23.2 KB) | ~121 KB (≈86%) | No (only `window.__cp`, `window.CritterDex` registration glue) | produce an `ops[]` list: `line/under/wash/fill` with seeded point arrays |
| Math helpers (`rng`, Catmull-Rom `spl`, `ribbon`, `E`, `len`) | 2.7 KB | No | pure functions |
| Painter + `<doodle-art>` element (draw-on budget, blink, sticker offscreen, locked mode) | 7.7 KB | Yes (canvas, custom element, rAF, matchMedia) | ~20 Canvas2D members: path ops, save/restore, translate/setTransform, globalAlpha, `globalCompositeOperation` multiply/source-over, shadowBlur/offset, drawImage (offscreen sticker) |
| `tg-motion` / `tg-confetti` / `tg-type` / `tg-count` | 8.1 KB | Yes | re-implement as motion components; PRESETS + keyframe DSL are data and port directly |

Local evidence (sibling probe, `scratchpad/engine-probe/`): the unchanged renderer runs in Node on **@napi-rs/canvas** (a Skia-backed Canvas2D) and produces correct PNGs (`raw-node/gecko-150-sticker.png`). Chromium bench: median geometry build ≈0.28 ms per critter, with ~36 ops, ~1,400 points and ~1,300 ribbon vertices per critter. **Painting is the cost, not geometry.** Canvas2D in Chromium drops to ~31 fps with 40 simultaneous draw-ons at 96 px on an M3, and to ~6 fps under 4× CPU throttle (`bench-gpu.json`). So the device plan must cache static art and animate only what is on screen.

**Per-framework port:**

| Framework | Geometry | Painter | Draw-on/blink | Parity | Effort (est.) |
|---|---|---|---|---|---|
| **RN + Skia** | **1:1**: convert the IIFEs to ES modules + TS types (`packages/critter-geom`) | ~150–250 LOC `Canvas2DLike` adapter over `SkCanvas`/`SkPath`/`SkPaint` (BlendMode.Multiply, `setAlphaf`, DropShadow image filter, saveLayer for the sticker). `DoodleArt.draw(p)` can then be reused almost verbatim | per-frame ribbon slicing in a UI-thread worklet; static poses recorded once as `SkPicture`; blink = swap 2 pictures | Very high: Chrome Canvas2D is Skia ("graphics engine for Google Chrome… Android, Flutter"), RN Skia 2.11 ships Skia m152 | 1–2 wk |
| Flutter | port ~121 KB to Dart (mechanical, AI-assisted), **or** bake: run JS at build time → pre-spline control points per kind×pose×eyes → JSON, then port only helpers + painter (~250 LOC Dart `CustomPainter`) | Dart | AnimationController + CustomPainter | High (Impeller ≠ Skia, so blend/AA may differ slightly) | 2–4 wk + keeping the bake/port in sync with the JS web copy |
| Native | bake (as above), then Swift painter (SwiftUI `Canvas`/CoreGraphics) + Kotlin painter (Compose `Canvas`) | 2 painters | TimelineView / Animatable | High on Android (Skia), CoreGraphics differs on iOS | 3–5 wk + 3 painters to keep in sync |
| CMP | bake or port to Kotlin once; Compose `DrawScope` | Kotlin | Compose animation | High (Skia via Skiko on iOS) | 2–4 wk |

Pipeline shared by every option: `tools/prerender` (Node + @napi-rs/canvas 1.0.9 running the **original** JS) outputs store/social assets, OG images, fallback PNGs for widgets/Live Activities/notification attachments, app icons and the Critterdex thumbnail atlas. This lowers, but does not remove, the non-JS disadvantage. Parametric runtime variation (seed, colours, locked, sticker, new poses, per-user avatar composites) stays free only in JS.

Reuse verdict: **RN = ~86% verbatim + adapter; Flutter/native/CMP = rewrite or bake plus 1–3 painters**, and the JS copy survives anyway for web.

### 4.2 C2 — Motion at 120 fps

Mapping design motion to the recommended stack (Reanimated 4.7 / Worklets 0.13 / RNGH 3.x / Skia 2.x):

| Design element (screen) | RN implementation | Flutter / native equivalent |
|---|---|---|
| springs, bob/float/blink loops (`tg-motion` presets) | Reanimated 4 CSS-style keyframe animations (port the PRESETS table as data); global-clock sync via shared start time | AnimationController / SwiftUI `phaseAnimator`, `keyframeAnimator` |
| "grow into page" (card → page) | iOS: Expo Router `Link.AppleZoom` (**alpha**, iOS 18+). Cross-platform: custom overlay transition (measure → portal via react-native-teleport 1.2.2 → Reanimated layout → mount destination). Reanimated SET behind `ENABLE_SHARED_ELEMENT_TRANSITIONS` (**experimental**) | Flutter `Hero` (stable); SwiftUI `matchedGeometryEffect`/`.navigationTransition(.zoom)`; Compose `SharedTransitionLayout` |
| card flings / group swiping (3d) | RNGH Pan + `withDecay`/`withSpring` on UI thread | GestureDetector + physics sims |
| day timeline drag, 15-min snapping (3e), room drag (3c) | Pan gesture worklet quantises to 15-min slots; haptic tick on slot change via JS callback | same pattern |
| hold-to-fill ring (3l-4), leave-by rings | LongPress + Skia arc path driven by shared value | CustomPainter / Canvas |
| slide-to-board (3f) | Pan clamp + spring back / commit threshold | same |
| odometer (`tg-count`), typewriter | per-digit translateY columns; plain state for LLM streaming | same |
| confetti (`tg-confetti`, 70 particles) | port the 20-line physics to `useFrameCallback` + Skia `Atlas`/Picture | CustomPainter / Canvas |
| page turns (3m recap, passport) | 3D `rotateY` + perspective for page flips; true page curl = Skia RuntimeEffect (SkSL) shader | Flutter FragmentProgram shaders; native Metal/AGSL |
| stamp thud + shake | Reanimated sequence + custom Core Haptics pattern (native module) + SFX | same |

Documented RN limits (Software Mansion performance guide): animate at most ~100 components at once on low-end Android and ~500 on iOS. Prefer transform/opacity over layout props. Performance feature flags exist for Fabric (`USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`, `IOS/ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS`). 120 fps on iPhone is on by default since RN 0.82 (`CADisableMinimumFrameDurationOnPhone`). RN 0.85 added a shared **New Animation Backend** for Animated and Reanimated, but it is experimental and opt-in.

Verdict: RN can hit the design's motion targets, but only with discipline: UI-thread worklets only, cached Skia pictures, off-screen critters paused, and device-tier degrade. Shared-element transition is the one real gap, handled by the custom overlay route. Flutter and native are easier here, which is why RN scores 4 and they score 5.

### 4.3 C3 — Extension surfaces (Swift/Kotlin are unavoidable)

| Surface (screens) | Apple requirement | RN/Expo route (recommended) | Flutter | CMP | Native |
|---|---|---|---|---|---|
| Home/lock/StandBy widgets, interactive vote, "nudge Dev" (5c) | WidgetKit SwiftUI extension; buttons = App Intents (iOS 17+) | **SwiftUI in apple-targets `widget` target**; intents in `targets/*/_shared/*.swift` (compiled into app + extension). Alternative: `expo-widgets` (TS → @expo/ui SwiftUI; own JS runtime; no hooks/async/imports; iOS only in SDK 57) | SwiftUI in Xcode + `home_widget` 0.10.0 bridge | SwiftUI + KMP framework | SwiftUI |
| Live Activities + Dynamic Island (5a: leave-by, crew converging, flight day, critter nearby, storm, crew) | ActivityKit in the widget extension; ≤4 KB state; 8 h active + ≤4 h lock screen; images ≤ presentation size; custom animations ignored; push-to-start (17.2), broadcast channels (18) | same widget target; start/update from JS via a small Swift module or `expo-widgets` LA API; server pushes via APNs `liveactivity` | `live_activities` 2.6.0 (UI still SwiftUI) | Swift | Swift |
| "I'M UP" from lock screen updates everyone (5a) | `LiveActivityIntent` (App Intents) runs in the app process → API → server broadcast push | Swift intent in `_shared`; calls API with a token from a shared Keychain group; no JS needed | Swift | Swift | Swift |
| Leave-by alarm through DND, snooze (5b, 5c StandBy) | **AlarmKit (iOS 26+)**: overrides Focus and silent; needs `NSAlarmKitUsageDescription`; widget extension expected for the countdown presentation; App Intents for buttons | Swift module (inline module) + AlarmAttributes UI in the same widget target | Swift | Swift | Swift |
| Guide/crewmate avatar as sender (5b) | Communication notifications: `INSendMessageIntent` donation in a **Notification Service Extension** | apple-targets `notification-service` (Swift) | Swift NSE | Swift | Swift |
| Vote from rich expanded poster without unlocking (5b) | **Notification Content Extension** + categories/actions | apple-targets `notification-content` (Swift). Handle the action in the extension's `didReceive(response)` with a network call, so no cold-start of JS | Swift | Swift | Swift |
| Android widgets | Glance 1.2.0 (stable 2026-08-26) | Kotlin Glance via inline module/config plugin. Revisit `expo-widgets` Android (SDK 58 beta: "dedicated Hermes runtime") or Voltra 2.3.2 (JSX → Glance) | `home_widget` | shared Compose-ish (Glance) | Glance |
| Android Live Updates (5a equivalents) | Android 16+: Standard/BigText/Call/Progress/Metric style, `POST_PROMOTED_NOTIFICATIONS`, `setRequestPromotedOngoing`, **no custom RemoteViews**; chat/ads disallowed | Kotlin module + FCM `FirebaseMessagingService` | Kotlin | Kotlin | Kotlin |

**Estimate of unavoidable native LOC (any framework):**
- Swift: widgets + LA + AlarmKit UI 2.5–4k, NSE 0.3–0.5k, NCE 0.4–0.7k, App Intents 0.3–0.6k, bridge modules (App Group writer, LA/AlarmKit control, Core Haptics) 0.8–1.2k. **Total ≈4.5–7k.**
- Kotlin: Glance 1–1.5k, Live Updates + FCM 0.7–1.2k, alarms 0.3k, modules 0.5k. **Total ≈2.5–3.5k.**
- Only the bridge portion differs by framework: Expo module Swift DSL, Flutter Pigeon, CMP ObjC headers, or none for native.

**Data contract (framework-agnostic):**
- App Group container holds `snapshot.v1.json`: trip, countdown, votes, today, crew, dex progress. Types are generated from TS (JSON Schema → Swift Codable / Kotlin serialization).
- Critter PNGs sit at `critters/<id>-<form>-<pose>@3x.png`. The app renders them via a Skia offscreen snapshot, or downloads them from the prerender CDN.
- A Keychain access group holds the API token so intents and the NSE can call the backend.
- The extension bundle carries 1–2 fonts only (memory).
- Widget extension memory ceiling is ~30 MB. This is not in official docs; Apple forums report jetsam at "limit=30 MB", and custom fonts and large images are known triggers.
- Pure SwiftUI in the extension is preferred over `expo-widgets`, because `expo-widgets` adds a JS runtime inside that budget and its component and no-hooks limits constrain the richer designs (tinted lock screen rendering, rings, critter art). Use `expo-widgets` only for simple widgets, if at all.

### 4.4 C4 — Device capabilities (RN picks)

| Need | Pick (version 2026-09-26) | Notes |
|---|---|---|
| Camera + overlays (3j-3 menu, 3l-4 encounter) | **react-native-vision-camera 5.2.3** (Nitro rewrite; 5.0.0 on 2026-04-16) + `react-native-vision-camera-skia` plugin | frame processors for OCR/overlay; `expo-camera` for simple capture/scan (SDK 58 adds `scanDocumentAsync`, useful for receipt scan 3i). World-anchored AR is **not** covered: treat as a PO decision (§10) |
| Maps + animated critter markers (3d-4, 3g) | **@maplibre/maplibre-react-native 11.4.0** (custom stylised map matching the hand-drawn look) or react-native-maps 1.29 (Apple/Google). `expo-maps` is **alpha** | animated critter markers on a moving map are a spike item |
| Background location dwell 50 m, continues when locked (3l) | `expo-location` (background updates + geofencing via `expo-task-manager`); Transistor `react-native-background-geolocation` 5.6.0 as a paid fallback | iOS relaunches the app on geofence; Android does not auto-restart a terminated app. LA ring updates come from the background task |
| Audio: music themes, SFX, TTS | `expo-audio` (SDK 58 adds lock-screen controls/playlists); `react-native-audio-api` 0.13.6 (Web Audio API, pre-1.0) for low-latency layered SFX; `expo-speech` for phrase cards (3h) | guide voice conversation (3j) = realtime voice SDK (e.g. `@livekit/react-native` 3.0.0); out of scope here |
| Haptics | `expo-haptics` (presets only: impact/notification/selection) + a small Core Haptics (AHAP) inline module for stamp thud patterns | Android `performAndroidHapticsAsync` |
| Calendar sync heatmap (3c) | `expo-calendar` | |
| Auth (3a) | `expo-apple-authentication`, `@react-native-google-signin/google-signin` 16.1.5, SMS OTP autofill via TextInput `textContentType="oneTimeCode"` | |
| Alternate icons (3n) | `expo-alternate-app-icons` 8.0.0 (peer expo ≥53) | all earned icons must be in the binary |
| IAP (4) | `react-native-purchases` 10.10.2 (RevenueCat) or `expo-iap` 5.8.0 | billing retry/pause flows (4) favour RevenueCat; decided in the backend report |

Flutter has equivalents for all of these (camera 0.12.1, maplibre_gl 0.27.1, geolocator 14.0.3, flutter_background_geolocation 5.7.0, just_audio 0.10.6, flutter_tts 4.2.5). Native has first-party APIs with no bridge (hence its 5).

### 4.5 C5 — Offline-first local DB

- **RN:** `expo-sqlite` (SDK-bundled; libSQL support removed in SDK 58) + `drizzle-orm` 0.45.3 as typed schema and migrations. Alternatives: `@op-engineering/op-sqlite` 18.2.5 (fastest), sync engine `@powersync/react-native` 2.3.0 if the backend is Postgres, TinyBase 10.0.1, LiveStore 0.4.0 (pre-1.0), and `react-native-mmkv` 4.3.2 for KV/flags. Avoid WatermelonDB (last npm publish 2025-07-24).
- The outbox ("sends when you're back", 3k) is custom whichever option wins: a `pending_ops` table, replayed with idempotency keys.
- **Flutter:** `drift` 2.35.0 is excellent (scores 5), plus `powersync` 2.4.0. Isar is stale (3.1.0, 2023).
- **Native:** SwiftData/GRDB + Room means two schemas.

### 4.6 C6 — i18n

- **RN:** `expo-localization` + Lingui 6.8.0 (compile-time ICU) or i18next 26.4.2 / react-i18next 17.0.15. Strings live in one JSON catalogue, and a script generates `.xcstrings` / `strings.xml` for the Swift/Kotlin extensions. `expo-widgets` cannot import modules, so localised strings would have to be passed as props.
- CJK (Kyoto/Japanese words): the custom fonts (Instrument Serif, Geist, Caveat, Archivo) lack Japanese glyphs. Native Text falls back to system fonts automatically. **Skia paragraphs need an explicit font-manager fallback.**
- Flutter: gen-l10n/ARB or `slang` 4.19.2. Native: String Catalogs + strings.xml (two systems).

### 4.7 C7 — OTA + release velocity

- **EAS Update** (expo-updates) ships JS/asset changes. Native changes, including every Swift/Kotlin extension, still need store builds.
- Policy: App Review 2.5.2 bans downloading code that "introduces or changes features or functionality". OTA tools rely on DPLA §3.3.1(B), which allows interpreted code that does not change the primary purpose (secondary source; see Unresolved).
- SDK 56 claims diffed Hermes bundles are on average 58% smaller.
- `@expo/fingerprint` gates runtime versions.
- Expo keeps 3 SDKs/yr, each supported for ~1 year, with alternate RN releases now having "no user-facing breaking changes".
- Flutter: Shorebird (third-party, paid).
- Native/CMP: no code OTA, so only server-driven content.

### 4.8 C8 — Web code sharing

- Share TS packages across mobile and the site: `critter-geom`, `critter-paint-canvas2d` (the current code, verbatim, for the site), design tokens, motion presets, i18n catalogue, API types, OG/share image generation (Node + @napi-rs/canvas).
- Expo Router web static output is production-ready, but I recommend a **separate** site stack (web report decides: Astro/Next). The site uses the plain Canvas2D painter, not RN Skia web: CanvasKit is 2.9 MB gzipped and limited to 16 WebGL contexts per page.
- Flutter docs: "not suitable for static websites with text-rich flow-based content", and the output "doesn't align with what search engines need". The Dart renderer cannot be reused on the site unless it is compiled to JS/Wasm.

### 4.9 C9 — Hiring + velocity

- Stack Overflow 2025 (professional devs): TypeScript 48.8%, Kotlin 11.5%, Dart 6.1%, Swift 5.7%. The site and likely the backend are TS, so RN keeps **one language across the product**. State of RN 2025 (3,501 responses) shows Expo Router at 71% usage.
- Recommended team shape:
  - 2–3 TS/RN engineers, one of them a motion/Skia specialist.
  - 1 iOS-leaning engineer who owns the Swift extensions (WidgetKit/ActivityKit/AlarmKit/NSE/NCE). **This role is needed in every option.**
  - Android Kotlin part-time or contract (Glance, Live Updates, FCM).
  - Web shares the TS packages.
- Native would need about 2× the UI engineers for 149 screens. Flutter needs Dart plus the same Swift role and a separate JS web renderer owner.

### 4.10 C10 — App size + startup

- No authoritative 2026 benchmark was found. Blog figures (RN minimal 9–15 MB, Flutter 14–20 MB; cold start RN ~350 ms vs Flutter ~250 ms) are **low confidence**.
- Official signals: Hermes V1 is default (RN 0.84 / SDK 56). SDK 56 claims "~40% faster cold starts, 33% faster first render" on Android. SDK 58 enables R8 by default.
- For Critterpass the size drivers are **content**, not the framework: music themes (download on demand), 5 font families, the maps SDK, camera modules.
- Budget: ≤60 MB download, cold start ≤1.2 s on a mid Android device, measured in the spike.

### 4.11 Newcomers (brief)

- **Lynx** (ByteDance): 4.1.0 released 2026-09-07; 1,272 open GitHub issues. Secondary sources call the ecosystem early and third-party libraries sparse. I found no widget/Live Activity tooling and no Skia-class canvas. Not viable for this scope.
- **Valdi** (Snap): TS compiled to native views, open-sourced as beta. Too new.
- **Skip**: Swift/SwiftUI → Compose, free and open source since 2026-01. Interesting only if native iOS-first is chosen (§6).
- **Expo UI** (SwiftUI/Compose components in RN): stable since SDK 56. Useful for native pickers, menus and sheets. Not central, because the design is bespoke.

---

## 5. Recommendation

### 5.1 Decision

**Expo managed workflow with CNG, SDK 58 (RN 0.88), TypeScript strict, New Architecture only (legacy removed in RN 0.84).**
- Custom renderer on Skia; motion on Reanimated/Worklets/RNGH.
- Apple extensions in hand-written Swift via apple-targets; Android surfaces in Kotlin.
- A shared TS monorepo with the web site.

Why SDK 58 rather than 57:
- SDK 57 pins RNGH 2.32. SDK 58 moves to RNGH 3.x (hook API; 3.0.0 stable 2026-05-28), so starting on 58 avoids a 2→3 migration.
- SDK 58 adds Android widget support to `expo-widgets`, native tabs stable, R8 by default, Expo Modules 2.0.
- GA is expected ~mid-Oct 2026. Start on `expo@next` (58.0.0-preview.7) and switch at GA with `npx expo install --fix`.

### 5.2 Exact library set (versions as of 2026-09-26)

"SDK 58 pin" = `expo/expo` branch `sdk-58` `bundledNativeModules.json` (pre-GA; take the GA pins via `npx expo install`). "npm latest" = registry latest.

| Area | Package | SDK 58 pin | npm latest | Notes |
|---|---|---|---|---|
| Runtime | `expo` | 58.x (`next` = 58.0.0-preview.7) | 57.0.25 (latest), 58 preview | SDK 57 fallback pins: RN 0.86.3, React 19.2.3 |
| | `react-native` | 0.88.0-rc.1 | 0.87.1 | New Arch only; Hermes V1 default |
| | `react` | 19.3.0 | — | |
| Navigation | `expo-router` | ~58.0.6 | 57.0.23 | typed routes, native tabs (stable in 58), `Link.AppleZoom` (alpha) |
| | `react-native-screens` / `react-native-safe-area-context` | ~4.28.0 / ~5.9.1 | 4.28.0 | |
| Motion | `react-native-reanimated` | 4.6.0 | **4.7.0** (2026-09-18) | 4.7 supports RN 0.86–0.88; take 4.7 if Expo GA pins it |
| | `react-native-worklets` | 0.12.2 | 0.13.0 | pairs with Reanimated 4.7 |
| | `react-native-gesture-handler` | ~3.2.1 | 3.3.0 | hook API |
| | `react-native-teleport` | — | 1.2.2 | portal for custom shared-element overlay |
| Graphics | `@shopify/react-native-skia` | 2.11.2 | 2.13.0 (2026-09-24) | Skia m152 (2.11); SPM (2.12) |
| | `react-native-svg` | 15.15.5 | 15.15.5 | icons only |
| | `expo-image` | ~58.0.4 | — | |
| Lists/input | `@shopify/flash-list` 2.0.2 (pin) or `@legendapp/list` 3.4.0; `react-native-keyboard-controller` 1.22.x | | | |
| Apple targets | `@bacons/apple-targets` | — | 5.0.0 (peer expo ≥52) | widget, notification-service, notification-content, app-intent |
| | `expo-widgets` + `@expo/ui` | ~58.0.5 | 57.0.21 / 57.0.20 | optional, simple widgets only |
| Native glue | Expo inline modules (SDK 56+, **experimental**) | — | — | Swift/Kotlin in the project; `xcodeProjectTargets` can add them to the widget target |
| Camera | `react-native-vision-camera` (+ `react-native-nitro-modules`, `react-native-nitro-image`) | — | 5.2.3 | `expo-camera` ~58.0.3 for simple capture/scan |
| Maps | `@maplibre/maplibre-react-native` | — | 11.4.0 | or `react-native-maps` 1.29.0; `expo-maps` alpha |
| Location/background | `expo-location` ~58.0.5, `expo-task-manager` ~58.0.6, `expo-background-task` ~58.0.5 | | | |
| Notifications | `expo-notifications` ~58.0.5 | | | categories/actions + tokens; NSE/NCE in Swift |
| Audio/haptics | `expo-audio` ~58.0.2, `expo-speech` ~58.0.0, `expo-haptics` ~58.0.1, `react-native-audio-api` 0.13.6 (optional) | | | |
| Data | `expo-sqlite` ~58.0.4 + `drizzle-orm` 0.45.3; `react-native-mmkv` 4.3.2; `@powersync/react-native` 2.3.0 (if Postgres sync) | | | |
| i18n | `expo-localization` ~58.0.1 + `@lingui/core` 6.8.0 (or i18next 26.4.2) | | | |
| Updates/build | `expo-updates` ~58.0.7, `expo-dev-client` ~58.0.5, `expo-build-properties` ~58.0.5, `@expo/fingerprint` | | | |
| Misc | `expo-calendar`, `expo-apple-authentication`, `expo-sensors` (shake-to-report), `expo-sharing`, `expo-alternate-app-icons` 8.0.0, `react-native-purchases` 10.10.2, `@sentry/react-native` 8.28.0, `posthog-react-native` 4.78.0 | | | |
| Prerender (Node) | `@napi-rs/canvas` | — | 1.0.9 | runs the original JS renderer |
| iOS toolchain | Xcode 26.4+ (SDK 56+ minimum); iOS 27 shipped 2026-09-14 | | | |
| Android | Glance 1.2.0; target API 36/37 | | | |

### 5.3 Repo shape (monorepo, pnpm/bun workspaces)

```
apps/mobile            Expo app (expo-router), targets/ (apple-targets Swift), modules/ (inline Swift/Kotlin)
apps/web               marketing site (stack per web report)
packages/critter-geom  TS geometry + data (from design/*.js, ~86% verbatim)
packages/critter-paint canvas2d painter (web/Node) + skia painter (Canvas2DLike adapter)
packages/motion        tg-motion PRESETS/keyframe DSL → Reanimated + CSS
packages/tokens        colours, fonts, spacing; generates Swift/Kotlin constants for extensions
packages/i18n          catalogue → Lingui + .xcstrings/strings.xml generator
packages/contracts     API + App Group snapshot schema → TS/Swift/Kotlin types
tools/prerender        Node + @napi-rs/canvas → PNG/WebP assets, OG images, golden images
```

### 5.4 Runner-up: Flutter 3.47.5 (Dart 3.13.4)

- Stack: Impeller (the only engine on iOS; default on Android API 29+ with an OpenGL fallback), `CustomPainter`, `go_router` 18.0.1, `flutter_riverpod` 3.4.3, `drift` 2.35.0, `home_widget` 0.10.0, `live_activities` 2.6.0, `maplibre_gl` 0.27.1, `camera` 0.12.1, Shorebird for OTA.
- Swift extensions are identical in scope.
- The renderer is ported or baked to Dart; the JS copy stays for web.

### 5.5 Also-considered: native iOS-first

SwiftUI (iOS 18+ target) plus a later Compose Android app, optionally Skip. It has the best fidelity for 5a/5b/5c and motion, but no OTA, and Android arrives late or at double cost.

---

## 6. Conditions that would flip the recommendation

| Condition | Flip to |
|---|---|
| PO chooses an **iOS-only launch** for ≥6–9 months and the team has ≥2 senior SwiftUI engineers | Native SwiftUI (Android later: Compose or Skip) |
| Spike: Skia draw-on + Critterdex scroll misses thresholds on mid Android **and** the custom shared-element overlay feels non-native after 3 days of effort | Flutter |
| Core team is Dart/Flutter-experienced with no TS/React depth, **and** the site is built by a separate web vendor | Flutter |
| Team is Kotlin/Android-heavy and accepts no OTA **and** lower iOS polish | KMP + CMP (not recommended for this design) |
| apple-targets becomes unmaintained or breaks on a new Xcode | Stay on RN but move to bare workflow (commit `ios/`, manage targets in Xcode). Not a framework flip |
| Reanimated SET goes stable and the zoom transition reaches beta | Strengthens RN (no flip) |

## 7. Architecture notes that de-risk RN specifically

- Critter rendering tiers:
  1. Static thumbnails (Critterdex, lists, chat avatars) are prerendered WebP atlases or cached `SkImage`.
  2. On-screen idle critters are recorded `SkPicture`s animated by transform only.
  3. Draw-on entrance runs as a UI-thread worklet building sliced ribbons, with at most ~6 simultaneous entrances.
  4. Everything pauses off-screen.
  5. Reduce-motion falls back to `draw(1)`, same as the current code.
- Motion budget per screen: ≤30 simultaneously animated views on low-tier Android; device-tier flag via a JS performance probe at first launch.
- Extensions never run JS; the app writes an App Group snapshot + PNGs, then `WidgetCenter.reloadTimelines`.
- Live Activities (5a): start locally or via push-to-start; crew-wide updates via **broadcast channels (iOS 18+)**. Long-haul flight day exceeds the 8 h cap, so plan to end and restart at landing ("flips to pickup").
- Background JS (location task) stays thin: compute dwell, update the LA via a native module, enqueue to the outbox.

## 8. Two-week spike (go/no-go before commit)

| # | Spike | Pass threshold |
|---|---|---|
| S1 | `critter-geom` TS package + Skia `Canvas2DLike` painter; Tokek draw-on + blink; golden-image diff vs Node prerender | ≤2% pixel diff; draw-on 120 fps on iPhone 13+; ≥55 fps on a mid Android device (e.g. Pixel 7a / Galaxy A5x) |
| S2 | Critterdex grid 150×4 thumbnails + 6 idle bobbing critters | 120 fps scroll on iOS; no dropped frames >2% on the mid Android device |
| S3 | "Grow into page": `Link.AppleZoom` vs custom teleport overlay vs Reanimated SET flag | interruptible, no flicker, ≤16 ms p95 frame on both platforms |
| S4 | apple-targets widget ext: vote widget (App Intent), lock screen ring, leave-by LA with "I'M UP" `LiveActivityIntent`, AlarmKit alarm; App Group snapshot + critter PNG | EAS build signs all targets; widget memory <20 MB peak (Instruments); intent round-trip <2 s |
| S5 | NSE communication notification with guide avatar + NCE poster vote action | avatar shows; vote works with the device locked and the app killed |
| S6 | Background dwell ring (50 m) updating the LA while locked | ring advances on lock screen; battery drain <3%/h during an active encounter |
| S7 | Day timeline drag with 15-min snap + haptic ticks; slide-to-board | 120 fps drag, snap latency <1 frame |
| S8 | Cold start + size of the spike app (release, R8/Hermes) | ≤1.2 s cold start mid Android; ≤40 MB iOS download before content |

## 9. Cost estimates

**Services (monthly, public list prices 2026-09-26):**
- EAS Free during early dev (15 Android + 15 iOS builds, 1k update MAU).
- Starter $19 (3k MAU, $45 build credit) through beta.
- Production $199 (50k MAU, $225 build credit) at launch. Overage $0.005/MAU (50k–200k), so 100k MAU ≈ **$449/mo**. Builds beyond credit cost $2 (iOS medium) and $1 (Android medium).
- Alternative: self-host the open expo-updates protocol plus own CI for about $0 SaaS but extra engineering time.

| Stack | OTA/build SaaS | Comparable 100k-MAU cost |
|---|---|---|
| Expo (EAS) | $199/mo + usage | ≈$449/mo + build overage |
| Flutter (Shorebird) | Pro $20 (50k patch installs), Business $400 (1M); overage $1/2,500 installs | $20 + ~$20–40 per patch wave, or $400 flat; CI separate (not researched) |
| Native / CMP | CI only | CI only (not researched) |

**Engineering effort (relative, my estimate, not benchmarked):**

| Stack | UI build effort (Expo = 1.0×) | Main driver |
|---|---|---|
| Expo | 1.0× | — |
| Flutter | ~1.1× | renderer port/bake + JS web copy + Pigeon bridges |
| CMP | ~1.3× | iOS polish, library gaps, Alpha Swift export |
| Native | ~1.8× | two UIs for 149 screens |

The Swift/Kotlin extension work (~7–10k LOC) is the same in all four.

## 10. Decisions the product owner must make

1. **Launch platforms:**
   - (a) iOS + Android day one: recommended stack is Expo.
   - (b) iOS first, Android at +6–9 months: consider native SwiftUI.
   - (c) Android parity limited to widgets + Live Updates-lite.
2. **Minimum iOS:**
   - (a) 17.2 (push-to-start, interactive widgets).
   - (b) **18.0 (recommended)**: broadcast channels for crew LAs, zoom transitions.
   - (c) 26.0: AlarmKit everywhere; drops a meaningful share (79% of all iPhones were on iOS 26 on 2026-06-07).
   - AlarmKit is gated to 26 either way, with a fallback.
3. **Leave-by "rings through DND" fallback below iOS 26 and on Android:**
   - (a) time-sensitive notification only.
   - (b) apply for the Critical Alerts entitlement (unlikely to be granted for travel).
   - (c) Android exact alarm + full-screen intent (policy check needed).
4. **Encounter view (3l-4):**
   - (a) 2D camera overlay with gyro parallax: recommended, cross-platform.
   - (b) world-anchored AR (ARKit/ARCore): native modules, +4–6 weeks.
5. **Map look/provider:**
   - (a) MapLibre with a custom hand-drawn style (tile hosting cost TBD).
   - (b) Apple/Google native maps (least styling).
   - (c) Mapbox (paid MAU).
6. **OTA hosting:**
   - (a) EAS Update (≈$199–449/mo at 50–100k MAU).
   - (b) self-hosted expo-updates server.
7. **Critter art in extensions/notifications:**
   - (a) render on device into the App Group (smallest binary).
   - (b) ship prerendered PNGs in the binary (bigger; works before first launch).
   - (c) CDN download from the prerender pipeline.
8. **Widget authoring:**
   - (a) all SwiftUI (recommended).
   - (b) `expo-widgets` for simple widgets to cut Swift, at the cost of a JS runtime in the extension and its limits.
9. **Marketing site stack:** separate Astro/Next site sharing TS packages (recommended) vs Expo Router web static output from the same app.
10. **Team:** hire or contract 1 iOS extension specialist + part-time Android Kotlin, whichever framework is chosen.

## 11. Risks + mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Reanimated SET experimental; zoom transition alpha, ~1 s dismissal delay reported, iOS 18+ only | High / Med | custom teleport overlay transition (S3); feature-flag the SET; keep route transitions simple on Android |
| Low-end Android frame drops (Skia paths + many animated views; ≤100-component guidance) | Med / High | picture caching, prerendered atlases, device tiers, off-screen pause, reduce-motion |
| Widget extension 30 MB jetsam (fonts, images, JS runtime) | Med / High | pure SwiftUI; ≤2 fonts; PNG ≤ presentation size; Instruments budget in CI checklist |
| apple-targets bus factor ("only tested end-to-end" with the widget); CNG regeneration surprises | Med / Med | pin 5.0.x; snapshot-test the prebuild output; exit path = bare workflow |
| Expo/RN churn (3 SDKs/yr; Hermes V1 memory regression with worklets fixed only in expo@57.0.9) | Med / Med | upgrade each SDK within 6–8 weeks of GA; pin patches; fingerprint + Maestro smoke tests |
| Live Activity limits: 4 KB, 8 h + 4 h, update throttling (`NSSupportsLiveActivitiesFrequentUpdates` may still throttle) | High / Med | small state payloads, split flight day into two LAs, server-side coalescing |
| Android Live Updates policy (no custom views; chat/ads disallowed); "critter nearby" may not qualify | Med / Low | use standard ongoing notification when not eligible; Glance widget instead |
| Background location review scrutiny + battery | Med / High | "While Using" + temporary precise location during encounters; geofence wake-ups; clear purpose strings |
| Two painters drift (Canvas2D vs Skia) | Med / Low | golden-image tests Node vs device snapshot (S1) in CI |
| CJK glyph fallback in Skia text | Med / Low | explicit font manager with Noto Sans JP subset for Kyoto content |
| OTA misuse (feature changes via OTA) | Low / High | only JS fixes/copy/tuning over OTA; feature flags server-side; all native changes via store |

## 12. Key claims

| Claim | Source | Date | Confidence |
|---|---|---|---|
| Expo SDK 57 released with RN 0.86, React 19.2; Reanimated 4.3→4.5, Worklets 0.8→0.10, RNGH 2.31→2.32 | https://expo.dev/changelog/sdk-57 | 2026-06-30 | High |
| SDK 57 pins: RN 0.86.3, React 19.2.3, Reanimated 4.5.1, Worklets 0.10.1, RNGH ~2.32.0, Skia 2.6.2 | https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/bundledNativeModules.json | acc. 2026-09-26 | High |
| SDK 58 beta: RN 0.88 RC; stable 3–4 weeks after beta; Android widgets w/ dedicated Hermes runtime; router loaders/SSR stable, native tabs stable; libSQL removed; R8 default; `scanDocumentAsync` | https://expo.dev/changelog/sdk-58-beta | 2026-09-15 | High (beta content) |
| SDK 58 branch pins: RN 0.88.0-rc.1, React 19.3.0, Reanimated 4.6.0, Worklets 0.12.2, RNGH ~3.2.1, Skia 2.11.2 | https://raw.githubusercontent.com/expo/expo/sdk-58/packages/expo/bundledNativeModules.json | acc. 2026-09-26 | High (pre-GA) |
| SDK 56: Hermes v1 default; Expo UI SwiftUI/Compose stable; expo-widgets iOS stable; inline modules; min iOS 16.4; Xcode 26.4; Android ~40% faster cold start; diffed bundles 58% smaller | https://expo.dev/changelog/sdk-56 | 2026-05-21 | High (vendor numbers) |
| RN 0.84: Hermes V1 default, legacy architecture components removed; 0.85 New Animation Backend (experimental, opt-in); 0.87 released 2026-08-11 | https://reactnative.dev/blog , https://reactnative.dev/blog/2026/04/07/react-native-0.85 | 2026-02-11 / 2026-04-07 / 2026-08-11 | Med-High |
| npm latest: expo 57.0.25, react-native 0.87.1, reanimated 4.7.0, worklets 0.13.0, RNGH 3.3.0, RN Skia 2.13.0, apple-targets 5.0.0, vision-camera 5.2.3, maplibre-rn 11.4.0 | npm registry (`npm view`) | acc. 2026-09-26 | High |
| Reanimated 4.7.0: SET still experimental behind `ENABLE_SHARED_ELEMENT_TRANSITIONS`; supports RN 0.86–0.88 | https://github.com/software-mansion/react-native-reanimated/releases | 2026-09-18 | High |
| Reanimated perf guidance: ≤~100 animated components low-end Android, ~500 iOS; 120 fps flag default since RN 0.82 | https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/ | acc. 2026-09-26 | Med-High |
| RNGH 3.0.0 stable (hook API, New Arch rebuild) | https://github.com/software-mansion/react-native-gesture-handler/releases | 2026-05-28 | High |
| Expo Router zoom transition = alpha, iOS 18+, SDK 55+ | https://docs.expo.dev/router/advanced/zoom-transition/ | modified 2026-04-02 | High |
| expo-widgets: isolated JS runtime; only `@expo/ui/swift-ui`; no hooks/async/imports; images via App Group `widgetsDirectory`; iOS only (SDK 57); buttons iOS 17+; push-to-start tokens | https://docs.expo.dev/versions/latest/sdk/widgets/ | acc. 2026-09-26 | High |
| apple-targets: widget/LA, notification-content, notification-service, app-intent, clip…; `_shared/*.swift` compiled into app + target; widget is the only target tested end-to-end by the author | https://github.com/EvanBacon/expo-apple-targets | pushed 2026-09-25 | High |
| Expo inline modules experimental (SDK 56+); can be added to extra Xcode targets | https://docs.expo.dev/modules/inline-modules-reference/ | acc. 2026-09-26 | High |
| expo-haptics exposes only impact/notification/selection/Android presets | https://docs.expo.dev/versions/latest/sdk/haptics/ | acc. 2026-09-26 | High |
| expo-maps is alpha | https://docs.expo.dev/versions/latest/sdk/maps/ | acc. 2026-09-26 | High |
| Skia is the graphics engine for Chrome, ChromeOS, Android, Flutter | https://skia.org/ | acc. 2026-09-26 | High |
| RN Skia web = CanvasKit 2.9 MB gz; 16 WebGL contexts/page | https://shopify.github.io/react-native-skia/docs/getting-started/web | acc. 2026-09-26 | High |
| RN Skia 2.11 → Skia m152; 2.12 SPM; 2.13 on 2026-09-24 | https://github.com/Shopify/react-native-skia/releases | 2026-08/09 | High |
| VisionCamera v5 = Nitro rewrite (5.0.0 on npm 2026-04-16), modular, Skia plugin | https://margelo.com/blog/whats-new-in-visioncamera-v5 ; npm | 2026-04 | High |
| Renderer runs unchanged in Node @napi-rs/canvas; geometry ~0.28 ms/critter median; 40 simultaneous Canvas2D draw-ons ≈31 fps (M3, Chromium) | local: `scratchpad/engine-probe/` (sibling probe) | 2026-09-26 | Med (local, unreviewed) |
| Flutter stable 3.47.5 (Dart 3.13.4) | https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json | 2026-09-18 | High |
| Flutter 3.47: material_ui/cupertino_ui 1.0 decoupled; min iOS 15; 92/100 top plugins on SwiftPM | https://flutter.dev/blog/whats-new-in-flutter-3-47 | 2026-08-12 | High |
| Impeller: only engine on iOS; default Android API 29+, OpenGL fallback | https://docs.flutter.dev/perf/impeller | acc. 2026-09-26 | High |
| Flutter 2026 roadmap: remove Skia backend on Android 10+; Wasm default on web; non-Google contributors outnumber Google | https://flutter.dev/blog/flutter-darts-2026-roadmap | 2026-02-24 | High (plan) |
| Flutter web not suitable for text-rich static sites; SEO misaligned | https://docs.flutter.dev/platform-integration/web/faq | acc. 2026-09-26 | High |
| Flutter in app extensions: memory-limited; Flutter UI only in some (e.g., Share); share via App Groups | https://docs.flutter.dev/platform-integration/ios/app-extensions | acc. 2026-09-26 | High |
| home_widget: widget UI must be native; can render Flutter widgets to images | https://pub.dev/packages/home_widget (0.10.0, 2026-09-17) | 2026-09-17 | High |
| live_activities: LA UI in SwiftUI widget extension; App Group UserDefaults; push-to-start supported | https://pub.dev/packages/live_activities (2.6.0, 2026-09-11) | 2026-09-11 | High |
| CMP iOS stable since 1.8.0; latest 1.12.1; Kotlin 2.4.20 | https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/ ; GitHub releases | 2025-05-08 / 2026-09-22 / 2026-09-07 | High |
| Kotlin Swift export is Alpha | https://kotlinlang.org/docs/native-swift-export.html | 2026-08-28 | High |
| KMP in widget hits 30 MB memory crash (issue) | https://youtrack.jetbrains.com/issue/KT-66589 | n/d | Med |
| Widget extension ~30 MB jetsam limit | https://developer.apple.com/forums/thread/713561 | n/d | Med (not in official docs) |
| LA: 8 h active + ≤4 h lock screen (12 h max); 4 KB state; image ≤ presentation size; animation modifiers ignored | https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities | acc. 2026-09-26 | High |
| LA broadcast channels (iOS 18), push-to-start tokens; broadcast cannot start an LA | https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications | acc. 2026-09-26 | High |
| AlarmKit iOS 26: overrides Focus + silent; `NSAlarmKitUsageDescription` required; widget extension expected for countdown; App Intents for extra actions | https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit | acc. 2026-09-26 | High |
| Communication notifications: INSendMessageIntent in NSE, sender avatar, can break through Focus | https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications | acc. 2026-09-26 | High |
| App Review 2.5.2 bans downloaded code changing features (guidelines last updated 2026-06-08) | https://developer.apple.com/app-store/review/guidelines/ | 2026-06-08 | High |
| DPLA §3.3.1(B) permits interpreted code not changing primary purpose (basis for OTA) | https://www.xprem.dev/blog/are-ota-updates-allowed-on-ios (secondary) | n/d | Med |
| Android Live Updates requirements + disallowed uses | https://developer.android.com/develop/ui/views/notifications/live-update | acc. 2026-09-26 | High |
| Glance 1.2.0 stable | https://developer.android.com/jetpack/androidx/releases/glance | 2026-08-26 | High |
| Android 17 stable, API 37 | https://en.wikipedia.org/wiki/Android_17 (secondary) | 2026-06-16 | Med |
| iOS 27 released | https://en.wikipedia.org/wiki/IOS_27 (secondary) | 2026-09-14 | Med |
| iOS 26 on 79% of all iPhones (Apple data, 2026-06-07) | https://www.macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/ | 2026-06-09 | Med-High |
| EAS pricing: Free/Starter $19/Production $199; MAU inclusions; $0.005/MAU overage; build prices | https://expo.dev/pricing | acc. 2026-09-26 | High |
| Shorebird pricing: Pro $20 (50k), Business $400 (1M), $1/2,500 overage | https://shorebird.dev/pricing | acc. 2026-09-26 | High |
| SO 2025 usage (pro devs): TS 48.8%, Kotlin 11.5%, Dart 6.1%, Swift 5.7% | https://survey.stackoverflow.co/2025/technology | 2025 | High |
| State of RN 2025: 3,501 responses; Expo Router 71% | https://results.stateofreactnative.com/en-US/ | 2026-01 | Med |
| Lynx 4.1.0 (2026-09-07), 1,272 open issues; ecosystem early | GitHub API; https://www.pkgpulse.com/guides/lynx-bytedance-framework-vs-react-native-2026 | 2026-09 | Med |
| Skip free + open source (v1.7) | https://www.infoq.com/news/2026/01/swift-skip-open-sourced | 2026-01 | Med |
| RN/Flutter size + startup numbers (9–15 MB vs 14–20 MB; ~350 ms vs ~250 ms) | https://www.applighter.com/blog/react-native-performance-benchmarks-expo-vs-bare-vs-flutter-vs-native-2026 (blog) | 2026 | **Low** |
| WatermelonDB last published 2025-07-24 | npm registry | acc. 2026-09-26 | High |

## 13. Unresolved questions

1. Real RN Skia draw-on throughput on mid and low Android (Canvas2D-in-Chromium numbers do not transfer). Settled in spike S1/S2.
2. Can an `expo-widgets` target and an apple-targets widget target coexist in one app (two widget extensions, shared App Group)? Not verified. The recommendation avoids needing both.
3. Is the `expo-widgets` extension JS bundle updatable over EAS Update, or is it frozen per binary? Not found in docs.
4. Exact wording of DPLA §3.3.1(B) was not fetched from Apple (secondary source only).
5. "Skia removed on Android 10+ in Flutter 3.44" appears only in secondary sources. The roadmap states the plan, and the 3.44 official post does not confirm it.
6. Android 14+ full-screen-intent / exact-alarm policy for a travel app's "alarm through DND": not researched.
7. Whether "critter nearby" and "crew converging" qualify as Android promoted Live Updates under Play policy (system-judged).
8. CI costs outside EAS (GitHub macOS runners, Xcode Cloud) were not researched.
9. When Reanimated SET goes stable (no public ETA found).
10. Voice-conversation stack (3j realtime voice) and its native deps: out of scope; affects app size.
11. Maps tile hosting cost for a custom MapLibre style: belongs to the backend/infra report.
12. Measured app size and cold start for this exact library set: to be taken in spike S8.
