# Runbook: deep-link and deferred-link QA

Owner: growth. When: before every store submission that changes links, the launch splash or
onboarding, and once on the beta cohort before launch. It proves that a link someone taps before
installing still lands them on the right screen after the install, with no typing, and measures how
often that works per platform.

The automated half runs on GitHub Actions emulators and simulators. The real-device half below
covers what a simulator cannot: the Play Store referrer, a TestFlight install, and Instagram's
in-app browser.

## 1. Automated flows

| Flow                                    | Platform | Proves                                                                                       |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `e2e/links/deferred-android.yaml`       | Android  | a fresh install whose referrer carries an invite link opens on that invite (`via: referrer`) |
| `e2e/links/deferred-paste-ios.yaml`     | iOS      | a fresh install with the invite link on the pasteboard offers the paste control; one tap opens the invite (`via: paste`) |
| `e2e/links/in-app-browser-android.yaml` | Android  | a link that opened in a browser instead of the app shows the handoff page; OPEN IN APP brings the app up on the invite |
| `e2e/links/open-installed.yaml`         | both     | every link kind opens its screen in an installed app                                         |

Each flow starts a new crew from a fresh account and uses that crew's live code, so nothing depends
on a seeded code. The referrer flow injects the referrer as the `cp_install_referrer` launch extra
(honoured in internal builds only); the paste flow puts the link on the simulator's pasteboard
through the runner's `/pasteboard` action.

```sh
URL=$(gh variable get DEVICE_SCHEDULED_ANDROID_BUILD_URL)
gh workflow run device.yml --ref <branch> -f platform=android -f build_url="$URL" -f shards=1 \
  -f flows="e2e/links/deferred-android.yaml e2e/links/in-app-browser-android.yaml"
gh workflow run device.yml --ref <branch> -f platform=ios -f shards=1 \
  -f flows="e2e/links/deferred-paste-ios.yaml"
```

The shard artifacts (`device-<platform>-shard-1`) keep the JUnit report, the Maestro output and the
screenshots; link the run in the results table below.

The api half: `pnpm --filter @cp/api test -- links/funnel` checks that every way the server
attributes an install is a value the `install_attributed` event accepts, and that the growth
dashboard counts link opens, attributed installs and passes in that order.

## 2. Real-device script

Use a phone that has never had CritterPass installed (or delete it and its data first). Use a
production-like build: Play internal testing on Android, TestFlight on iOS. One tester sends, one
receives; the sender starts a crew and shares its invite.

### Android: Play Store referrer

1. Receiver: tap the invite link in WhatsApp. Chrome opens the handoff page with the crew's name.
2. Tap **Google Play**. The store page opens for the internal-testing build.
3. Install, then open from the store's **Open** button.
4. Expected: the splash holds for at most 2 s, then the invite ticket for the sender's crew opens.
   No code typed.
5. PostHog (Live events, the receiver's device): `install_attributed` with `via = referrer`.

### iOS: TestFlight install and paste

1. Receiver: tap the invite link in iMessage. Safari opens the handoff page; tapping the code copies
   the link.
2. Tap **App Store** and install from TestFlight (TestFlight installs carry no referrer).
3. Open the app. Expected: the paste control appears over the splash. Tap it; there is no paste
   alert.
4. Expected: the invite ticket for the sender's crew opens.
5. PostHog: `install_attributed` with `via = paste`.
6. Repeat with the pasteboard holding something else (copy a word in Notes after step 1): the paste
   control must not appear, and the splash offers "Got a code?". Typing the code gives
   `via = code`.

### Instagram in-app browser (both platforms)

1. Sender: put the invite link in an Instagram DM (or bio) and send it.
2. Receiver: tap it inside Instagram. Instagram's in-app browser opens the handoff page with the
   escape sheet ("Open in Safari" / "Open in Chrome").
3. Follow the sheet: on Android, **Open in Chrome**; on iOS, Instagram's ••• menu → Open in
   external browser, or copy the link and paste it in Safari.
4. Expected: the handoff page in the real browser; **Open in app** opens the installed app on the
   invite, or the store when the app is missing. After an install, the deferred check picks the
   link up as above.

### Installed app, every link kind

With the app installed and onboarded, tap one link of each kind from Notes (iOS) or Keep (Android):
`/i/<code>`, `/plan/<trip id>`, `/g/<slug>`, `/locals/<slug>`, `/p/<id>`, and an unknown code.
Each opens its screen; the unknown code lands on Home with a toast.

## 3. Funnel queries (PostHog)

The growth dashboard's "Acquisition: link to saved account" funnel
(`infra/monitoring/posthog/insights.json`) counts `link_clicked` → `install_attributed` →
`pass_issued` → `account_saved` within 14 days. The split by how the install found its link
(SQL insight, last 30 days):

```sql
SELECT
  properties.$os AS platform,
  properties.via AS via,
  count(DISTINCT person_id) AS installs
FROM events
WHERE event = 'install_attributed' AND timestamp > now() - INTERVAL 30 DAY
GROUP BY platform, via
ORDER BY platform, installs DESC
```

Deferred success per platform: attributed installs that arrived without typing (`referrer`,
`paste`, `clip`) over fresh installs from an invite page (`link_clicked` with `type = 'invite'`
followed by a first app open):

```sql
SELECT
  properties.$os AS platform,
  countIf(event = 'install_attributed' AND properties.via IN ('referrer', 'paste', 'clip')) AS deferred,
  countIf(event = 'install_attributed') AS attributed
FROM events
WHERE event = 'install_attributed' AND timestamp > now() - INTERVAL 30 DAY
GROUP BY platform
```

### App Clip gate

The App Clip ships dark behind the `links.app_clip` flag. Turn it on when iOS deferred success
(`deferred / attributed` above) is under 60 % of Android's, measured first on the beta cohort with
at least 30 invite installs per platform, and again after launch at 200. Record each evaluation in
the results table.

## 4. Results

Fill one row per platform and `via` at each milestone check. Leave a cell empty when it was not
tried; write the reason in Notes when it failed.

| Date | Build | Platform | via      | Path tried                     | Landed on | Time to screen | Run or recording | Notes |
| ---- | ----- | -------- | -------- | ------------------------------ | --------- | -------------- | ---------------- | ----- |
|      |       | Android  | referrer | Play internal testing          |           |                |                  |       |
|      |       | Android  | code     | splash "Got a code?"           |           |                |                  |       |
|      |       | Android  | phone    | seat invite, phone verified    |           |                |                  |       |
|      |       | Android  | link     | installed app, link tapped     |           |                |                  |       |
|      |       | Android  | —        | Instagram in-app browser       |           |                |                  |       |
|      |       | iOS      | paste    | TestFlight, paste control      |           |                |                  |       |
|      |       | iOS      | code     | splash "Got a code?"           |           |                |                  |       |
|      |       | iOS      | phone    | seat invite, phone verified    |           |                |                  |       |
|      |       | iOS      | link     | installed app, link tapped     |           |                |                  |       |
|      |       | iOS      | clip     | App Clip (flag on)             |           |                |                  |       |
|      |       | iOS      | —        | Instagram in-app browser       |           |                |                  |       |

| Date | Cohort | iOS deferred / attributed | Android deferred / attributed | iOS ÷ Android | App Clip flag |
| ---- | ------ | ------------------------- | ----------------------------- | ------------- | ------------- |
|      |        |                           |                               |               |               |
