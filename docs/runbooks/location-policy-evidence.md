# Runbook: location policy evidence (App Review, Google Play, battery)

Owner: mobile. When: before the first store submission that ships the trip-day location session,
again whenever the location permissions, the Always upgrade or the background geofences change.
Purpose: give reviewers exactly what they need to approve background location, and keep the
battery evidence current.

## What ships

| Piece | iOS | Android |
| --- | --- | --- |
| Default session (trip days only) | While-In-Use: `CLBackgroundActivitySession` + `CLServiceSession(.whenInUse)` + `CLLocationUpdate.liveUpdates`; the blue status-bar pill shows while it runs | Foreground service `foregroundServiceType="location"` with an ongoing notification and a Stop action, started only from visible UI or a geofence transition |
| Always upgrade | Offered only after a first successful encounter or turning on the crew map, as its own primer; `CLMonitor` (≤ 20 regions) can then relaunch a terminated app | Same moments; the prominent disclosure screen first, then the system "Allow all the time" step; `GeofencingClient` (≤ 100, radius ≥ 150 m) |
| Kill switches | `location.always_upsell` (PostHog) turns the offer off | `location.android_background_geofences` stays **off** until the Play declaration is approved; the foreground-service session ships regardless |
| Never | No location at home (unless the foreground-only "explore at home" opt-in), no raw trails stored, fixes live 15 min (an open SOS until resolved + 24 h), visits are POIs + two instants, opt-in, deleted 30 days after the trip | same |

Usage strings: `apps/mobile/plugins/with-location-permissions.ts` (checked after every prebuild by
`pnpm tsx tools/scripts/check-permissions-manifest.ts`).

## App Review notes (paste into App Store Connect → App Review Information → Notes)

> CritterPass is a group-travel app. Location is used only on the days of a trip the user is on.
> By default it runs While In Use: when a trip day starts, the app starts a location session from
> the trip screen and iOS shows the blue location indicator while it runs. Location lets us time
> "leave by" alarms, show critters (the game) at real places the group planned, and — only when
> the user opens Help or SOS, or turns on the crew map — share their position with their own
> travel group for a limited window.
>
> "Always" is never requested at onboarding. It is offered later, in context, after the user's
> first critter encounter or when they turn on the crew map, with an in-app explanation before the
> system prompt. Declining keeps everything working with the While-In-Use session.
>
> We never store a trail of coordinates: shared positions are deleted after 15 minutes, and the
> optional "places you visited" feature stores only the place and the arrival and departure times.
>
> To see it: sign in with the demo account below, open the trip "Bali demo" (its dates include
> today), tap "Start trip day" on the trip hub, and walk or simulate a location near Ubud.

(Keep a demo account with an `in_trip` trip whose dates cover the review window; refresh it
before each submission.)

## Google Play: background location declaration

Play Console → App content → Location permissions. Declare **one** core feature: finding critters
and timing leave-by alarms during trip days while the app is not in use.

Video script (≤ 30 s, screen recording on a Pixel, no edits beyond trimming):

1. 0–5 s: the trip hub on a trip day, "Start trip day" tapped; the ongoing "CritterPass is on for
   your trip day" notification appears.
2. 5–12 s: after a critter encounter, the Always primer: the prominent disclosure screen ("Location
   in the background … even when the app is closed or not in use … Only on trip days, never at
   home …"), tap Continue.
3. 12–18 s: the system settings page, "Allow all the time" selected, back to the app.
4. 18–27 s: screen off, walk (or emulator route) into a planned place; the critter notification
   arrives with the app closed.
5. 27–30 s: the notification's Stop action ends the session.

Then set the rollout flag `location.android_background_geofences` on in PostHog.

## Battery evidence

### Proxy (every change to the engine; no device needed)

`apps/mobile/src/lib/location/__tests__/battery-proxy.test.ts` runs one scripted trip-day hour
through the real engine (budget, planner, tiers) with fixes arriving at each tier's requested
cadence (high 5 s, balanced 20 s, coarse 60 s): walk 20 min, stand 20 min at a planned temple,
walk 20 min, three planned places. Recorded 2026-09-28:

| Scenario | Location updates / h | High-accuracy minutes / h |
| --- | --- | --- |
| Trip-day walk | 311 | 19 |
| Trip-day walk, 10-min daily high-accuracy cap | 216 | 10 |
| Live encounter the whole hour | 522 | 42 |
| Live encounter, 10-min cap | 170 | 10 |

A regression that pushes the walk above ~400 updates/h or high accuracy beyond the time spent
near planned places fails that test.

### On-device measurement (release gate, physical phones only)

Budget: under 3 % battery per hour during an active encounter (system-architecture.md §9). A
simulator or desktop emulator has no battery to drain, so this needs a real iPhone and a real
Pixel:

1. Charge to 100 %, unplug, close every other app, screen brightness 50 %, Wi-Fi on, cellular on.
2. Start a trip day on a test trip whose plan has three places along a 1 h walk; lock the phone.
3. Walk the route (or stand at one place for the encounter case) for exactly one hour.
4. Read the drop: iOS Settings → Battery → Last 24 hours → CritterPass; Android
   `adb shell dumpsys batterystats --charged app.critterpass` (or Settings → Battery usage).
5. Record device, OS version, app build, % used and the dev screen's update count
   (`Developer tools → Location engine`) next to the proxy row above.

## Simulator and emulator flows

`e2e/permissions/*.yaml` and `e2e/location/*.yaml` (Maestro; run locally, one device at a time):
the 3a-9 primer grants notifications and refuses location, the camera primer precedes the OS
prompt, a refused kind offers only Settings, the iOS session and CLMonitor regions with a visit
arrival at the temple, Android mock-provider fixes flagged `mock=1`, the Always upgrade as a
separate step, and the visit consent sheet. `e2e/location/walk-ubud.gpx` is the same walk for
`xcrun simctl location` or Xcode.
