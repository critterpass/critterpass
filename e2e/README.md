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
| `build_url`  | Artifact URL(s) to install instead of the fingerprint-matched e2e-test build: `.tar.gz` for iOS, `.apk` for Android, space-separated for both.       |
| `shards`     | Parallel shards per platform (default 3).                                                                                                            |
| `appearance` | `light` or `dark`.                                                                                                                                    |
| `preset`     | `sweep` runs the UI sweep (below) in `compare` mode; with `pr` empty the images go to the "Nightly UI sweep" issue. `happy` runs the release gate (below). |

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
every one for review. A screen that is sparse on purpose opts out of `EMPTY_SCREEN` (and only that
check) in `tools/scripts/ci-device/sparse-by-design.ts`, the pixel checks' counterpart: its shot
name's ending, with the render or undesigned-state row that makes it sparse. A screen that is bare
because content never drew is a bug to fix, never an entry there.

Each run is titled after its mode, branch, pull request, platform and flows, and dispatching the
same flows on the same branch again cancels the older run.

### Builds

e2e-test builds are made on GitHub's runners, never on EAS's paid builders:

```sh
gh workflow run native-build.yml -f ref=<branch> -f profile=e2e-test -f platform=android  # or ios
```

A build costs nothing and takes about 30 to 55 minutes. Staging and store builds, where their
binaries live, how updates target a build and the secrets involved are in
`docs/runbooks/release.md` ("Where builds run").

Each build is attached to a GitHub release named
`native-e2e-test-<platform>-<fingerprint, 12 characters>-<run id>`, with a manifest (profile,
platform, native fingerprint, commit, versions) as the release body. The prepare job computes the
commit's native fingerprint and installs the newest release build whose manifest carries exactly
that fingerprint; while there is none it looks for a finished EAS build with it. When neither
exists it stops (it never falls back to another build), says how to make one, and names the latest
EAS build's URL to pass as `build_url` if its native code still fits. A branch that changes native
code needs its own build first; a JS-only branch reuses main's.

The lookup fingerprint of an e2e-test build leaves the Firebase config out on both sides (the
prepare job has no such secret), so on Android it is not the runtime version baked into the APK;
the manifest lists both. Device runs install their own JS with updates off, so that never matters.

