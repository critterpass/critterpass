# Load tests

Capacity checks before launch. Every script refuses the production api; run them against staging
in a window the founder has agreed (staging runs on the same Railway plan as production, so a
run costs usage), and record the numbers in [docs/runbooks/capacity.md](../../../docs/runbooks/capacity.md).
Token and credential files they read or write (`rt-tokens.json`, service account JSON, device
token lists) stay out of git.

| Script                                           | What it proves                                                                                     | Pass mark                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `prepare-rt-tokens.ts` + `centrifugo.k6.js` (k6) | 10,000 realtime connections from real accounts, held while Centrifugo pings                        | 99 % connect, p95 connect < 1 s, no unexpected disconnects                      |
| `powersync.ts`                                   | many fresh accounts doing their first sync at once; rerun during `drills/failover.ts`              | no failures, p95 first complete checkpoint ≤ `--p95-ms` (5 s)                   |
| `push-fanout.ts`                                 | a burst of one push per member for 1,000 crews of 6 through FCM (validate only, nothing delivered) | no errors other than stale tokens; throughput well above the worker's send rate |

```sh
export API_BASE_URL=https://api-staging-de92.up.railway.app
pnpm tsx tools/scripts/load/prepare-rt-tokens.ts --accounts 200 --out rt-tokens.json
k6 run -e RT_URL=wss://centrifugo-staging-652b.up.railway.app/connection/websocket \
  -e TOKENS=rt-tokens.json -e TARGET_CONNECTIONS=10000 tools/scripts/load/centrifugo.k6.js
POWERSYNC_URL=https://powersync-api-staging.up.railway.app pnpm tsx tools/scripts/load/powersync.ts --staging --clients 200
FCM_SERVICE_ACCOUNT_JSON=certs/fcm-staging.json pnpm tsx tools/scripts/load/push-fanout.ts --tokens fcm-tokens.txt
```

Notes:

- Anonymous sign-ins are paced at two a second, under the auth rate limit; k6 spreads its 10,000
  connections over the prepared accounts (Centrifugo allows several connections per user).
- A 10,000-connection run needs k6 on a machine with enough file descriptors (`ulimit -n 20000`),
  not this Mac: use a CI runner or a short-lived cloud VM.
- APNs has no validate-only mode: a sandbox burst goes to the test devices and is run by hand.
- The AI job burst at a cost-cap edge is the cost guard drill in `docs/runbooks/alerts/ai-spend.md`:
  set a low `ai.cap.<tier>.daily_usd` on staging, ask the guide from several test accounts, and
  check the tier pauses within one guard tick (5 minutes) and the alert fires.
