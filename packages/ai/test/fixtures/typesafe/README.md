# TypeSafe Jev fixtures

Replayed by `test/fixture-transport.ts` (`fixtureTransport(names, { dir: 'typesafe' })`) in place of
`fetch`, so the real decision client parses them end to end. Model replies are live recordings;
error envelopes Jev cannot be made to return on demand are authored from the documented status.

| File | Shape |
| --- | --- |
| `jev-help-intent.json` | live `jev-1.13.0` answer to a choice, a noul and a score over one state |
| `jev-unauthorized-401.json` | live response to a rejected API key |
| `jev-overloaded-529.json` | overloaded (authored from the documented status) |
| `jev-rate-limited-429.json` | rate limited with a short `retry-after` (authored) |
| `jev-rate-limited-429-long.json` | rate limited with a `retry-after` too long to wait for (authored) |
| `jev-compliance-*.json` | live compliance-check answers (one noul per category) for eval cases: a figurative guide question, stated self-harm, a hidden instruction in a forwarded email (as an import and pasted into a guide question), drugs offered in a public tip |

The Haiku twin's reply to the same questions is `../anthropic/flash-decision-twin.json`.
