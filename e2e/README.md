# Maestro flows

One folder per area (`e2e/<area>/*.yaml`); `subflows/` and `_shared/` hold pieces other flows
run, and `spikes/` holds exploratory flows outside the suite. Flows named `*-ios.yaml` or
`*-android.yaml` run on that platform only.

## Device runs on GitHub Actions

`.github/workflows/device.yml` runs flows, screenshot captures and design | device sheets on
GitHub-hosted runners, split into parallel shards: iOS on `macos-26` simulators (three at a time,
leaving the plan's other macOS slots to CI) and Android on `ubuntu-latest` KVM emulators (API 35,
x86_64 Google APIs image). No local simulator is involved.

### Triggering

- **Manually:** Actions → device → Run workflow, or
  `gh workflow run device.yml -f platform=ios -f flows="e2e/smoke e2e/home"`.
- **On a pull request:** add the `device-run` label. The run covers the full suite on Android in
  `flows` mode and repeats on every push while the label stays. iOS runs are manual
  (`platform: ios` or `both`): GitHub gives the plan only a couple of macOS runners, so anything
  that isn't iOS-specific (safe areas, the keyboard, modal presentation) runs on Android. Pull
  requests from forks never run it.

| Input        | Meaning                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`   | `ios`, `android` or `both`.                                                                                                                           |
| `flows`      | Flow files, folders or globs, separated by spaces or commas. Empty runs the full suite (every `e2e/<area>/*.yaml` except `_shared` and `spikes`).     |
| `mode`       | `flows` (pass/fail), `capture` (screenshots posted to `pr`) or `compare` (`pnpm screens:compare` sheets posted to `pr`).                              |
| `pr`         | The pull request that gets the images in `capture` and `compare` modes.                                                                              |
| `build_url`  | EAS artifact URL(s) to install instead of the fingerprint-matched e2e-test build: `.tar.gz` for iOS, `.apk` for Android, space-separated for both.   |
| `shards`     | Parallel shards per platform (default 3).                                                                                                            |
| `appearance` | `light` or `dark`.                                                                                                                                    |
| `preset`     | `sweep` runs the UI sweep (below) in `compare` mode; with `pr` empty the images go to the "Nightly UI sweep" issue.                                   |

Every shard uploads an artifact `device-<platform>-shard-<n>` with JUnit reports, Maestro's logs
and failure screenshots, the flows' `takeScreenshot` images and `ui-qa.log`. As with
`pnpm screens:capture`, a failed flow or any `[ui-qa]` report fails the shard, and each shows up
as an annotation and in the job summary. In `capture` and `compare` modes the images go to the
orphan `screenshots` branch under `<pr>/run-<run id>/`, and one comment on the pull request
embeds them.

Every screenshot a shard takes also goes through three pixel checks
(`tools/scripts/ci-device/screen-checks.ts`), and any finding fails the shard like a `[ui-qa]`
report, lands in `screen-checks.log` and is listed at the top of the pull request comment:

- `SCREEN_FRAME`: both side edges are one colour that isn't the app background (`semantic.bg.base`)
  and give way to the screen at the same inset down most of its height: the screen sits in an inset
  card or a dark frame.
- `KEYBOARD_BAND`: with the keyboard up, a full-width band of one colour that isn't the screen's
  own background sits right above it (a footer pushed up with a black gap under it).
- `EMPTY_SCREEN`: under a quarter of the screen's rows show anything but its background.

`pnpm tsx tools/scripts/ci-device/screen-scan.ts <dir>` runs them on any folder of screenshots.

The app's own `[ui-qa]` reports come from dev and e2e builds (`apps/mobile/src/ui/qa`): cut or
split text, one-line labels that wrapped, stickers without their edge or image, Home header controls
that overlap or leave the screen, pushed screens with no back or close control, and icons that
draw nothing. A label the design does set on two lines says so on its `Text` with
`singleLine={false}`, the one exemption from the wrap check; `git grep 'singleLine={false}'` lists
every one for review.

Each run is titled after its mode, branch, pull request, platform and flows, and dispatching the
same flows on the same branch again cancels the older run. When no e2e-test build matches the
native fingerprint the prepare job stops (it never falls back to another build) and names the
latest build's URL to pass as `build_url` if its native code still fits.

The workflow needs the `EXPO_TOKEN` secret (build lookup by fingerprint, and the EAS
`development` environment's `EXPO_PUBLIC_*` values for the bundle) and `OTP_TEST_CODE`
(`e2e/onboarding/save-phone.yaml`). Builds come from EAS; the workflow never starts one.

### Isolation

The local tools publish the current JS to the shared `e2e-test` update channel, so two runs at
once could load each other's JS. The workflow never publishes an update:

1. The prepare job finds the latest finished e2e-test build for the native fingerprint (or takes
   `build_url`), exports this commit's JS once per platform with `expo export:embed --bytecode`
   (Hermes, the development variant, the commit inlined as `EXPO_PUBLIC_JS_COMMIT`) and plans
   the shards.
2. Each iOS shard copies the simulator `.app`, replaces `main.jsbundle` and its assets, sets
   `EXUpdatesEnabled` to false and `EXUpdatesCheckOnLaunch` to `NEVER` in `Expo.plist`, re-signs
   it ad hoc and installs it on its own fresh simulator.
3. Each Android shard replaces `assets/index.android.bundle` in the APK, sets
   `expo.modules.updates.ENABLED` to false and `extractNativeLibs` to true in the compiled manifest
   (so an arm64-only build loads its libraries through the emulator's ARM translation), zipaligns
   and signs it with a throwaway debug key, and installs it on its own emulator. Image assets new
   since the build are missing on Android (they live in the APK's compiled resources); iOS gets
   them with the bundle.

The prepare job fails when the exported bundle does not carry the commit, and every shard
first runs `tools/scripts/ci-device/js-commit.yaml`, which reads the Developer tools build marker
(`update:embedded js:<commit>`) to prove the app runs this run's JS.

### Runner actions (push fixtures, network)

A flow can't run a shell command, so each shard serves device actions on `127.0.0.1:7788` while
its flows run (`tools/scripts/ci-device/runner-actions.ts`). At the step a flow's comments mark
"Runner: …", call it from a script:

```yaml
- evalScript: ${http.post('http://127.0.0.1:7788/push?fixture=e2e/notifications/fixtures/android-crew-chat.json').status}
- evalScript: ${http.post('http://127.0.0.1:7788/network?state=off').status}
```

`/push` fills the fixture's `${CREW_ID}` and `${CREW_NAME}` from the repository variables
`E2E_CREW_ID` and `E2E_CREW_NAME` (also passed to every flow) and delivers it with
`xcrun simctl push` on iOS or the FCM receive broadcast (as root) on Android. `/network` turns
Wi-Fi and mobile data off or on (Android only; iOS answers 501). Each call answers 200 once done,
and logs a line in the shard's output.

### Android emulators

Each Android shard boots a fresh `system-images;android-35;google_apis;x86_64` emulator (Pixel 7
profile, 4 cores, 4 GB, software GPU). Before the flows, `android-device.sh` waits for the package
manager, turns off the lock screen, animations and the system "isn't responding" dialogs (a slow
emulator often trips one in the launcher, and it covers the app), installs the APK with every
runtime permission granted, and launches it once: a crash on start fails the shard at once, with
the crash log printed and `failures/launch.*` in the artifact. The e2e-test profile builds
`arm64-v8a` and `x86_64`, so the app runs natively; older arm64-only builds run through ARM
translation, which is slower. A shard takes about 3 minutes to boot and install, then about 5 to 8
minutes per gallery flow.

The scripts live in `tools/scripts/ci-device/`.

## UI sweep

`e2e/screens/sweep/` visits every user-facing screen and sheet the app can reach, in English and
Vietnamese: one flow per demo seed scenario (`onboarding`, `first-run` for an account with no crew,
then the `everyday`, `inbox`, `caught_up`, `vote` and `vote_final` seeds of
`e2e/_shared/seed-demo.yaml`), with the keyboard up wherever a screen has a field. The steps live in
`subflows/<scenario>.yaml` and name each screenshot `<lang>-<design id>-<state>` (or a route name
for screens without a design), so `compare` mode pairs it with its render. The top-level flows are
generated: after adding a scenario, run `pnpm tsx tools/scripts/ci-device/sweep-coverage.ts
--write`. The sweep is outside the full suite (`e2e/*/*.yaml`) and runs:

- on demand: `gh workflow run device.yml -f preset=sweep -f platform=android -f shards=7 [-f pr=<n>]`;
- every night on main (the `schedule` trigger): the whole sweep on Android, and its English flows
  on one iOS shard, posting the sheets, the check findings and the coverage report to the open
  "Nightly UI sweep" issue.

`sweep-coverage.ts` (no flags) prints the coverage report: the screens the app registers
(`registerScreens`) and the routes under `apps/mobile/src/app` with no sweep screenshot. Every
route is listed in its `ROUTE_SHOTS` table with the screenshots that show it, or why the sweep can't
reach it. Gaps don't fail CI (other areas add screens at their own pace); they show in every sweep
comment, so add the missing steps to the sweep when a new screen or route appears there.

## UI review gate

`.github/workflows/ui-review.yml` adds the `ui-reviewed` check to every pull request. When the pull
request changes `apps/mobile/src/app/**`, `features/**` or `ui/**` (tests, mocks, snapshots and
test support aside), the check fails until the pull request carries the `ui-reviewed` label. The
reviewer applies it only after reading the pull request's design | device sheets (device workflow,
`mode: compare`, or `preset: sweep` for broad changes). A later push that changes those files
again removes the label, so the new sheets need a new review.
