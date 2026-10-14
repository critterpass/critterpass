# Maestro flows

Every flow drives the premium UI, the app's only UI. `e2e/happy/` is the release gate,
`e2e/screens/` the design | device sweep, and the area folders keep the flows for what neither
covers (links, location, permissions, notifications, Live Activities, offline restore, sign-in);
`subflows/` and `_shared/` hold pieces other flows run, and `spikes/` holds the native-surface spikes
outside the suite. Flows named `*-ios.yaml` or `*-android.yaml` run on that platform only.

### Shared helpers

Shared helpers in `_shared/`: `tap.yaml` (an id, or the label when an iOS 26 toolbar or tab bar item
has no id in the hierarchy), `tab.yaml` (the system tab bar), `back.yaml` (one step back: the edge
swipe on iOS, the system back on Android), `back-to.yaml` (Cancel, ✕ or back until a mark shows),
`to-home.yaml`, `open-dev-tools.yaml` (Home's "Developer tools" entry at its foot, never
`openLink`), `open-link.yaml`, `switch-language.yaml` (PASS → Settings → Language) and
`seed-demo.yaml`.

## Device runs on GitHub Actions

`.github/workflows/device.yml` runs flows, screenshot captures and design | device sheets on
GitHub-hosted runners, split into parallel shards: iOS on `macos-26` simulators (three at a time,
leaving the plan's other macOS slots to CI) and Android on `ubuntu-latest` KVM emulators (API 35,
x86_64 Google APIs image). No local simulator is involved.

### Triggering

- **Manually:** Actions → device → Run workflow, or
  `gh workflow run device.yml -f platform=android -f flows="e2e/smoke e2e/happy/chat.yaml"`.
- **On a pull request:** add the `device-run` label. The run covers the three default journeys
  (`e2e/happy/onboarding.yaml`, `vote.yaml` and `money.yaml`: the short, stable ones) on Android in
  `flows` mode, one a shard, and repeats on every push while the label stays. It is not a required
  check. There is no "full suite" run: every `e2e/<area>/*.yaml` on three shards was hundreds of
  flows and never finished green, so an area's flows run when a dispatch names them, until the
  journey set replaces these three. iOS runs are manual
  (`platform: ios` or `both`): GitHub gives the plan only a couple of macOS runners, so anything
  that isn't iOS-specific (safe areas, the keyboard, modal presentation) runs on Android. Pull
  requests from forks never run it.

