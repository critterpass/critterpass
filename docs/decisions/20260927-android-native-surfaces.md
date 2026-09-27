# Android native surfaces: Glance widget, Live Update/MetricStyle push, full-screen alarm

Date: 2026-09-27
Status: PASS on everything provable without a physical Android device or a Firebase project —
real Kotlin compiled against the real API 36/37 SDK stubs, real app-level manifest merge and
resource linking, 13/13 JVM unit tests, and a real EAS cloud Android build producing a real signed
APK (`e2e-test` profile, release configuration). INCOMPLETE on FCM live transport (no Firebase
project) and every visual/behavioral check that needs a real device or the EAS Android emulator
(the Maestro run failed at "Start Android Emulator" — a pre-existing, documented infrastructure gap
in `.eas/workflows/e2e-android.yml`, not this module's code). No criterion FAILED.

## Context

Phase 50 (Android parity) builds the real Live Update / Glance / full-screen-alarm surfaces for
every trip session kind; this spike (T14) de-risks the three riskiest primitives first, in
isolation, before that phase commits to them: `Notification.ProgressStyle`/`MetricStyle` (both
genuinely new platform APIs, only in the API 36/37 SDKs), Jetpack Glance (a Compose-based widget
toolkit this codebase had never used), and the full-screen-intent/exact-alarm permission pair that
Android 14+ denies by default. `apps/mobile/modules/cp-spike-android` is a throwaway Kotlin Expo
module, deleted once phase 50 lands its real `cp-android-surfaces` module (phase-02's own owns
list).

## Criteria (phase-02 §Requirements, "Android surfaces")

| # | Criterion | Result |
|---|---|---|
| 1 | Glance widget renders the shared snapshot written by `cp-app-group` (T8) | **PASS** — real cross-module file read, compiled and resource-linked for real; on-device pixel confirmation is a founder checklist item |
| 2 | Live Update (`Notification.ProgressStyle`, promoted ongoing) created/updated from an FCM v1 data push, gated `SDK_INT >= 36` | **PASS on the code path** (real `ProgressStyle`/`requestPromotedOngoing` usage, compiled against the real API 36 SDK); **SKIPPED on the FCM transport itself** — no Firebase project in this environment, exercised instead via a local test hook that calls the identical receiver code |
| 3 | `MetricStyle` path gated `>= 37` with a verified fallback on 36 | **PASS** — real `Notification.MetricStyle`/`Metric`/`FixedFloat` usage, isolated in its own class to avoid a `VerifyError` on API 36 (`SdkGuardsTest` unit-verifies the gate itself: 35→false, 36→ProgressStyle-only, 37→MetricStyle) |
| 4 | Full-screen-intent alarm: `canUseFullScreenIntent()` check + Settings deep-link flow when denied (API 34+ rule) | **PASS** — real `NotificationManager.canUseFullScreenIntent()`/`Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` wiring; the pure decision (`FullScreenIntentGate`) is unit-tested for all four sdk/granted combinations; on-device confirmation is a founder checklist item |
| 5 | Exact-alarm scheduling with a denied-by-default degrade path | **PASS** — real `AlarmManager.canScheduleExactAlarms()`/`setExactAndAllowWhileIdle()` (granted) vs `setAndAllowWhileIdle()` (denied) branch; never `USE_EXACT_ALARM` |
| 6 | Alarm activity over the lock screen | **PASS on build** — real `setShowWhenLocked`/`setTurnScreenOn` + `setFullScreenIntent`; on-device lock-screen confirmation is a founder checklist item |

## Method

- Scaffolded the module by hand (not `create-expo-module@latest`, unlike `cp-app-group`) because
  this module ships **Android-only** native code (`expo-module.config.json`'s `platforms` is
  `["android"]`) — the generator's default output assumes both platforms and would need the iOS
  half deleted anyway; the Android half (`android/build.gradle`, `AndroidManifest.xml`, module
  Kotlin class, `expo-module.config.json`) matches `cp-app-group`'s own generator-produced shape
  exactly, verified side by side rather than guessed.
- **Real Android SDK API verified before writing any code that calls it**, not from memory:
  `javap` against the actual `android-37.0/android.jar` (already installed locally —
  `~/Library/Android/sdk/platforms/{android-36,android-37.0}`) confirmed the exact public method
  signatures for `Notification.ProgressStyle`/`.Segment`/`.Point`, `Notification.MetricStyle`/
  `.Metric`/`.Metric.FixedFloat`, `Notification.Builder.setRequestPromotedOngoing`,
  `NotificationManager.canUseFullScreenIntent`, `AlarmManager.canScheduleExactAlarms`, and
  `Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`/`ACTION_REQUEST_SCHEDULE_EXACT_ALARM` —
  every one of these is a real, narrow, version-specific API and a wrong guess would have compiled
  against nothing (or the wrong overload) rather than failing loudly.
- `MetricStyleBuilder` is a **separate internal object**, not inlined into `LiveUpdateNotifier`:
  ART verifies a class's referenced types when that class is first loaded, so a single class
  referencing both `ProgressStyle` (API 36) and `MetricStyle` (API 37) risks a `VerifyError` on an
  API 36 device that never takes the `MetricStyle` branch, purely from the class-load-time check —
  isolating it means the type is only resolved when `SdkGuards.supportsMetricStyle` has already
  gated the call.
- The Glance widget (`AndroidSurfacesWidget`, `AndroidSurfacesWidgetReceiver`) reads
  `filesDir/cp-app-group/snapshot/hello.json` directly — the exact file
  `CpAppGroupModule.kt`'s `writeSnapshot('hello', …)` writes (Android has no App Group; that
  module's own doc comment already establishes "shared storage" as this app's private files dir).
  This is a real read of a file another module's dev screen writes, not a hard-coded string.
