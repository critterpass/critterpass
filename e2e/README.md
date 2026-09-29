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
- **On a pull request:** add the `device-run` label. The run covers the full suite on iOS in
  `flows` mode and repeats on every push while the label stays. Android runs are manual
  (`platform: android` or `both`). Pull requests from forks never run it.

| Input        | Meaning                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`   | `ios`, `android` or `both`.                                                                                                                           |
| `flows`      | Flow files, folders or globs, separated by spaces or commas. Empty runs the full suite (every `e2e/<area>/*.yaml` except `_shared` and `spikes`).     |
| `mode`       | `flows` (pass/fail), `capture` (screenshots posted to `pr`) or `compare` (`pnpm screens:compare` sheets posted to `pr`).                              |
| `pr`         | The pull request that gets the images in `capture` and `compare` modes.                                                                              |
| `build_url`  | EAS artifact URL(s) to install instead of the fingerprint-matched e2e-test build: `.tar.gz` for iOS, `.apk` for Android, space-separated for both.   |
| `shards`     | Parallel shards per platform (default 3).                                                                                                            |
| `appearance` | `light` or `dark`.                                                                                                                                    |

Every shard uploads an artifact `device-<platform>-shard-<n>` with JUnit reports, Maestro's logs
and failure screenshots, the flows' `takeScreenshot` images and `ui-qa.log`. As with
`pnpm screens:capture`, a failed flow or any `[ui-qa]` report fails the shard, and each shows up
as an annotation and in the job summary. In `capture` and `compare` modes the images go to the
orphan `screenshots` branch under `<pr>/run-<run id>/`, and one comment on the pull request
embeds them.

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
   `expo.modules.updates.ENABLED` to false in the compiled manifest, zipaligns and signs it with a
   throwaway debug key, and installs it on its own emulator. Image assets new since the build are
   missing on Android (they live in the APK's compiled resources); iOS gets them with the bundle.

The prepare job fails when the exported bundle does not carry the commit, and every iOS shard
first runs `tools/scripts/ci-device/js-commit.yaml`, which reads the Developer tools build marker
(`update:embedded js:<commit>`) to prove the app runs this run's JS.

The scripts live in `tools/scripts/ci-device/`.