| Input        | Meaning                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`   | `ios`, `android` or `both`.                                                                                                                           |
| `flows`      | Flow files, folders or globs, separated by spaces or commas. Empty runs the three default journeys (`e2e/happy/onboarding.yaml`, `vote.yaml`, `money.yaml`).     |
| `mode`       | `flows` (pass/fail), `capture` (screenshots posted to `pr`) or `compare` (`pnpm screens:compare` sheets posted to `pr`).                              |
| `pr`         | The pull request that gets the images in `capture` and `compare` modes.                                                                              |
| `build_url`  | Artifact URL(s) to install instead of the fingerprint-matched e2e-test build: `.tar.gz` for iOS, `.apk` for Android, space-separated for both.       |
| `shards`     | Parallel shards per platform (default 3).                                                                                                            |
| `appearance` | `light` or `dark`.                                                                                                                                    |
| `flow_timeout` | Minutes one flow may run before it is stopped and reported as timed out (default 90; 20 for `happy`).                                             |
| `preset`     | `sweep` runs the UI sweep (below) in `compare` mode; with `pr` empty the images go to the "Nightly UI sweep" issue. `happy` runs the release gate (below). |

Every shard uploads an artifact `device-<platform>-shard-<n>` with JUnit reports, Maestro's logs
and failure screenshots, the flows' `takeScreenshot` images and `ui-qa.log`. As with
`pnpm screens:capture`, a failed flow or any `[ui-qa]` report fails the shard, and each shows up
as an annotation and in the job summary. In `capture` and `compare` modes the images go to the
orphan `screenshots` branch under `<pr>/run-<run id>/`, and one comment on the pull request
embeds them.

Every screenshot a shard takes also goes through six pixel checks
(`tools/scripts/ci-device/screen-checks.ts`), and any finding fails the shard like a `[ui-qa]`
report, lands in `screen-checks.log` and is listed at the top of the pull request comment:

- `SCREEN_FRAME`: both side edges are one colour that isn't the app background (`semantic.bg.base`)
  and give way to the screen at the same inset down most of its height: the screen sits in an inset
  card or a dark frame.
- `KEYBOARD_BAND`: with the keyboard up, a full-width band of one colour that isn't the screen's
  own background sits right above it (a footer pushed up with a black gap under it).
- `EMPTY_SCREEN`: under a quarter of the screen's rows show anything but its background.
- `SHEET_TOP_GAP`: an open sheet is empty for more than 5% of the screen under its grabber (or its
  top edge, for a sheet drawn without one): the top safe-area inset applied again inside the sheet,
  or a sheet whose body never drew. Its header row belongs right under the grabber.
- `SHADOW_CUT`: a soft shadow stops in a straight line over the ground it was fading into: the
  scroll row or box it sits in clips it (a chip row's shadows cut flat under the chips).
- `CARD_AT_EDGE`: a card's rounded corners sit at the screen's side, with no gutter.

Content under the status bar is judged in the app instead (`TEXT_UNDER_STATUS_BAR`, below): from
pixels alone a title under the clock can't be told reliably from a full-bleed photo or map, and
the status bar's height differs per phone.

`pnpm tsx tools/scripts/ci-device/screen-scan.ts <dir>` runs them on any folder of screenshots.

The app's own `[ui-qa]` reports come from dev and e2e builds (`apps/mobile/src/lib/qa`): cut or
split text, one-line labels that wrapped, stickers without their edge or image, Home header controls
that overlap or leave the screen, pushed screens with no back or close control, and icons that
draw nothing. Once a screen's layouts settle, its focused screens are also measured whole
(`layout-scan.ts`, read from React's committed tree, so no component opts in):

- `TEXT_OVERLAP`: two texts' glyphs drawn over each other (where the words of each line draw,
  without the leading a caption and its value share by design).
- `TEXT_OVER_CONTROL`: a text and a control it is not part of drawn over each other (an eyebrow
  under the back button, a title under a row's more button). A control laid over the whole text
  (a tap area over a card) is the text's own row.
- `TEXT_CLIPPED`: a text cut by an ancestor with `overflow: 'hidden'`.
- `TEXT_PAST_PADDING`: a text closer than 6 pt to the edge of the card it sits on (a surface with
  a ground and all four corners rounded, at least 120 × 56 pt).
- `TEXT_UNDER_STATUS_BAR`: a text above the top safe-area inset before anyone scrolls.
- `TEXT_SQUEEZED`: a text wrapped into four lines or more in under 40% of a card at least 280 pt
  wide (a guide's note whose action took most of the row).
- `CONTROL_MISALIGNED`: a text button stacked under a wide button with centred words, on the same
  surface, with its words off that centre (a "Cancel" set at the left edge under a centred primary).

What a surface drawn later covers is not judged (the card behind in a deck, the page under a
sheet, a panel over a photo, a card-sized control), a text its clip shows less than half of (the
reels of a rolling number) is judged only where its window shows it, nor are the words drawn into
artwork (a view read as one image, such
as a stamp). Content in a scroll view is only judged against the screen's fixed parts while it is
at rest and the fixed part is in the top 30% (a floating header), so content scrolling under a
header or sitting under a footer is not reported; map labels are never compared. Each report names
the screen (route) and the text's testID or nearest testID ancestor with its words (digits as `#`).
A label the design does set on two lines says so on its `Text` with
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
   `build_url`) and plans the shards; beside it from the run's start, the bundles job exports this commit's JS once per
   platform with `expo export:embed --bytecode` (Hermes, the development variant, the commit
   inlined as `EXPO_PUBLIC_JS_COMMIT`) while the shards boot their simulators and emulators, which
   wait for it (`tools/scripts/ci-device/wait-bundles.sh`).
2. Each iOS shard copies the simulator `.app`, replaces `main.jsbundle` and its assets, sets
   `EXUpdatesEnabled` to false and `EXUpdatesCheckOnLaunch` to `NEVER` in `Expo.plist`, re-signs
   it ad hoc and installs it on its own fresh simulator.
