# AI spend spike (P1)

**Signal:** model spend in the last hour is above 15 USD (`cp-p1-ai-spend-spike`). The P2 rule watches the day; the worker's `ops.ai_cost_guard` cron (every 5 minutes) alerts at 80 % of a cap and pauses a tier at 100 % until the day ends.

**Likely causes:** a launch or press spike (real use); one user or script looping a feature (abuse); a retry loop in a job calling the gateway again and again; a prompt change that ballooned tokens.

**Checks**
1. Grafana AI dashboard: spend by `feature` and `tier`. One feature points at a loop or a prompt change; all features at once points at real traffic.
2. Ops console AI usage: top users and trips for the hour; the guard state ("guard OK", paused tiers).
3. Langfuse: traces of the top feature, token counts per call.

**Mitigation:** for abuse, ban or rate-limit the account from the ops console. For a loop, switch the feature off (`ai.<route>.enabled` in the ops console; the app shows its fallback) and roll back. For real traffic, leave the guard to pause at its caps, or raise a cap with the founder. A tier is never downgraded automatically: only the founder's audited admin toggle changes models.

**Rollback:** switch the feature back on once fixed; caps reset at 00:00 UTC.
