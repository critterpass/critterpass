# Background location + dwell ring spike (S6)

Harness: `apps/mobile/src/app/(dev)/spikes/location.tsx` (screen), `dwell-location-task.ts`
(background task + subscriber bridge), `dwell-ring.ts` (pure dwell calculation, unit-tested in
`apps/mobile/src/app/__tests__/dwell-ring.test.ts`).

## Design

Per `docs/product-decisions.md` C19 and `docs/system-architecture.md` §4's platform-physics table:
dwell is the eligibility signal (the ring fills while inside a 50 m radius; it counts in the
background while a trip-day session is active), not a hard in/out geofence. Both OSes' native
geofencing APIs have a practical minimum radius well over 50 m (iOS `CLMonitor` ~100 m+, Android
100–150 m), so the design is two-tier: a coarse OS geofence or an explicit trip-day While-In-Use
session wakes/keeps alive a foreground-capable location watch, and this spike's fine 50 m dwell
check runs against the resulting location stream, not the OS geofence callback. `stepDwellState`
implements the "grace + slow drain" rule from C19: a brief step outside the radius (`graceSeconds`)
does not touch the ring at all; only past that window does it drain gradually
(`drainPerSecond`), rather than resetting an almost-complete encounter to zero over one bad GPS fix.

## Permission flow

1. `Location.requestForegroundPermissionsAsync()` first — this is the only prompt shown before the
   user has done anything that needs more.
2. A separate, later "Enable background tracking" action calls
   `Location.requestBackgroundPermissionsAsync()` — never requested together with (1), matching both
   Apple's and Google's review guidance against combined asks.
3. `Location.startLocationUpdatesAsync` is configured with `foregroundService: {...}` (Android) and
   `showsBackgroundLocationIndicator: true` (iOS) — both surfaces make it visible to the user that
   location is active in the background, which the platform-physics table calls out as required.

## Running the simulated route

No physical device or real walk is needed to prove the ring advances — `sample-dwell-route.gpx` is a
12-point approach → dwell → depart route around a fixed test POI (verified by
`replayDwellSeries` in the unit tests, and independently by hand: point 4 is the POI itself, points
0–2 and 9–11 sit 87–270 m away, points 3–8 sit 0–47 m away, i.e. inside the 50 m radius).

```
# 1. Build + install the dev client (see tools/spikes/skia-critter/prebuild-and-*.sh), open
#    location.tsx, tap "Enable location", then "Use current location as POI" once so a POI is
#    configured (the simulated route below re-centres on the same POI regardless of where the
#    simulator/emulator's default location is — set it once, then the route plays around it).
# 2. Start the trip-day session ("Start trip-day session" button).
# 3. Play the route:
bash tools/spikes/location/simulate-route-ios-simulator.sh <simulator-udid>
# or
bash tools/spikes/location/simulate-route-android-emulator.sh <emulator-serial>
```

Watch the on-screen "dwell ring" percentage rise while the simulated fixes are inside the radius,
hold near its peak during the brief simulated dip (points 5–8 wobble by a couple of metres, staying
inside), and fall slowly (not snap to 0) once the route moves away past point 9.

## Founder checklist (device-only; cannot be produced in this environment)

Per phase-02's "Device evidence" rule, none of the following count from a simulator/emulator:

1. **1 h walk test per platform** — start a trip-day session, walk for 1 h with the screen off/phone
   locked, then record: iOS Settings → Battery → Critterpass (Dev) usage; Android
   `adb shell dumpsys batterystats --charged app.critterpass.dev` (or Settings → Battery) before vs
   after. Target: <3 %/h (system-architecture.md §9).
2. **Lock-screen ring evidence**: once T7/T9's Live Activity plumbing is signed and installable, walk
   toward the same POI with the phone locked and screenshot the LA/Live Update showing the ring
   advance — this spike only proves the App Group snapshot write (see the ADR); the actual on-lock
   -screen render is T7/T9's target, gated on the same Apple-account/`.p8` gaps those ADRs record.
3. **Always-upgrade real-world approval rate** — the in-app copy and timing of the "Enable background
   tracking" prompt is a product/UX call best validated with real users, not a spike.