Scheduled runs (the nightly sweep and the daily release gate) have no `build_url` input. The repo
variable `DEVICE_SCHEDULED_ANDROID_BUILD_URL` names an `.apk` they install instead of the matching
build, and the prepare job says so every time ("scheduled run uses the build in
DEVICE_SCHEDULED_ANDROID_BUILD_URL: <url>"). Manual and pull-request runs ignore it. Delete it
(`gh variable delete DEVICE_SCHEDULED_ANDROID_BUILD_URL`) once main has an Android e2e-test build
on GitHub, so scheduled runs go back to the matching build.

The workflow needs the `EXPO_TOKEN` secret (the fingerprint, and the EAS `development`
environment's `EXPO_PUBLIC_*` values for the bundle) and `OTP_TEST_CODE`
(`e2e/onboarding/save-phone.yaml`). It never starts a build.

### Isolation

The local tools publish the current JS to the shared `e2e-test` update channel, so two runs at
once could load each other's JS. The workflow never publishes an update:

1. The prepare job finds the newest e2e-test build for the native fingerprint (or takes
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

### Shards planned by time

`tools/scripts/ci-device/plan-shards.ts` balances a run's shards by total flow time, not by count:
the longest flow first, each to the shard with the least time so far. The times are the median
minutes of each flow's passing Android runs in the release gate's reports, kept in
`tools/scripts/ci-device/flow-durations.ts`; a flow with no row counts as five minutes. The plan
step prints each shard's flows and their minutes.

### One retry and a time limit per flow

A flow that fails runs once more on a relaunched app (`tools/scripts/ci-device/flow-attempts.ts`).
When the second run passes, the flow is reported as **passed on retry**, never as a plain pass: in
the shard's log (a warning annotation), the job summary's table, the flow's JUnit report (an
`outcome` property with the first failure's message) and the pull request or issue comment, so a
flaky flow stays visible. The first run's JUnit report, Maestro output, failure screen, logs and
video are kept under `first-failure/` in the shard's artifact. A second failure fails the shard.

A flow that runs longer than 90 minutes (three times the longest median the release gate has
recorded) is stopped and reported as **timed out**; it is not run again. Pass
`-f flow_timeout=<minutes>` to a dispatch for a tighter or looser limit.

### Runner actions (push fixtures, network)

A flow can't run a shell command, so each shard serves device actions on `127.0.0.1:7788` while
its flows run (`tools/scripts/ci-device/runner-actions.ts`). At the step a flow's comments mark
"Runner: …", call it from a script:

```yaml
- evalScript: "${http.post('http://127.0.0.1:7788/push?fixture=e2e/notifications/fixtures/android-crew-chat.json', { body: '{}' }).status}"
- evalScript: "${http.post('http://127.0.0.1:7788/network?state=off', { body: '{}' }).status}"
```

Maestro's `http.post` needs a body, so pass one even when the action ignores it. `/type` types its
body into the focused field (Android; iOS answers 501), for fields where Maestro's `inputText` would
wait for the screen after every character (`e2e/happy/bookings.yaml`). `/push` fills the fixture's `${CREW_ID}` and `${CREW_NAME}` from the repository variables
`E2E_CREW_ID` and `E2E_CREW_NAME` (also passed to every flow) and delivers it with
`xcrun simctl push` on iOS or the FCM receive broadcast (as root) on Android. `/network` turns
Wi-Fi and mobile data off or on (Android only; iOS answers 501). Each call answers 200 once done,
and logs a line in the shard's output.

`/scenario?name=…` starts a script that drives other people through the api of the build under
test, and `/scenario-output?name=…` answers 200 once it is done (202 while it runs, 500 if it
failed). The scripts sign simulated travellers up, join them with the crew's code and act with real
commands, reading the ids they need from the sync service as a phone would
(`tools/scripts/seed-sync-rows.ts`):

| Scenario    | Script                                   | What the other people do                                                                 |
| ----------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `trip-day`  | `tools/scripts/seed-trip-day.ts`         | five travellers join the crew behind `code`; `up=N` of them say they are up for the day |
| `trip-pack` | `tools/scripts/seed-trip-pack.ts`        | one more joins and adds (`action=add`) or removes the shared pack item `label`          |
| `live-map`  | `tools/scripts/live-map-sim/by-code.ts`  | crewmates join, share their location and walk to the meet-up on `trip`                  |

The runner is on the host, so a flow can start a scenario while the device has no network
(`e2e/trip/offline/conflict-android.yaml`). Map pins are drawn by the map view and are not in
Android's hierarchy: assert on the panel under the map (`e2e/crew/live-map/share-and-meetup.yaml`).

### Android emulators

Each Android shard boots a fresh `system-images;android-35;google_apis;x86_64` emulator (Pixel 7
profile, 4 cores, 4 GB, software GPU). Before the flows, `android-device.sh` waits for the package
manager, turns off the lock screen, animations and the system "isn't responding" dialogs (a slow
emulator often trips one in the launcher, and it covers the app), checks that the emulator resolves
and reaches the api (`network-preflight.ts`, with `E2E_API_BASE_URL`: it turns Wi-Fi and mobile data
off and on once when the check fails, and a second failure ends the shard with "Device cannot reach
the api" before any flow waits on data that cannot arrive), installs the APK with every
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
`e2e/_shared/seed-demo.yaml`), with the keyboard up wherever a screen has a field. Screens no seed
reaches are swept from their developer labs (`labs-*` scenarios, Android only): they run the areas'
own `${PREFIX}` scene subflows, or `subflows/lab-scene.yaml` for one scene, with the sweep's
language, and the coverage report follows those files for their screenshots. The steps live in
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

Section 7 planning screens (`7a-1` … `7i-2`) name shots `<lang>-7x-n-<state>` like every design id (`en-7b-1-day`, `vi-7f-1-add`); a state the design does not draw keeps the nearest 7x id plus a state suffix (`en-7b-1-member-suggest`), never an old `3d`/`3e` id.

## Release gate (happy paths)

`e2e/happy/` holds one flow per user journey, each run end to end against **staging** with real
sessions and data: every flow starts from a fresh install, onboards its own account through the
api (`subflows/fresh-account.yaml`), takes a staging demo seed scenario when it needs a crew
(`e2e/_shared/seed-demo.yaml`) and drives the rest through the app's real commands, asserting the
journey's outcomes (the message sent and answered, the vote closed, the expense settled), not just
that screens render. Nothing is mocked: the draft, the redraft and reading a pasted booking run on
staging's AI, so those flows allow a few minutes for them.

| Flow             | Journey                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `onboarding`     | fresh account → pass issued → Home, and the session survives a relaunch          |
| `home-inbox`     | Home's countdown, plan progress, tip and bell → inbox → answer a card → undo     |
| `chat`           | crew chat: send a message, a crewmate replies                                    |
| `vote`           | pitch a place → board → vote → go to the final → vote → reveal                   |
| `setup`          | from the reveal: dates → budget → rooms → must-dos → DRAFT MY TRIP               |
| `drafting`       | setup, then the draft ready → private review → change a day → keep               |
| `money`          | add an expense → balances → settle up (request, then confirm it arrived)         |
| `bookings`       | paste a confirmation → candidate → ADD → wallet stack → the flight's details     |
| `suppliers`      | activity cards → OPEN KLOOK → click recorded → the partner redirect              |
| `fresh-wallet`   | no seed: crew of one → Money in VND → BOOKINGS/MONEY → forward address → SAVE    |
| `fresh-join-code` | no seed: a second new account → splash "Got a code?" → JOIN → the pass asks for name and home → ISSUE → manifest |
| `fresh-join-code-vi` | the same friend, reading the app in Vietnamese from the splash on |
| `critters`       | fresh account → PASS Critterdex synced → FOUND empty → a set page → Explore at home kept after a relaunch |
| `fresh-setup-vnd` | no seed: crew of one from Ho Chi Minh City (VND) → Đà Nẵng locked in → dates from tomorrow, 3 days → budget in ₫ locks first time → rooms |
| `fresh-join-under-way` | no seed, four accounts: a trip from today confirmed → one joins with the crew code → on the trip (plan, split three ways); one who joined before the lock and never answered → JOIN THE TRIP on Home |
| `fresh-trip-under-way` | no seed: crew of one from Ho Chi Minh City → Đà Nẵng from today, 3 days, budget in ₫ → draft → LOCK IT IN alone → Home and the TRIPS hub show the trip as on |
| `fresh-uncurated-draft` | no seed: crew of one → Đà Lạt (open-data places only) two weeks out, 3 days, one typed must-do → the draft names a stop on every day → CHANGE A DAY redrafts day 2 → KEEP IT → Explore shows picks for Đà Lạt |
| `fresh-trip-bookings` | on that trip: paste the flight and a stay → READY TO ADD → the forward address → a flight and an activity typed in by hand → wallet, details in airport time, hub count → delete leaves no card |
| `fresh-trip-money` | on that trip: three typed expenses in ₫ → SPENT SO FAR, LATEST, history, detail, the budget on day 1 of 3 |
| `fresh-trip-day` | on that trip: hub on day 1 of 3 → day-of screen (tomorrow's, then back to today) → pack list → background and reopen → relaunch → the briefing settles |
| `fresh-trip-landing` | no seed: a trip from tomorrow, its flight today typed in by hand → I LANDED → Home turns to the trip being on |
| `fresh-trip-plan` | on that trip: PLAN opens the trip map → day 1's plan → search → Add to plan → ADD → the stop moved to day 2 (all days shows it) → a place saved with ♡ in Ideas → the plan check → after a relaunch day 2 still has the stop |

The `happy` preset records every flow on video (`screenrecord` in three-minute segments on Android,
`simctl io recordVideo` on iOS; `tools/scripts/ci-device/screen-video.ts`) and the publish job builds
the report (`tools/scripts/ci-device/release-gate.ts`): per flow and platform, pass or fail, the time,
an inline GIF preview, a link to the MP4 and, when it failed, Maestro's failing step with the screen
at that moment, plus the app's `[ui-qa]` reports. The media goes to the private repository's
`screenshots` branch (the newest 30 runs are kept) and the report to one comment on the open
"Release gate" issue, and to the job summary. Android runs on ten shards (flows are independent);
iOS uses the `shards` input.

It runs daily on main (Android) and on demand. **Before submitting a build to TestFlight**, run it
on both platforms with the new builds:

```sh
# Both find the e2e-test build that matches the native fingerprint (see Builds above):
gh workflow run device.yml -f preset=happy -f platform=android
gh workflow run device.yml -f preset=happy -f platform=ios -f shards=3
```

Add `-f pr=<n>` to post the report to a pull request instead of the issue, and `-f flows=...` to run
some of the flows.

### Adding a flow

1. Add `e2e/happy/<journey>.yaml`: start with `subflows/fresh-account.yaml` (with `SEED` set to a
   `dev-seed-demo…` button when the journey needs the demo crew), reuse the area's own subflows,
   and assert each step's outcome with `extendedWaitUntil` on what the api's answer puts on screen.
   Name the file after the journey; the report shows that name.
2. When the journey needs data no seed scenario makes (a trip mid-setup, a ready plan), add the
   step to the demo seed (`services/api/src/dev/`, with its db test) and its button to the app's
   Developer tools, or reach it through the app as `drafting.yaml` does.
3. Run it: `gh workflow run device.yml -f preset=happy -f platform=android -f flows=e2e/happy/<journey>.yaml`.
4. Add it to the table above.

### Writing flows that pass on iOS

- A plain `View`'s id inside an `accessible` parent (a day card, a chat bubble) is not in iOS's
  hierarchy: find it by the parent's label, or put the id on the accessible view.
- iOS reads a grouped element as one label ("Winston, 17:07: Fushimi Inari at sunrise", "Day 1,
  Sat, …", an address with its copy hint): match text with `'.*…'` on both sides.
- A `Sheet`'s root id is not in iOS's hierarchy: wait on `<id>-panel`.
- An element behind a footer, a keyboard or below the fold still counts as visible: hide the
  keyboard and `scrollUntilVisible` before tapping, and never trust an unscrolled tap on a long
  list (the dev gallery: `e2e/home/subflows/pick-gallery-locale.yaml`).
- Once a trip turns on, its welcome page (`critters-hatch-later`) can come up over Home at any
  later step: wait for Home or the page, and pass it.

## UI review gate

`.github/workflows/ui-review.yml` adds the `ui-reviewed` check to every pull request. When the pull
request changes `apps/mobile/src/app/**`, `features/**` or `ui/**` (tests, mocks, snapshots and
test support aside), the check fails until the pull request carries the `ui-reviewed` label. The
reviewer applies it only after reading the pull request's design | device sheets (device workflow,
`mode: compare`, or `preset: sweep` for broad changes). A later push that changes those files
again removes the label, so the new sheets need a new review.
