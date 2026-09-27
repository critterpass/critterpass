# Anthropic Messages API fixtures

Hand-authored from the API reference (https://platform.claude.com/docs/en/api/messages) with real
Claude model ids; re-record once a Claude key exists. `test/fixture-transport.ts` replays them in
place of `fetch`, so the real SDK client parses them end to end.

| File                                   | Shape                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `haiku-basic.json`                     | plain text answer, no cache                                                                |
| `haiku-cache-write.json`               | prefix written to the 5-minute cache (`cache_creation` split)                              |
| `haiku-cache-read.json`                | same prefix served from the cache (`cache_read_input_tokens`)                              |
| `haiku-tool-use.json`                  | `stop_reason: tool_use` with a `places_search` call                                        |
| `haiku-stream.json`                    | SSE events of a streamed answer                                                            |
| `haiku-injection-ignored.json`         | answer to a turn quoting an injected crew message: text only, no tool call                 |
| `sonnet-refusal.json`                  | `stop_reason: refusal` with `stop_details`                                                 |
| `overloaded-529.json`                  | overloaded error, retried                                                                  |
| `rate-limited-429.json`                | rate-limit error with `retry-after`                                                        |
| `sonnet-web-search.json`               | guest-guide answer from Anthropic web search with cited results                            |
| `sonnet-web-search-supplier-leak.json` | web search that returned and cited a supplier page (the case the code-side screen catches) |
| `haiku-stream-tool-use.json` | streamed turn that calls `places_search` (`stop_reason: tool_use`) |
| `haiku-stream-after-tool.json` | streamed answer after a `TOOL_UNAVAILABLE` tool result |
| `haiku-stream-refusal.json` | streamed turn ending in `stop_reason: refusal` |
| `batch-create.json` | Message Batches create response (`processing_status: in_progress`) |
| `batch-in-progress.json` | batch retrieve while still processing |
| `batch-ended.json` | batch retrieve once ended, with `results_url` and request counts |
| `batch-results.json` | `.jsonl` results out of request order: two `succeeded` (batch service tier), one `errored` |
| `haiku-decision-twin.json` | live recording of a decision route's Haiku twin through the development endpoint: JSON answer text |
| `haiku-stream-write-tool.json` | live recording of a streamed guide turn calling `propose_plan_changes` with schema-valid input (development endpoint) |
