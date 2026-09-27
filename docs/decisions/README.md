# Decisions

Architecture decision records from the platform go/no-go spikes, plus the founder decisions that
followed. Each ADR holds the raw numbers, method, findings and rerun steps; this page is the index
and the one-table summary.

## Index

| ADR | Topic |
|---|---|
| [PlanetScale Postgres from Railway](20260927-planetscale-postgres-from-railway.md) | S-DB: latency, PgBouncer pooling, extensions, HNSW build |
| [Better Auth anonymous upgrade](20260927-better-auth-anonymous-upgrade.md) | S-AUTH: anonymous → phone/Apple/Google keeps uid; conflict merge |
| [Self-hosted PowerSync sync](20260927-self-hosted-powersync-sync.md) | S-SYNC: end to end sync, load, and the PlanetScale switchover drill |
| [Centrifugo realtime proxy](20260927-centrifugo-realtime-proxy.md) | S-RT: subscribe proxy, revocation, presence, recovery, 5k sockets |
| [Apple extension targets on SDK 58](20260927-apple-extension-targets-sdk58.md) | Widget, Live Activity, AlarmKit, App Intent, NSE, NCE targets |
| [App Group inline module bridge](20260927-app-group-inline-module-bridge.md) | `cp-app-group`: JS ↔ App Group files and widget reload |
| [APNs Live Activity push and action keys](20260927-apns-live-activity-push-and-action-keys.md) | Broadcast channels, push-to-start, device action keys, NSE/NCE delivery |
| [Android native surfaces](20260927-android-native-surfaces.md) | Glance widget, Live Update / MetricStyle, full-screen alarm |
| [Skia critter painter performance](20260927-skia-critter-painter-perf.md) | Critter port fidelity, draw-on fps, Critterdex grid |
| [Motion transitions and startup](20260927-motion-transitions-and-startup.md) | Grow-into-page transition, timeline drag, cold start, download size |
| [Background location and dwell ring](20260927-background-location-dwell-ring.md) | Trip-day location session, 50 m dwell ring, Always upgrade, battery |
| [MapLibre + PMTiles on R2](20260927-maplibre-pmtiles-on-r2.md) | Custom basemap from PMTiles, offline city pack, pan fps |
| [Valhalla routing on Railway](20260927-valhalla-routing-on-railway.md) | Self-hosted routing latency, matrix, build cost; Mapbox-at-launch decision |
| [In-house procedural audio](20260927-in-house-procedural-audio.md) | Founder decision (not a spike): SFX and music synthesised in `@cp/sound-art` |
| [App Clip built behind a flag](20260928-app-clip-built-behind-a-flag.md) | D15: native clip built now, offered only with `links.app_clip` on |

## Spike results

Verdicts: **PASS** (all criteria met), **FAIL** (at least one criterion measured and missed),
**INCOMPLETE** (criteria that need a physical device, Apple/Firebase credentials or a device farm
were not run). Device-only criteria are tracked as founder follow-ups in each ADR; simulator and
emulator numbers never count as device evidence.