- **No `apps/mobile/plugins/with-*.ts` config plugin was written.** Proven unnecessary rather than
  assumed: `cp-app-group` already demonstrates that an Expo Android library module's own
  `AndroidManifest.xml` merges into the host app via Gradle's standard manifest merger without any
  `app.config.ts` plugin entry — confirmed again here for real by running
  `:app:processDebugMainManifest` and finding every one of this module's six manifest components
  (`AndroidSurfacesWidgetReceiver`, `ReloadWidgetsBroadcastReceiver`,
  `AndroidSurfacesTestHookReceiver`, `AlarmReceiver`, `AlarmActivity`,
  `AndroidSurfacesMessagingService`) present in the merged output under the module's own
  `app.critterpass.spikeandroid` namespace. `apps/mobile/app.config.ts` was not touched.
- **Local FCM-receiver test hook, not a faked pass**: no Firebase project exists in this
  environment (no `google-services.json`, matching the `apns-live-activity` ADR's own FCM gap).
  Rather than skip the receiver logic entirely, `AndroidSurfacesPushReceiver.handle(context, data)`
  is the single entry point both the real `AndroidSurfacesMessagingService.onMessageReceived` and
  two test-only callers invoke identically: `CpSpikeAndroidModule.simulateLiveUpdatePush` (JS
  button on the dev screen / Maestro) and the exported `AndroidSurfacesTestHookReceiver`
  (`adb shell am broadcast -a app.critterpass.spikeandroid.SIMULATE_PUSH`). Only the transport
  differs; the parse-and-notify code a real push would run is exercised for real either way.
  `tools/spikes/src/android-surfaces/run.ts` is the credentialed-path sender, reusing
  `apns-live-activity`'s own `fcm-client.ts` (`hasFcmCredentials`/`sendLiveActivityDataMessage`) —
  it prints `SKIPPED` with the missing-credential reason rather than a fabricated success, matching
  that spike's own pattern.
- Verification ladder, narrowest to widest, each one real (no step assumed from the previous):
  1. `./gradlew :cp-spike-android:testDebugUnitTest` — 13 JVM unit tests (`SdkGuards`,
     `AndroidSurfacesPushPayloadParser`, `FullScreenIntentGate`), no Robolectric: `org.json:json`
     added to the *test* classpath only, since the stub `android.jar` throws for every method
     (including `org.json`) without it, and this parsing logic doesn't need a full Android runtime.
  2. Real `compileDebugKotlin` for the module's main sources — the actual compile step that proves
     every `Notification.ProgressStyle`/`MetricStyle`/Glance/Firebase-messaging usage above is
     correct against the real compileSdk 37 stubs, not just javap-verified in isolation.
  3. `:app:processDebugMainManifest` — proves the six manifest components above merge into the
     host app manifest with no conflicts.
  4. `:app:processDebugResources` — proves `res/xml/spike_widget_info.xml`'s
     `android:initialLayout="@layout/glance_default_loading_layout"` (Glance's own bundled
     resource) and the widget's `meta-data android:resource="@xml/spike_widget_info"` both resolve
     through AAPT2 resource linking across the whole app, not just this module in isolation.
  5. `./gradlew :cp-spike-android:dependencies --configuration releaseRuntimeClasspath` and
     `:cp-spike-android:compileReleaseKotlin` — added *after* the first EAS attempt below failed on
     exactly the release configuration these two tasks exercise and the first four steps don't;
     rerun locally once fixed, both green, before spending a second EAS build on it.
  6. `pnpm e2e:cloud -- --platform android --flows e2e/spikes/android-surfaces.yaml` — EAS cloud
     build + Maestro, to prove the module assembles/packages in EAS's clean-room environment (a
     real device architecture, not local stub verification). Outcome below.
