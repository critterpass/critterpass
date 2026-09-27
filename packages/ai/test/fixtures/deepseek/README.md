# DeepSeek recordings

Live responses from DeepSeek's Anthropic-format API (`https://api.deepseek.com/anthropic`), each file
naming its model and date in `source`. `test/fixture-transport.ts` replays them in place of `fetch`
(this is the default fixture directory), so the real SDK client parses them end to end.

- Unit-test recordings (`flash-basic`, `flash-cache-miss`/`flash-cache-hit`, the `flash-stream*`
  turns, `flash-quest-*`, `invalid-request-422`, `flash-decision-twin`) were captured with the
  gateway's own requests.
- Eval recordings (`flash-chat-*`, `flash-injection-*`, `pro-chat-*`, `pro-guest-*`) are written by a
  live eval run with `EVAL_RECORD=1` under the names each case lists in `replay.fixtures`.

Never edit a recording by hand; re-record it.