3. Each Android shard replaces `assets/index.android.bundle` in the APK, sets
   `expo.modules.updates.ENABLED` to false and `extractNativeLibs` to true in the compiled manifest
   (so an arm64-only build loads its libraries through the emulator's ARM translation), zipaligns
   and signs it with a throwaway debug key, and installs it on its own emulator. Image assets new
   since the build are missing on Android (they live in the APK's compiled resources); iOS gets
   them with the bundle.

The bundles job fails when the exported bundle does not carry the commit, and every shard fails
unless the app ran this run's JS in every flow: dev and e2e builds log `[qa-build] js:<commit>`
when they start, into the report log the `[ui-qa]` scan reads after each flow
(`tools/scripts/ci-device/js-commit-proof.ts`), so no flow opens Developer tools for it.

### The settled marker

Dev and e2e builds draw a 2pt invisible box at the screen's bottom-left corner
(`apps/mobile/src/lib/qa/settled-marker.tsx`): its id is `qa-settled` once the layout scan has
measured the screens shown, `qa-busy` from the next layout or navigation until then, and its label
is `js:<commit> path:<route>`. `_shared/settle.yaml` waits on it before every screenshot and after
taps, instead of `waitForAnimationToEnd` (which compares screenshots until two agree, seconds a
frame on a runner without a GPU), and `_shared/where.yaml` reads the route into `${output.where}`
so a flow can branch with a script condition: a `when: visible` on an element that is not there
waits out Maestro's seven-second lookup.

### Shards planned by time

`tools/scripts/ci-device/plan-shards.ts` balances a run's shards by total flow time, not by count:
the longest flow first, each to the shard with the least time so far. The times are the median
minutes of each flow's passing Android runs in the release gate's reports and of the sweep's flows, kept in
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
recorded; 20 minutes in the `happy` preset) is stopped and reported as **timed out**; it is not run
again. A journey whose recorded median (`tools/scripts/ci-device/flow-durations.ts`) is long by
design gets half again that median when it is above the limit. Pass `-f flow_timeout=<minutes>` to
a dispatch for a tighter or looser limit.

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
| `friend`    | `tools/scripts/ci-device/scenario-friend.ts` | one friend of the crew behind `code` acts per `action`: `join`, `board` (IN to the sent proposal), `drop-out` (OUT) or `answer-poll` (a vote for the open poll's first option) |

The `friend` is the same person across calls for one crew code (the runner keeps their session in
its temp directory), so a flow can have them join, wait for the proposal it sends, then board and
drop out, without ever switching accounts on the phone. `e2e/_shared/friend.yaml` starts one
action for the crew in `${output.crewCode}` (which `start-as.yaml` leaves) and waits for it:

```yaml
- runFlow:
    file: ../_shared/friend.yaml
    env:
      ACTION: join
```

Other people a journey needs, and what brings them: a second account that joins by code
(`friend` `join`, or `trip-day&members=1`), a crew of six on the trip (`trip-day`), someone who
boards or drops out of a proposal (`friend`), someone who answers a poll (`friend`).

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

`e2e/screens/` captures the premium design | device sheets, one flow per journey part:
`first-run`, `home`, `plan-vote`, `plan`, `chat`, `critters`, `trip`, `wallet` and `pass` (light,
then dark for each part's key screens), `vi` and `vi-trip` in Vietnamese, and `long-data`: the
long real data the demo world's short names never test, from the `week_crew` and `week_solo` seeds
(a locked seven-day trip at the places with the longest names and no photos, for a crew of five
whose given names and crew name are as long as the app allows, so a long forward address, and for
a crew of one), each shot named with `-long` after its state. Each starts from a
seed scenario (`subflows/start.yaml`, `_shared/start-as.yaml`) or a cleared install
(`subflows/fresh.yaml`) and is a capture sweep: a state that does not come up is skipped, never
failed. `subflows/shot.yaml` names each screenshot `premium-<code>-<state>-<look>`, so compare mode
pairs it with `docs/design-renders/premium/<code>.png` and titles it from that folder's
`screens.json`.

The sweep runs:

- on demand: `gh workflow run device.yml -f preset=sweep -f platform=android [-f pr=<n>]`, on
  sixteen shards balanced by flow time (the longest flows are split into light and dark halves,
  `*-dark.yaml`);
- on an iPhone: `gh workflow run device.yml -f preset=sweep -f platform=ios [-f pr=<n>]` runs the
  short iOS set in `e2e/screens/ios-sweep.txt` on five shards (all five macOS runners, so CI's
  macOS jobs wait for it):
  native sheets and their grabber, keyboards, floating headers under the status bar and footers
  pinned over content (`e2e/screens/ios/`), and `long-data`. The founder's iPhone found what the
  Android sweep passed (a sheet's doubled top inset, titles under the clock), so this leg runs
  before every TestFlight build (see the release gate);
- every night on main (the `schedule` trigger): the whole sweep on Android, and its English flows
  (`vi*.yaml` left out) on one iOS shard, posting the sheets, the check findings and the coverage
  report to the open "Nightly UI sweep" issue.

Two sweep flows are not journeys. `capture.yaml` is the fast capture: each screen the seed sets is
opened by its link (`subflows/capture.yaml`: `openLink critterpass-dev://<route>`, wait for
`qa-settled` on that route, shoot), seconds a screen; add a screen there when its state needs no
taps. `menus.yaml` long-presses the crew chat's message and a plan stop and taps every row of each
menu, and fails when a row shows nothing (no strip, toast, sheet, question or screen).

Every sweep comment lists what the run's screenshots captured against the premium designs, per
platform ("This run captured"), above the sweep's own coverage report.
`pnpm tsx tools/scripts/ci-device/sweep-coverage.ts` prints the coverage report: the premium
designs (`screens.json`) the sweep never shoots, and the routes under `apps/mobile/src/app` with no
sweep shot. Every route is listed in its `ROUTE_SHOTS` table with the design codes that show it, or
why the sweep can't reach it. Gaps don't fail CI; they show in every sweep comment, so add the
missing steps to `e2e/screens` when a new screen or route appears there.

## Starting a flow: "start as"

`e2e/_shared/start-as.yaml` puts a flow on Home as a brand-new account that already holds a seed
scenario, in a few seconds, instead of walking nine onboarding screens, tapping a seed button in
Developer tools and building a trip by hand:

```yaml
- runFlow:
    file: ../_shared/start-as.yaml
    env:
      SCENARIO: trip_today # LANG: vi for Vietnamese
```

How it works: the subflow clears the install and launches it with the launch argument
`cp_install_referrer: cp_start_as=<scenario>&cp_lang=<lang>`. Maestro puts launch arguments on
the launch intent as string extras on Android, where the cp-deferred-link module reads that one
extra, and in the user defaults' argument domain on iOS, where React Native's `Settings` reads it;
no native change and no runner action is involved, so it is the same step on both platforms. A
dev-only listener (`apps/mobile/src/lib/dev-tools/start-as-launch.tsx`, mounted with the shake)
opens the `(dev)/start-as` screen once the launch has settled on the splash. A deep link cannot do
this: the app's link router sends an unknown `critterpass-dev://` path to Home. The screen then
runs five steps (`apps/mobile/src/data/dev/start-as.ts`): read the request, start the session (an
anonymous sign-in), issue the pass the way onboarding does and wait for its row to sync back, ask
the api for the scenario (`POST /v1/dev/seed-demo`), wait for the scenario's rows on the phone.
It ends in exactly one of two states:

| Id                | Meaning                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `start-as-ready`  | A card; tapping it opens Home. `start-as-code` beside it holds the crew's join code (`${output.crewCode}`). |
| `start-as-failed` | One line naming the step: unknown scenario, no account, pass not issued after 45 s, seed refused (with the api's status, code and reason), rows not synced after 60 s, or the network. |

The subflow asserts `start-as-ready` as soon as either shows, so a broken start fails at once with
the line in the failure screenshot. It only acts on an install that has not onboarded: a later
`launchApp` or an in-app restart starts nothing again. None of it is in a store build (the screen
is a `(dev)` route; the listener is behind the same gate as the shake).

| Scenario         | The account starts with                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `everyday`, `inbox`, `caught_up`, `vote`, `vote_final` | the Bali demo world (home Singapore): a crew of five, a confirmed trip three weeks out, chat, a tip and that scenario's inbox or vote |
| `trip_today`     | home Ho Chi Minh City; a crew of six settling in đồng on a locked three-day Đà Nẵng trip that is on today: a plan of editorial places, two split expenses, a stay |
| `trip_tomorrow`  | the same trip confirmed for tomorrow, with the organiser's flight SGN → DAD that morning                                                                         |
| `draft_ready`    | a crew of one whose Đà Nẵng trip (two weeks out) has its hand-built plan waiting in draft review; no AI ran                                                       |
| `draft_today`    | the `draft_ready` crew and plan, with the trip's first day today: a proposal sent from it can be under way the day it is locked in                               |
| `crew_with_code` | a crew of one with a live join code and no trip                                                                                                                  |
| `solo_today`     | a crew of one on the Đà Nẵng trip, on today: its budget locked at ₫15,000,000, the plan locked in alone, nothing spent or booked; the crew's long name makes a long forward address |
| `solo_tomorrow`  | that solo trip confirmed for tomorrow and already `pre_trip` (as the lifecycle sweep leaves it), so a landing starts it                                           |

The start scenarios answer the crew's join code and are built through the app's own commands
(`services/api/src/dev/scenarios.ts`); each is one crew per account and asking again builds
nothing twice. The staging api only knows a scenario once the commit that adds it is deployed
(the release loop deploys `main`): on an older api the screen fails with "this api does not know
the scenario yet".

## Journeys

`e2e/journeys/` holds the user journeys the release gate does not walk, by ids only (a label is
used where a control has no id, never text that comes from staging data):

| Flow      | Start                                   | Journey                                                                                   |
| --------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `account` | fresh install, real UI, the test number | crew → sign out warns → pass saved with a phone → sign out → sign in → delete → restore → crew back |
| `paywall` | start as `everyday`                     | PASS → Settings → plan chip → Your plan (free) → the paywall → What's in each → back (nothing bought) |

```sh
gh workflow run device.yml --ref <branch> -f platform=android -f mode=flows -f shards=1 \
  -f flows="e2e/journeys/account.yaml e2e/journeys/paywall.yaml"
```

Shared controls answer under their owner's id: a `SegmentedControl` option is `<id>-<value>`
(`wallet-switch-bookings`, `guide-mode-private`, `money-add-mode-weights`); a `Stepper`'s buttons
are `<id>-up` and `<id>-down`; a `ChoiceRow` chip is `<id>-<value>` (`bookings-form-days-<date>`);
a `GlassMenu` item is `<id>-<key>` (`stop-menu-move`); a month grid's arrows are `<id>-previous`
and `<id>-next` (`picker-next`). A premium `Composer`'s field carries the composer's id and its
send is the button labelled with its verb ("Ask", "Send"); a `GuideNote`'s button has no id and is
tapped by its label inside the note. System alerts (`confirmAlert`) are matched by their title and
buttons.

`account` saves a pass with the staging test number (`OTP_TEST_CODE`), frees it first and erases
its account at the end (`journeys/subflows/free-test-number.yaml`, `erase-test-account.yaml`).

A new journey starts with `_shared/start-as.yaml` (a fresh install only when an account, a saved
pass or an empty Home is its subject), brings other people in through the runner's `friend` and
`trip-day` scenarios, and adds a seed scenario (with its database test) when no existing one holds
the state it needs.

## Release gate (happy paths)

`e2e/happy/` holds one flow per user journey, each run end to end against **staging** with real
sessions and data. Three walk a new user's whole way in, from a fresh install through the real
screens: `fresh-home-trip` (first run → first trip), `fresh-join-code` (joining by code) and
`fresh-trip-under-way` (a trip from the crew to the day it is on); `onboarding` covers the
onboarding screens themselves. Every other flow starts from a seed scenario at the state it tests
(`e2e/_shared/start-as.yaml`: the demo world's `everyday`, `inbox`, `caught_up`, `vote`,
`vote_final`, or a crew's own `crew_with_code`, `draft_ready`, `draft_today`, `solo_today`,
`solo_tomorrow`), so the onboarding → crew → vote → setup → draft walk runs once per journey and
not once per flow. Friends a flow needs on the phone still join through the real screens. Each
flow drives the rest through the app's real commands, asserting the journey's outcomes (the message sent and answered, the vote closed, the expense settled), not just
that screens render. Nothing is mocked: the draft, the redraft and reading a pasted booking run on
staging's AI, so those flows allow a few minutes for them.

| Flow | Start | Journey |
| --- | --- | --- |
| `onboarding` | fresh install | name → avatar → taste → home → pass issued → Home, and the session survives a relaunch |
| `fresh-home-trip` | fresh install | a crew under a long name → Pitch a place → Home and the trip's hub still voting, in English and Vietnamese |
| `fresh-join-code` | fresh install, twice | the organiser starts a crew → a second new account → splash "Got a code?" → JOIN → name and home → ISSUE → manifest |
| `fresh-trip-under-way` | fresh install | crew of one from Ho Chi Minh City → Đà Nẵng from today, 3 days, budget in ₫ → draft → LOCK IT IN alone → Home and the TRIPS hub show the trip as on |
| `home-inbox` | `inbox` | Home's countdown, plan progress, tip and bell → inbox → answer a card → undo |
| `chat` | `everyday` | crew chat: send a message, a crewmate replies |
| `guide-chat` | `everyday` | the guide sheet → a question → the streamed answer |
| `vote` | `vote` | pitch a place → board → vote → go to the final → vote → reveal |
| `setup` | `vote_final` | from the reveal: dates → budget → rooms → must-dos → DRAFT MY TRIP |
| `drafting` | `vote_final` | setup, then the draft ready → private review → change a day → keep |
| `money`, `by-share` | `caught_up` | add an expense → balances → settle up; an expense split by share |
| `bookings` | `caught_up` | paste a confirmation → candidate → ADD → wallet stack → the flight's details |
| `suppliers` | `caught_up` | Developer tools' supplier page → the live offer → Open Klook → click recorded → the partner redirect |
| `trip-day` | `caught_up` | Your trips → hub → day-of → pack list tick → relaunch → offline card |
| `critters` | `crew_with_code` | PASS → Critterdex synced → Found empty → a set page → Explore at home kept after a relaunch |
| `fresh-chat` | `crew_with_code` | a pitch and an expense post their cards → a text and a voice note in the chat |
| `fresh-crew-chat-walk` | `crew_with_code` | the organiser's first message and a pitch → a friend joins in Vietnamese and reads, replies, reacts → an expense card |
| `fresh-guide-chat-walk` | `crew_with_code` | the guide chat in Vietnamese, then in English after a restart |
| `fresh-join-code-vi` | `crew_with_code` | the friend of `fresh-join-code`, reading the app in Vietnamese from the splash on |
| `da-nang-guide` | `crew_with_code` | Đà Nẵng pitched by Chà Vá → vote → final → setup → the guide sheet is Chà Vá's |
| `fresh-setup` | `crew_with_code` | one place locked in → dates marked free by hand → locked → budget |
| `fresh-setup-vnd` | `crew_with_code` | Đà Nẵng locked in → dates from tomorrow, 3 days → budget in ₫ locks first time → rooms |
| `fresh-solo-confirm` | `crew_with_code` | one place → setup → the guide's draft → LOCK IT IN alone → Home counts down |
| `fresh-wallet` | `crew_with_code` | a solo trip to Hội An → Money in VND → Bookings and Money halves → forward address → insurance → an expense |
| `fresh-uncurated-draft` | `crew_with_code` | Đà Lạt (open-data places only) two weeks out, one typed must-do → a stop on every day → CHANGE A DAY → KEEP IT → Explore picks |
| `fresh-proposal` | `draft_ready` | a friend joins → BUILD THE PROPOSAL → SEND → the friend boards from chat → the organiser locks in |
| `fresh-dropout` | `draft_ready` | the same proposal → the friend boards, then drops out → APPLY CHANGES → locked alone |
| `fresh-join-under-way` | `draft_today` | a friend boards → locked → a newcomer joins the trip under way (plan, ₫ split three ways); one who joined during the proposal → JOIN THE TRIP |
| `fresh-trip-bookings` | `solo_today` | paste the flight and a stay → READY TO ADD → the forward address → a flight and an activity by hand → wallet, details in airport time, hub count → delete leaves no card |
| `fresh-trip-money` | `solo_today` | three typed expenses in ₫ → SPENT SO FAR, LATEST, history, detail, the budget on day 1 of 3 |
| `fresh-trip-day` | `solo_today` | hub on day 1 of 3 → day-of screen → pack list → background and reopen → relaunch → the briefing settles |
| `fresh-trip-plan` | `solo_today` | the plan map → day 1 → Find → Add to plan → All days moves it to day 2 → a place saved in Ideas → the plan check → relaunch keeps it |
| `fresh-critters` | `solo_today` | the Critterdex → the egg → arriving hatches it → the critter and quest screens |
| `fresh-trip-landing` | `solo_tomorrow` | its flight today typed in by hand → I landed → Home turns to the trip being on |
| `boarding-pass-ios` | `trip_tomorrow` | Wallet → Bookings → the flight on top → its details and documents (iOS gate) |

The `happy` preset records every flow on video (`screenrecord` in three-minute segments on Android,
`simctl io recordVideo` on iOS; `tools/scripts/ci-device/screen-video.ts`) and the publish job builds
the report (`tools/scripts/ci-device/release-gate.ts`): per flow and platform, pass or fail, the time,
an inline GIF preview, a link to the MP4 and, when it failed, Maestro's failing step with the screen
at that moment, plus the app's `[ui-qa]` reports. The media goes to the private repository's
`screenshots` branch (the newest 30 runs are kept) and the report to one comment on the open
"Release gate" issue, and to the job summary. Android runs every `e2e/happy` flow on sixteen
shards (flows are independent), about as long as the longest journey. iOS runs only the journeys
whose behaviour is iOS's own, listed in `e2e/happy/ios-gate.txt` (launch and sign-in, the keyboard
and composers, form sheets, the reveal, a Live Activity), on the `shards` input. A fresh-install
flow listed in `FIRST_IN_SHARD` (`tools/scripts/ci-device/plan-shards.ts`) runs first in its shard.

It runs daily on main (Android) and on demand. **Before submitting a build to TestFlight**, run it
on both platforms with the new builds:

```sh
# Both find the e2e-test build that matches the native fingerprint (see Builds above):
gh workflow run device.yml -f preset=happy -f platform=android
gh workflow run device.yml -f preset=happy -f platform=ios -f shards=3
# Then the iPhone leg of the UI sweep (five shards), once the happy runs have left the macOS runners:
gh workflow run device.yml -f preset=sweep -f platform=ios
```

The build goes out only when the happy runs pass and the iPhone sweep shows no `[ui-qa]` report or
screen-check finding: the layout checks (overlap, clipping, a text at a card's edge or under the
status bar, a sheet's empty top) run on that leg against iOS's own sheets, safe areas and keyboard.

Add `-f pr=<n>` to post the report to a pull request instead of the issue, and `-f flows=...` to run
some of the flows.

### Adding a flow

1. Add `e2e/happy/<journey>.yaml`: start with `../_shared/start-as.yaml` and the seed scenario
   at the state the journey tests (a fresh install only when the way in is the journey), reuse
   the area's own subflows,
   and assert each step's outcome with `extendedWaitUntil` on what the api's answer puts on screen.
   Name the file after the journey; the report shows that name.
2. When the journey needs a state no seed scenario makes, add a start scenario
   (`services/api/src/dev/scenarios.ts`, with its db test, and `DEMO_SCENARIOS` in the app), or
   reach it through the app as `drafting.yaml` does.
3. Run it: `gh workflow run device.yml -f preset=happy -f platform=android -f flows=e2e/happy/<journey>.yaml`.
4. Add it to the table above.

### Writing flows that pass on iOS

- A plain `View`'s id inside an `accessible` parent (a day card, a chat bubble) is not in iOS's
  hierarchy: find it by the parent's label, or put the id on the accessible view.
- iOS reads a grouped element as one label ("Winston, 17:07: Fushimi Inari at sunrise", "Day 1,
  Sat, …", an address with its copy hint): match text with `'.*…'` on both sides.
- A sheet's root id can be missing from iOS's hierarchy: wait on a control inside it.
- iOS 26 toolbar items and native tab bar items are reached by their label: run
  `_shared/tap.yaml` or `_shared/tab.yaml`, which fall back to the label when the id is not there.
- An element behind a footer, a keyboard or below the fold still counts as visible: hide the
  keyboard and `scrollUntilVisible` before tapping, and never trust an unscrolled tap on a long
  list.
- Once a trip turns on, its welcome page (`critters-hatch-later`) can come up over Home at any
  later step: wait for Home or the page, and pass it.
- Every `when: visible` on an element that is not there, and every `when: notVisible` on one that
  is, waits up to seven seconds: branch on the platform, a script, or the route from
  `_shared/where.yaml` where you can.

## UI review gate

`.github/workflows/ui-review.yml` adds the `ui-reviewed` check to every pull request. When the pull
request changes `apps/mobile/src/app/**`, `features/**` or `ui/**` (tests, mocks, snapshots and
test support aside), the check fails until the pull request carries the `ui-reviewed` label. The
reviewer applies it only after reading the pull request's design | device sheets (device workflow,
`mode: compare`, or `preset: sweep` for broad changes). A later push that changes those files
again removes the label, so the new sheets need a new review.
