---
phase: 16
title: GO — the route from here, then directions in the maps app
status: done
depends_on: [3, 15]
wave: 3
screens: [7e-1, 7b-1, 7a-2, day-of next stop, leave-by push]
tasks: 4
owns:
  - services/api/src/routing/{preview,preview-route}.ts and services/api/test/routing/preview*.test.ts
  - apps/mobile/src/features/go/**
  - apps/mobile/src/app/go/** (or the one modal route the screen needs)
  - apps/mobile/src/ui/buttons/GoButton.tsx
  - packages/i18n/locales/{en,vi}/go.*
  - e2e/go/**
  - "T3: the GO entry points in features/trip-day/**, the leave-by push route in data/push/routing.ts, and, after their PRs merge, features/place/** (7e-1) and features/plan/{trip-map,day-plan}/**"
mount_points:
  - services/api/src/routing/routes.ts or the api route register (one line)
  - apps/mobile/src/features/settings/** (the maps app row)
  - docs/undesigned-states.md, docs/api-contracts.md (the new route), docs/data-model-sync-and-privacy.md (location in transit)
---
# Phase 16 — GO: the route from here, then directions in the maps app

Founder, 2026-10-04 09:20: "would we able to have Navigate feature with the routes to any places?" Option 1 accepted at 09:29: an in-app route preview, with spoken turn-by-turn handed to Google Maps or Apple Maps, and Grab for a ride. Full in-app turn-by-turn is out of scope.

## Requirements

- A GO button wherever a place is the next thing to do: the place page (7e-1), each stop in the day plan (7b-1) and on the trip map's day sheet (7a-2), the day-of next-stop card, and the leave-by push (its tap opens the preview for that stop).
- GO opens a preview on our map with your location, the place, and the road route between them. It shows walking and driving minutes from our Valhalla (driving × the destination's drive factor, labelled "about" like other free-flow times). It also shows the Grab fare when the destination has Grab, using the rides estimate that exists.
- **Start** opens the chosen maps app with directions in the selected mode. On iOS that's Apple Maps (`https://maps.apple.com/?daddr=…&dirflg=w|d`) or Google Maps (`https://www.google.com/maps/dir/?api=1&destination=…&travelmode=walking|driving`, which opens the app when installed, as a universal link). On Android it's Google Maps. **Ride** opens Grab through the existing supplier deep link. The choice of maps app is remembered (a Settings row, defaulting to Apple Maps on iOS and Google Maps on Android). Reuse or move the critter quests' `directionsUrl` helper rather than writing a second one.
- No native changes: the update must ship over the air to build 17. Don't use `canOpenURL` for maps apps (iOS would need new query schemes).
- **Privacy:** the phone's location goes to our api only to route that one request. It is never stored, logged or put in a URL query (POST body). Location permission is asked only on GO, with the existing when-in-use flow. Without permission or a fix, the preview opens on the place, Start still hands off (the maps app finds the user), and the line is hidden.
- Offline: no route line (it needs signal); Start still works. Say so in one line built from existing copy patterns.
- Undesigned: built from existing components and tokens (map kit, `RouteLine`, sheet, buttons) and logged in `docs/undesigned-states.md` for founder review.

## Tasks

### T1 Server: `POST /v1/routes/preview`
- Session required. Body `{from: {lat, lng}, to: {lat, lng}}`. Answers walk and drive, each `{minutes, meters, shape}`: the shape is encoded polyline precision 5, simplified like stored legs (reuse the `@cp/domain` polyline helpers from phase 15). Also `approx`, and the source. Straight-line fallback when the router is down or off graph, with `shape: null`.
- Per-user rate limit with the existing limiter (about 60 an hour). Coordinates are never logged; check the request logger does not log bodies.
- Additive route: nothing existing changes. Tests: routed answer from recorded Valhalla fixtures, the off-graph fallback, auth required, rate limit. Contract doc entry in `docs/api-contracts.md`.
- Status: done — 9a5a73dc3

### T2 App: GO button and the preview
- `GoButton`, the preview screen (map, your dot, the place, route line for the selected mode, mode toggle with minutes, Grab row when available, Start and Ride), the maps app preference and its Settings row, and copy in EN and VI.
- A lab scene per state: routed, no permission, offline, router fallback (straight, "about"), no Grab.
- Tests: the handoff URL builder per platform and mode; the preview model's states.
- Status: done — 7552b2d27 (+ 8f97a32a1, c1d9822d4 and later fixes)

### T3 Entry points
- Do now: the day-of next-stop card, and the leave-by push (tapping it opens the preview for that stop).
- After phase 8's PR (#620) merges: the place page's GO.
- After phase 10's PR (#617) merges: the day plan stops and the trip map's day sheet.
- Explore's place card comes with phase 12.
- Status: done — 07bab90f1 (day-of airport GO), 9227f5c92 (day plan and trip map, today only); earlier entry points shipped in the first GO pull request

### T4 Device check
- Android `mode=compare` for the preview lab scenes (EN, VI), and one real-data flow: Home → a trip's day-of → GO → preview, with the redesign override on where needed.
- Status: done — 6df605d2e (Android compare on #624; the real-data day-of flow needs a seed with a trip in progress)

## Done when

On staging, GO from the founder's next stop shows the road line and minutes from where they are. Start opens their maps app with directions, and Ride opens Grab. Nothing about their location is stored or logged.