- Stopped short of a local `assembleDebug`/APK/emulator run — this machine's disk is shared with
  five other agents and dropped from 14 GB free to under 3 GB free over the course of this pass
  purely from their concurrent activity (confirmed: nothing I ran between two consecutive `df -h`
  checks explains the drop), well past this task's own 4 GB local-build floor. The four steps
  above stop one step short of dexing/packaging but are real compiler/linker verification, not
  guesses.

## Raw numbers

```
$ ./gradlew :cp-spike-android:testDebugUnitTest
> Task :cp-spike-android:compileDebugKotlin
w: .../alarm/AlarmReceiver.kt:42: 'fun setPriority(p0: Int): Notification.Builder!' is deprecated.
> Task :cp-spike-android:testDebugUnitTest
BUILD SUCCESSFUL in 1m 31s

TEST-app.critterpass.spikeandroid.alarm.FullScreenIntentGateTest: tests="4" failures="0" errors="0"
TEST-app.critterpass.spikeandroid.push.AndroidSurfacesPushPayloadTest: tests="7" failures="0" errors="0"
TEST-app.critterpass.spikeandroid.push.SdkGuardsTest: tests="2" failures="0" errors="0"
(13 tests, 13 passed, 0 failed — SdkGuardsTest's own count is 2 test *methods*, each asserting
 multiple SDK levels)

$ ./gradlew :app:processDebugMainManifest
BUILD SUCCESSFUL in 1m 15s
(merged manifest contains all six app.critterpass.spikeandroid.* components; no warnings
 attributable to this module)

$ ./gradlew :cp-spike-android:dependencies --configuration releaseRuntimeClasspath
$ ./gradlew :cp-spike-android:compileReleaseKotlin
BUILD SUCCESSFUL (both, after the androidx.core:core version fix in Findings #5)

$ ./gradlew :app:processDebugResources
BUILD SUCCESSFUL in 29s

$ pnpm turbo run lint typecheck test --filter=@cp/mobile --filter=@cp/spikes
@cp/mobile: lint clean, typecheck clean, 14 suites / 77 tests passed
@cp/spikes: lint clean, typecheck clean, 5 suites / 25 tests passed

$ pnpm tsx tools/scripts/check-release-bundle.ts
Release bundle check passed: no dev-only routes in the production export.
```

EAS cloud build/Maestro (`pnpm e2e:cloud -- --platform android --flows
e2e/spikes/android-surfaces.yaml`), two real attempts:

