# Release: production builds, store submission and staged rollout

Who: the founder starts every step. Agents never dispatch this workflow, start production builds or
submit to a store. The workflow `.github/workflows/release.yml` runs only by hand, one run at a
time, and only when its `confirm` input is exactly `release production`. It has been linted
(`actionlint`) and **has never been run**: the first use of each action is its test, so read its
log before going on.

## Before the first release (one-time setup)

| Item | Where | State on 2026-10-07 |
|---|---|---|
| Required reviewer on the `production` environment, so each run waits for approval | GitHub → Settings → Environments | not set: only `staging` exists; GitHub creates `production` on the first run without protection, so create it and add the reviewer first |
| Secret (name only): `EXPO_TOKEN` | repository secrets | present (`gh secret list`, 2026-10-07) |
| Secrets (names only): `EXPO_ASC_API_KEY_P8`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `GOOGLE_SERVICES_JSON_CONTENT_PRODUCTION`, `GOOGLE_PLAY_SUBMIT_JSON`, `SENTRY_AUTH_TOKEN` | repository secrets, or secrets of the `production` environment | present as repository secrets (`gh secret list`, 2026-10-07); a step that needs a missing one stops with an error naming it. `SENTRY_AUTH_TOKEN` is also what a build uploads source maps with: EAS does not hand its own copy to a build that runs on GitHub, so a production build stops without it |
| iOS phased release: `"apple": { "release": { "phasedRelease": true, "automaticRelease": false } }` | `apps/mobile/store.config.json` | missing; `submit` and `preflight` fail for iOS until it is there |
| Play staged release: `"releaseStatus": "inProgress", "rollout": 0.01` (or `"draft"`) under `submit.production.android` | `apps/mobile/eas.json` | missing: today's profile would release to 100%; `submit` and `preflight` fail for Android until it is changed |
| App Review notes, demo account and age rating (`apple.review`, `apple.advisory`) | `apps/mobile/store.config.json` | missing |
| Privacy manifest for the app | `apps/mobile/app.config.ts` | missing (docs/compliance/app-privacy-labels.md) |
| Production Firebase config, production EAS environment variables (API, sync and realtime addresses) | EAS | unknown |
| Store forms: privacy labels, Data safety, age rating, Play policy declarations | consoles; proposals in docs/compliance and docs/play-policy-declarations.md | not filed |

## Launch gate (founder checklist)

- [ ] Every gate in docs/compliance/launch-evidence.md is met or accepted in writing
- [ ] Three consecutive green nightly journey runs
- [ ] Counsel has approved the legal documents; the external security review is closed
- [ ] Both stores have approved the build
- [ ] On-call is staffed for the first 48 hours (docs/runbooks/on-call.md)

## Steps

Every command needs `-f confirm="release production"`.

1. **Preflight** (read-only): `gh workflow run release.yml -f action=preflight -f ref=<sha>`.
   Checks that the commit is on `main`, that CI passed on it, and that the staged-rollout config
   above is in place.
