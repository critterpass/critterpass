# Anthropic Messages API fixtures

Hand-authored from the API reference (https://platform.claude.com/docs/en/api/messages) with real
Claude model ids; re-record once a Claude key exists. `test/fixture-transport.ts` replays them in
place of `fetch`, so the real SDK client parses them end to end.

| File                     | Shape                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `haiku-basic.json`       | plain text answer, no cache                                   |
| `haiku-cache-write.json` | prefix written to the 5-minute cache (`cache_creation` split) |
| `haiku-cache-read.json`  | same prefix served from the cache (`cache_read_input_tokens`) |
| `haiku-tool-use.json`    | `stop_reason: tool_use` with a `places_search` call           |
| `haiku-stream.json`      | SSE events of a streamed answer                               |
| `sonnet-refusal.json`    | `stop_reason: refusal` with `stop_details`                    |
| `overloaded-529.json`    | overloaded error, retried                                     |
| `rate-limited-429.json`  | rate-limit error with `retry-after`                           |