```
Attempt 1 (build 006c47ec's predecessor) — RUN_GRADLEW failed for real:
  Could not find androidx.core:core:1.13.2.
  Required by: ... com.google.firebase:firebase-messaging:24.1.2 > ... > androidx.fragment ...
BUILD FAILED in 2m 42s
E2E run did not succeed (status: FAILURE). Failing job(s): build

[fixed androidx.core:core/-ktx to the real latest, 1.19.1; reverified locally per Method step 5]

Attempt 2 (build 006c47ec-5e4d-496a-8e0b-6fbecb92f2f9):
  build: SUCCESS — real APK produced:
    https://expo.dev/artifacts/eas/IhS5oaeZ8UuVi2JcJet9v1BkC-At3fF7K-jQbbUrJPU.apk
  maestro_new_build: FAILURE at step "Start Android Emulator":
    EasAndroidDevice01 failed to start on attempt 1/3, 2/3, 3/3.
    Failed to configure emulator (null): emulator with required ID not found.
  workflow status: FAILURE (the emulator step, not the build)
```

## Findings

1. **The Kotlin Gradle Plugin version this project actually resolves (2.2.0, printed by Expo's own
   `[ExpoRootProject]` configuration log) needed to be matched exactly by the
   `org.jetbrains.kotlin.plugin.compose` version** — a version-less `plugins { id
   'org.jetbrains.kotlin.plugin.compose' }` request fails outright ("must include a version number
   for this source"), unlike `kotlin-android` itself, which `expo-module-gradle-plugin` applies
   through its own resolved-version lookup rather than the `plugins{}` DSL. Confirmed by trying the
   version-less form first and reading the real error before hardcoding `2.2.0`.
2. **Adding Jetpack Glance to this codebase for the first time needed the Compose Kotlin compiler
   plugin (`org.jetbrains.kotlin.plugin.compose`) applied at the module level** — this repo had
   never used Compose/Glance before this spike (RN + Skia for UI), so no existing module's
   `build.gradle` had this wired up to copy from.
3. **`org.json` on the unit-test classpath, not Robolectric**, was the right-sized fix for
   `AndroidSurfacesPushPayloadParser`'s tests: the stub `android.jar` unit tests run against throws
   `RuntimeException` for every Android SDK method (including `org.json`) unless something real
   backs it. `testImplementation "org.json:json:20240303"` is the standard, narrow fix documented
   across the Android community for exactly this — pulling in Robolectric for a spike this size
   would have been the wrong-sized tool.
4. **The disk-usage risk this task's own brief called out was real and machine-wide, not
   local-build-specific**: free disk dropped by roughly 10 GB over this pass from five other
   agents' concurrent activity on the same machine, independent of anything this task did (verified
   by two consecutive `df -h` checks with no intervening disk-writing command from this session).
   Local Android verification stopped at resource-linking rather than a full `assembleDebug` partly
   for this reason.
5. **`androidx.core:core:1.13.2` — the version this module first pinned for both `androidx.core:core`
   and `androidx.core:core-ktx` — does not exist as a published artifact at all** (Google's own
   `maven-metadata.xml` tops out at `1.13.1`). This passed every local *debug*-variant check (unit
   tests, `compileDebugKotlin`, `processDebugMainManifest`, `processDebugResources`) because Gradle's
   version-conflict resolution never actually needed to fetch the literal `1.13.2` artifact for the
   debug classpath — some other debug-only dependency's transitive request won the conflict at a
   real, higher version. The first EAS cloud build (`e2e-test` profile, which resolves a *release*
   classpath) failed for real at `RUN_GRADLEW` with `Could not find androidx.core:core:1.13.2`,
   because for that configuration the nonexistent version *was* the one Gradle needed to actually
   resolve. Fixed by pinning to `1.19.1` (the real latest, checked against Google's maven-metadata
   this time), then verifying the fix locally with the two release-configuration tasks in Method
   step 5 before spending a second EAS build on it — this is the reason this ADR is written after,
   not before, the fix: the failure and the fix are both real events from this pass, not
   hypothetical risks.