| Spike | Verdict | Key numbers | Fallback taken |
|---|---|---|---|
| S-DB | PASS; FAIL on HNSW build time (PS-DEV tier) | `select 1` p50 2.36 ms (budget < 3 ms); single-row tx p99 10.88 ms; `app.uid` does not leak across pooled clients; `vector`, `pg_trgm`, `unaccent` present; HNSW on 100k × 1024-d did not finish in 1 h 31 m 36 s | None switched. Keep PlanetScale; rerun the HNSW step on the launch tier. If still slow: `CREATE INDEX CONCURRENTLY` as a background job, lower `m`/`ef_construction`, or `ivfflat` |
| S-AUTH | PASS (server); device: phone PASS, Apple and Google INCOMPLETE | 5/5 server criteria; on-device anonymous → phone keeps uid; Google blocked on a missing Firebase project | None needed (merge tx + `disconnectAndClear` not required) |
| S-SYNC | PASS; FAIL on switchover drill | Chat round-trip p95 164.6 ms (budget < 1 s); offline replay 50/50; 1,120 concurrent connections, 0 failures; switchover drops the logical slot: full re-snapshot, ~34.4 s sync-path gap | Same stack, adjusted operational expectation: a bounded sync gap on switchover, inside RPO ≤ 5 min / RTO ≤ 2 h; documented in `docs/runbooks/db-switchover-drill.md`. PowerSync Cloud or another database would hit the same slot loss |
| S-RT | PASS | Unsubscribe p95 3.4 ms (loopback Docker, budget < 1 s); recovery after a real 120 s background; 5,000/5,000 sockets on 2 nodes | None needed |
| Apple targets | PASS (simulator build and signing); INCOMPLETE on device signing, widget memory, intent latency | Widget, Live Activity, AlarmKit UI and App Intent in one target; NSE and NCE build and embed; App Group + Keychain on all targets | None needed: published `@bacons/apple-targets` 5.0.0, unmodified. Exit if it breaks later: in-repo config plugin, then bare workflow |
| App Group bridge | PASS (iOS); Android not build-verified | File I/O p50 0.56 ms / p95 0.77 ms (budget < 50 ms round-trip); widget reads the written snapshot | None needed |
| APNs Live Activity / action keys | PASS on action-key HMAC; INCOMPLETE on APNs, FCM and NSE/NCE delivery | Real HMAC verification with a tampered body rejected; APNs and FCM steps skipped for missing `.p8` key and Firebase service account | None needed |
| Android surfaces | PASS on code path and signed EAS build; INCOMPLETE on-device and FCM | 13/13 JVM unit tests; compiled against API 36/37; signed release-configuration APK from EAS | None needed; plain ongoing notification and heads-up alarm stay as in-app degrade paths |
| Skia critters | PASS on fidelity and caching; INCOMPLETE on device fps | Pixel diff 0.175 % (budget ≤ 2 %); 600-cell grid + 6 idle critters on iOS simulator | None needed: FlashList 2 for the grid; cached image per spec × pose × bucket, live draw-on for ≤ 2 critters |
| Motion / startup | PASS on transition and drag; INCOMPLETE on release cold start and download size | 16.67 ms worst frame gap (zero dropped frames) on transition and drag, simulator | Custom teleport overlay (`Link.AppleZoom` ruled out); no other fallback |
| Background location | PASS on session and dwell ring; PARTIAL on Live Activity update; INCOMPLETE on Android and battery | Dwell ring advances from real simulated-route fixes; Live Activity snapshot write fails with `CpAppGroupError` in this build | None needed: coarse session wakes the fine 50 m dwell check, While-In-Use first, Always as a later prompt |
| Tiles | PASS; offline PASS with a gap; INCOMPLETE on Android pan fps | Da Nang PMTiles 4,109,962 bytes; on-device pack download 617–1765 ms (simulator, 3 runs); renders from the local file with no PMTiles network calls | None needed: public `cp-tiles` R2 bucket, no tile server |
| Valhalla | PASS on routes; FAIL on 16 × 16 matrix | Walk route p95 133.4 ms, drive 124.6 ms (budget < 300 ms); matrix p95 walk 3803 ms, drive 3137 ms (budget < 1 s); build peaked at 24.57 GB of a 24.576 GB ceiling; 99.3 min tile build; 8.8 GB tiles; cold start not measured | Mapbox Directions/Matrix at launch behind `RoutingProvider`; Valhalla later (below) |

## Routing decision, 2026-09-27

The founder chose Mapbox Directions and Matrix for launch routing, implemented behind the routing
provider in `services/api/src/routing/`. Self-hosted Valhalla comes back later, as another
implementation of the same provider, when Mapbox routing spend passes the cost of a Valhalla
serving box sized for matrices, or when transit routing needs something Mapbox cannot do. The
Valhalla tooling in `tools/spikes/` stays. The Railway Valhalla spike services and their volume
were deleted the same day.

## Mapbox routing terms: build as designed, review before launch

Two clauses of the Mapbox product terms limit how routing results can be used (recorded in
`services/api/src/routing/README.md`). On 2026-09-27 the founder chose to build the designed
behaviour during development (stored leave-by times, the timed meet-up ETA refresh) and to settle
the terms, with Mapbox or by changing the behaviour, in the legal review before launch:

- **§2.10.1**: no caching or storing of Directions or Matrix results. The provider keeps no
  response cache; whether a derived value such as a plan item's leave-by time may be stored needs
  confirmation from Mapbox.
- **§1.9**: queries only in response to user actions, no automated queries. A timer-driven meet-up
  ETA re-query needs confirmation from Mapbox, or it re-queries only when a client reports a new
  location fix.