2. **Build** (on GitHub's runners, no EAS build minutes): `-f action=build -f ref=<sha>
   -f platform=all`. After the checks, each platform's build job waits for the `production`
   environment's approval, builds with `eas build --local` and uploads the binary to the run
   (artifact `native-production-<platform>`, kept seven days). Note the run id: `submit` takes it.
   Each job's summary shows the build's manifest (version, build number, runtime version).
3. **Rehearse on staging first.** Install the staging store build of the same commit and walk the
   happy path; the halt rehearsal below is also done on the `staging` channel.
4. **Submit**: `-f action=submit -f ref=<sha> -f build_run_id=<run id of step 2>`. Only a
   `production` build of that same commit is accepted, and only within the seven days its binary is
   kept (build again after that: it costs nothing). Record the submission ids in
   docs/compliance/launch-evidence.md.
5. **Release.** iOS: after approval, release the version by hand in App Store Connect; the phased
   release then runs for seven days (1, 2, 5, 10, 20, 50, 100%). Android: the release starts at 1%;
   widen it in the Play Console to 5, 20, 50 and 100%, no faster than one step a day.
6. **Health** before each widening and daily during the rollout:
   `-f action=health -f sentry_release=app.critterpass@<version>+<build>`. Below the halt line the
   run fails; with fewer than 200 sessions it warns and nothing should be widened yet.

## Where builds run

Every native build runs on a GitHub-hosted runner with `eas build --local`
(`.github/workflows/native-build-job.yml`): Android on Linux, iOS on macOS 26 with Xcode 26.6.
The repository is public, so the runners cost nothing, and a local build uses no EAS build minutes.
Nothing is built on EAS's builders any more: never run `eas build` without `--local`, and never
start an EAS Workflow that builds.

```sh
gh workflow run native-build.yml -f ref=main -f profile=<e2e-test|staging> -f platform=<ios|android|all> [-f submit=true]
```

A build takes about 30 to 55 minutes. `submit=true` sends a staging build to TestFlight or Play
internal testing when it is built. Production builds go only through `release.yml` (the steps
above), behind the `production` environment's approval.

### Where a build goes

Every build gets a GitHub release tagged `native-<profile>-<platform>-<fingerprint, 12
characters>-<run id>`, whose body is the build's manifest as JSON: `profile`, `platform`,
`fingerprint`, `commit`, `appVersion`, `buildNumber`, `runtimeVersion` (read back from the binary),
`artifact`, `runId`, `createdAt` (`tools/scripts/ci-device/build-manifest.ts`). A store build whose
baked runtime version is not the fingerprint could never receive an update, so that fails the build.

| Profile | Binary | Kept |
|---|---|---|
| `e2e-test` | attached to the release (simulator `.tar.gz`, x86_64 `.apk`) and a run artifact | the release stays; the artifact 30 days |
| `staging`, `production` | run artifact `native-<profile>-<platform>` only: release assets of this public repository are public, so a signed store binary is never attached | seven days |

Builds made here have no EAS build id and do not appear on expo.dev.

### How device runs find a build

`device.yml` computes the commit's native fingerprint and installs the newest `e2e-test` release
build whose manifest carries exactly that fingerprint (`tools/scripts/ci-device/resolve-build.ts`);
`build_url` overrides it. It never starts a build: a branch that changes native code needs its own
`e2e-test` build first, and a JS-only branch reuses main's. Details: `e2e/README.md`.

### How updates target a build

The runtime version is the native fingerprint, so an update reaches only builds with the same
native code. `staging-update.yml` publishes a ref's JS to the `staging` channel after comparing the
ref's fingerprint with the installed build's, read from the build manifests
(`tools/scripts/ci-device/update-target.ts`):

```sh
gh workflow run staging-update.yml -f ref=main -f message="…"                  # iOS, newest staging build
gh workflow run staging-update.yml -f ref=main -f android=latest -f ios=""     # Android only
gh workflow run staging-update.yml -f ref=main -f ios=<fingerprint or release tag>
```

| Input | Names the installed build by |
|---|---|
| `ios`, `android` | `latest` (the platform's newest `native-staging-…` release), a release tag, or a fingerprint (whole, or the 12 characters a tag shows); empty skips the platform. `ios` defaults to `latest`, `android` to empty |
| `ios_build_id`, `android_build_id` | the EAS build id of a build made on EAS before the move; used instead of the input above when given |

A platform whose installed build has another fingerprint is never published to: the run fails for
it and says a new build is needed. So is one with no verdict (no staging build recorded, an
unreadable manifest, EAS unreachable). `latest` means the newest build made, which is not always
the one on the phone: while a newer build waits in TestFlight, pass the installed build's tag or
fingerprint. A build made on EAS has no manifest: pass its EAS build id, or its fingerprint when known.

### Secrets (names only)

| Secret | Used by |
|---|---|
| `EXPO_TOKEN` | every build, device run and update: the fingerprint, the EAS environment's `EXPO_PUBLIC_*` values, credentials, the build number, `eas update`, `eas submit` |
| `EXPO_ASC_API_KEY_P8`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID` | the App Store Connect key: iOS signing in a build, and submitting to TestFlight or the App Store |
| `GOOGLE_PLAY_SUBMIT_JSON` | submitting to Google Play |
| `GOOGLE_SERVICES_JSON_CONTENT` | the Firebase config of `e2e-test` and `staging` Android builds, and the Android fingerprint in `staging-update.yml` |
| `GOOGLE_SERVICES_JSON_CONTENT_PRODUCTION` | the Firebase config of production Android builds |
| `SENTRY_AUTH_TOKEN` | source map upload in store builds; `release.yml`'s health check |

### What still uses EAS

| Still on EAS | What for |
|---|---|
| Credentials service (`EXPO_TOKEN`) | the iOS distribution certificate and provisioning profiles (app and extensions), the Android keystore |
| Remote app version | the store build number (`appVersionSource: remote`, `autoIncrement`) |
| Environment variables | the profile's `EXPO_PUBLIC_*` values; variables with secret visibility and the Firebase file are not handed to a local build and come from GitHub secrets instead |
| EAS Update | JS updates to the `staging` and `production` channels (billed by monthly active users) |
| EAS Submit | `eas submit --path <binary>` uploads to App Store Connect and Google Play |

## Halt criteria

Halt at once when any of these holds; widen only when none has held for 24 hours.

| Signal | Line | Source |
|---|---|---|
| Crash-free sessions of the release | below 99.5% over 24 hours | Sentry release health (`tools/scripts/perf/release-health.ts`) |
| Any P1 alert | firing | docs/runbooks/alerts, docs/runbooks/on-call.md |
| Data-loss, sign-in, payment or sync defect reported by a user | one confirmed report | support inbox, feedback tickets |

## How to halt

| Where | Action |
|---|---|
| App Store | App Store Connect → the version → Pause Phased Release (up to 30 days). People who already have the build keep it; to stop new downloads entirely, remove the version from sale |
| Google Play | Play Console → Production → Halt rollout. Fix forward with a new build, or resume |
| JS update | republish the last good update: `npx eas-cli update:republish --channel production --group <last good group id>`, or end the rollout with `npx eas-cli update:edit` |
| Server-side | switch the affected feature off with its kill switch in the admin console (no release needed) |

Then follow docs/runbooks/incident.md.

## Update channel policy (EAS Update)

- The `production` channel serves production store builds only; the runtime version is the native
  fingerprint (`runtimeVersion: { policy: 'fingerprint' }` in `apps/mobile/app.config.ts`), so an
  update reaches only builds with the same native code. A change to native code needs a new build
  and a new store review.
- Updates carry JS and assets for fixes and copy. Anything that changes what App Review approved
  (new purchases, new permissions, a changed core flow) goes through a store build instead.
- Every production update is first published to `staging` (`staging-update.yml`) and walked there.
- Production updates start at 10% (`-f action=update -f rollout_percent=10 -f message="…"`), then
  widen after a healthy `health` run. Production builds check for updates in the background and
  apply them on the next launch (expo-updates' default; the app config never blocks launch on it).

## Rehearsal (not done)

Halting has not been rehearsed. On staging: publish an update to part of the `staging` channel,
republish the previous one, and confirm a device returns to it; pause and resume a TestFlight
phased build is not possible, so the App Store pause is rehearsed only by reading the console
screens. Record the date and result here.