## Verdict

**PASS** on every criterion's code path: real Kotlin compiled against the real API 36/37 SDK
stubs (verified method-by-method with `javap` before writing call sites), a real app-level manifest
merge, real AAPT2 resource linking, 13/13 real JVM unit tests covering the three SDK/permission
decision points the phase explicitly asks to be unit-tested, and a real EAS cloud build that
produces a signed, installable APK for this exact module on the release configuration (which is
what actually caught the one real bug this pass found — see Findings #5). **INCOMPLETE**,
consistent with the environment brief rather than a surprise, on: the FCM live-transport half of
criterion 2 (no Firebase project), the Maestro/emulator run itself (EAS's Android build
infrastructure can't start an emulator on this project right now — a pre-existing, already-documented
gap, confirmed reproduced again on this exact attempt), and every criterion's on-device
visual/behavioral confirmation (Glance widget actually rendering on a home screen, the promoted
notification chip appearing in a real status bar, the alarm activity actually drawing over a locked
screen) — none of these can be produced without a physical device or a working EAS Android
emulator, per phase-02's own "Device evidence" split.

## Chosen path

Ship as built: `Notification.ProgressStyle`/`MetricStyle` gated by `SdkGuards`, Jetpack Glance for
the widget, `AlarmManager` exact/inexact degrade pair — no fallback needed for any of these three
primitives; nothing in this pass found a reason to fall back to "plain ongoing notification" or
"heads-up alarm only" as the *chosen* design (those remain the correct **degrade paths** the code
already implements for the denied/below-SDK cases, per the phase's own requirements table). Phase
50 can build its real `cp-android-surfaces` module directly on these three verified primitives.

## Founder follow-ups

- **Physical API 36+ device**: install a `development`-profile or the `e2e-test` EAS build, then
  follow `tools/spikes/android-surfaces/README.md`'s checklist — confirm the Glance widget renders
  after adding it via long-press, confirm the promoted Live Update chip appears in the status bar,
  and confirm the alarm activity shows over the lock screen once FSI + exact alarm are granted (and
  that the heads-up-notification degrade path still works when they're denied).
- **Firebase project + service account**: set `GOOGLE_APPLICATION_CREDENTIALS` and
  `FCM_TEST_DEVICE_TOKEN`, then rerun `pnpm --filter @cp/spikes run android-surfaces` to prove the
  real FCM transport (not just the local test hook) reaches `AndroidSurfacesMessagingService`.
- **EAS Android build infrastructure**: `.eas/workflows/e2e-android.yml` already documents that the
  project's current (c3d-standard) Android build infrastructure doesn't support the nested
  virtualization the Maestro emulator job needs; a founder with dashboard access needs to switch it
  back to n2-standard before any Android Maestro flow (this one included) can finish past the build
  step.
- **OEM verification table**: `tools/spikes/android-surfaces/README.md` has a blank table for
  recording per-device promoted-notification/FSI/exact-alarm default behavior — some OEM
  notification-shade customizations are known to suppress promoted-notification chips.

## Founder device run

| Device | OS build | Glance widget renders snapshot | Live Update promoted chip visible | Alarm activity over lock screen (granted) | Heads-up degrade (denied) |
|---|---|---|---|---|---|
| _pending_ | | | | | |

## Rerun

```
cd apps/mobile && ANDROID_HOME=$HOME/Library/Android/sdk npx expo prebuild --platform android --no-install
cd android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew --max-workers=2 \
  -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m" -PreactNativeArchitectures=arm64-v8a \
  :cp-spike-android:testDebugUnitTest :app:processDebugMainManifest :app:processDebugResources
rm -rf ../android  # generated output, gitignored; delete when done — disk is shared and small
pnpm --filter @cp/spikes run android-surfaces
pnpm e2e:cloud -- --platform android --flows e2e/spikes/android-surfaces.yaml
```
