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
| Secrets (names only): `EXPO_ASC_API_KEY_P8`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `GOOGLE_SERVICES_JSON_CONTENT_PRODUCTION`, `GOOGLE_PLAY_SUBMIT_JSON`, `SENTRY_AUTH_TOKEN` | repository secrets, or secrets of the `production` environment | not set (`gh secret list`, 2026-10-07); `build` for Android, `submit` and `health` stop with an error naming the missing one. `SENTRY_AUTH_TOKEN` is also what a build uploads source maps with: EAS does not hand its own copy to a build that runs on GitHub, so a production build stops without it |
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

| Still on EAS | What for |
|---|---|
| Credentials service (`EXPO_TOKEN`) | the iOS distribution certificate and provisioning profiles (app and extensions), the Android keystore |
| Remote app version | the store build number (`appVersionSource: remote`, `autoIncrement`) |
| Environment variables | the profile's `EXPO_PUBLIC_*` values; variables with secret visibility and the Firebase file are not handed to a local build and come from GitHub secrets instead |
| EAS Update | JS updates to the `staging` and `production` channels (billed by monthly active users) |
| EAS Submit | `eas submit --path <binary>` uploads to App Store Connect and Google Play |

Staging builds: `gh workflow run native-build.yml -f ref=<ref> -f profile=staging -f platform=ios`
(add `-f submit=true` to send it to TestFlight or Play internal testing when it is built; that needs
the App Store Connect key secrets or `GOOGLE_PLAY_SUBMIT_JSON`). A store binary is a run artifact
(`native-<profile>-<platform>`, seven days) and is never attached to a release, because release
assets of this public repository are public; its release (`native-<profile>-<platform>-
<fingerprint>-<run id>`) carries only the manifest. Builds made here have no EAS build id.

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
