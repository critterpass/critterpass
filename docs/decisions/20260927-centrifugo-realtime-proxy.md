# S-RT: Centrifugo v6 subscribe proxy, presence, revocation, recovery, 5k sockets

Date: 2026-09-27
Status: PASS

## Context

D4 requires Centrifugo v6 (OSS) + Redis 8 as the realtime layer: a subscribe proxy enforcing
crew membership, server-triggered revocation under 1 s, recovery after a real background
period, and horizontal scaling across nodes sharing one Redis engine
(system-architecture.md §4.3, §11; api-contracts-async.md §1.1–§1.2).
`tools/spikes/src/s-rt/` runs S-RT's own 2-node Centrifugo + Redis (never the shared
`infra/docker-compose.yml`) against a real JWKS source (the S-AUTH harness reused from T2).

## Criteria (phase-02 §Requirements, S-RT)

| # | Criterion | Result |
|---|---|---|
| 1 | JWT via JWKS; subscribe proxy allows members, denies others | PASS |
| 2 | Server-side unsubscribe after removal, p95 < 1 s | PASS (p95 3.4 ms, local network — see Method) |
| 3 | Presence + history | PASS |
| 4 | Recovery after 2 min app background | PASS (real 120 s wait, not simulated) |
| 5 | 5k sockets on 2 nodes | PASS (5000/5000, 0 failures) |

## Method

- `tools/spikes/src/s-rt/docker-compose.yml`: 2 Centrifugo v6.9.6 nodes + one Redis 8 engine,
  ports 8801/8802, project `cp-spike-s-rt`. `config.json` configures the `crew` namespace
  (matches `crew:{crew_id}` per api-contracts-async.md §1.2) with presence, history,
  `force_recovery`/`force_positioning`.
- JWKS + connection tokens: reuses `tools/spikes/src/s-auth/harness.ts`
  (`createAuthHarness`) — real EdDSA JWTs, real `/jwks` HTTP endpoint, `aud: rt`.
- Subscribe proxy: `tools/spikes/src/s-rt/proxy.ts`, an in-memory `MembershipStore`
  (`membership.ts`) standing in for the real `crew_members` lookup.
- `tools/spikes/src/s-rt/run.ts`: proxy allow/deny, revocation latency (5 samples), presence,
  and the 2-minute recovery test, against real WebSocket connections (`centrifuge` 5.7.4).
  `load.ts`: ramps sockets across both nodes in batches of 250, measuring connect latency.
- Rerun: `pnpm --filter @cp/spikes test` (proxy decision unit tests, no infra),
  `pnpm --filter @cp/spikes run s-rt` (full scenario incl. the real 120 s wait — takes
  ~2.5 minutes), `pnpm --filter @cp/spikes run s-rt:load -- --sockets 5000`.

## Raw numbers

```json
{"proxy":{"memberAllowed":true,"outsiderDenied":true},
 "revocation":{"count":5,"p50Ms":1.19,"p95Ms":3.40,"p99Ms":3.40,"maxMs":3.40},
 "presence":{"sawClient":true},
 "recovery":{"wasRecovering":true,"recovered":true,"missedPublicationDelivered":true,"backgroundSeconds":120}}
```

```json
{"targetSockets":5000,"connected":5000,"failures":0,
 "connect":{"p50Ms":74.4,"p95Ms":140.4,"p99Ms":302.3,"maxMs":321.6},
 "heldOpenRoundTrip":{"p50Ms":1.09,"p95Ms":1.77,"p99Ms":4.70},
 "memory":{"rss":503169024}}
```

`heldOpenRoundTrip` pings an `rpc` method this harness never registers a handler for; it
measures that 5,000 held-open sockets stay responsive under load, not a real round-trip
contract.

**Caveat:** revocation and connect timings are on loopback Docker (this machine), not staging
network. They measure the proxy/publish/engine overhead in isolation — real mobile-client
latency to Railway SG would add genuine network RTT on top. Sub-10 ms overhead here is a
strong signal the 1 s p95 budget holds once that RTT is added; re-measure from a staging
Centrifugo deployment before treating the exact number as production-representative.

## Findings (apply to the real realtime build, phase 10 — not spike-only workarounds)

1. **A namespace needs `"subscribe_proxy_enabled": true` in addition to the top-level
   `channel.proxy.subscribe` endpoint config.** Without it, Centrifugo denies every subscribe
   to that namespace natively (`code 103, "permission denied"`) without ever calling the
   proxy — easy to miss since the error gives no hint the proxy was never invoked.
2. **A subscribed client's own `sub.presence()` call needs separate permission from
   `"presence": true`.** OSS Centrifugo needs the namespace flag `allow_presence_for_subscriber`
   (or `allow_presence_for_client`); the subscribe-proxy response field `allow: ["prs"]` from
   the docs is Centrifugo **PRO** only and is silently ineffective on OSS.
3. **Better Auth's `jwt` plugin `/jwks` endpoint never sets a key's `use` field**
   (`{alg, crv, kty, x, kid}`, no `use`). **Centrifugo v6.9.6 silently rejects such a key**
   ("invalid token: jwks: public key not found", despite the `kid` matching) — confirmed by
   feeding it a hand-built JWKS with and without `use: "sig"` for the identical key. Real S-RT
   traffic needs a rewrite step in front of `/jwks` (`tools/spikes/src/s-rt/jwks-rewrite.ts`)
   until/unless Better Auth's jwt plugin adds the field itself.
4. **Centrifugo caches a JWKS fetch for one hour with no retry on a cache miss**, and its
   first-ever fetch uses a 1 s timeout with one retry (not configurable —
   centrifugal.dev/docs/server/authentication). A slow first fetch (e.g. under host load) can
   wedge a node's token verification for the full hour. Mitigation used here: a startup canary
   connection with up to 5 attempts, restarting just the Centrifugo containers (never Redis)
   between attempts (`tools/spikes/src/s-rt/harness.ts: waitForWorkingJwks`).
5. **`centrifuge-js` emits a real `'error'` event on a failed connect/subscribe, separately
   from rejecting the promise.** Node's `EventEmitter` throws when `'error'` has no listener,
   so every `Centrifuge`/`Subscription` instance needs a no-op `.on('error', ...)` even when
   only the promise rejection is read — otherwise a *denied* subscribe crashes the process
   instead of resolving to a handled rejection.

## Verdict

**PASS.** All five criteria hold, including the two real-time-consuming ones done for real
(120 s background/recovery, 5,000 concurrent sockets). Fallback (tune Redis engine / add
nodes) is not needed.

## Chosen path

Centrifugo v6 OSS + Redis 8 engine as designed. Carry findings 1–5 into phase 10's real
config and the api service's JWKS exposure verbatim — in particular, decide during phase 10
whether to patch Better Auth's jwt plugin to add `use: "sig"` or keep a small rewrite in
front of it in production, since finding 3 is a hard compatibility gap, not a matter of taste.

## Founder follow-ups

None. This spike needed no external account or paid service.

## Rerun

```
pnpm --filter @cp/spikes test
pnpm --filter @cp/spikes run s-rt
pnpm --filter @cp/spikes run s-rt:load -- --sockets 5000
```
