# Anthropic-format status responses

Error responses in the Anthropic Messages format, hand-authored from the API reference, that
exercise the gateway's retry handling (`anthropic/<name>` in `fixtureTransport`). They carry no model
behaviour; every model response a test replays is a live recording in `../deepseek`.

| File                    | Shape                                  |
| ----------------------- | -------------------------------------- |
| `overloaded-529.json`   | overloaded error, retried with backoff |
| `rate-limited-429.json` | rate-limit error with `retry-after: 1` |
