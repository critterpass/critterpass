# Crew live map simulator

Four crewmates follow GPX tracks through Ubud toward a meet-up at Campuhan Ridge, posting a fix
every 5 s through `POST /v1/loc`: Maya and Rin walk together from Karsa Spa (one bunch), Alex walks
from Warung Pondok, Jordan rides a scooter in from the east (trail). Tracks live in `routes/`.

```sh
# Self-contained check (Docker): Postgres + Redis in Testcontainers, the api app and the worker's
# sched.enqueue_due / eta.meetups / location.expire jobs in process. About 5 minutes.
pnpm tsx tools/scripts/live-map-sim/sim.ts --check

# Drive a running stack, adding a device's user to the crew so the app shows the map.
pnpm tsx tools/scripts/live-map-sim/sim.ts --api http://localhost:8787 \
  --db postgres://app_owner:app_owner@127.0.0.1:54320/critterpass --join <uid> --speed 4 --minutes 10
```

`--check` asserts:

- ETAs recount every 60 ± 5 s (four consecutive `member_etas` runs for the meet-up).
- "Everyone is close" (`meetup.crew_close`) fires exactly once.
- The live snapshot returns all four sharing members.
- At the window end (fast-forwarded: the trip's last day moved to yesterday and each share's end
  and `location.expire` timer brought to now) every share is announced with `share.ended` and every
  participant gets a `trip_locations` unsubscribe.

There is no Centrifugo in the check: realtime hints are asserted as queued `rt_outbox` rows. The
relay's own suites (`services/worker/test/rt-relay.db.test.ts`, `tools/scripts/sync-e2e`) prove
that queued publishes and unsubscribes reach clients.

`seed.ts` is shared with the Maestro flows in `e2e/crew/live-map/`: one crew, a boosted trip in its
trip days and an unboosted one for the gate, all in `Asia/Makassar`.
