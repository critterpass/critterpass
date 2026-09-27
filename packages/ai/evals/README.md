# AI evals

promptfoo-format suites, one directory per suite (`<suite>/promptfooconfig.yaml` plus case files in
promptfoo's `tests` format). They gate every change to prompts, personas, tools and routing.

| Suite        | What it grades                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`       | persona layering, chattiness budget, allowed tool calls, refusal handling                                                                         |
| `persona`    | voice (rubric), sentence caps per chattiness, local words from the guide's own list                                                               |
| `grounding`  | ids, numbers and times only from tool output; invented ones are caught                                                                            |
| `injection`  | untrusted text stays in data blocks, no write tools, parsers get no tools, no supplier pages                                                      |
| `autonomy`   | the decider's verdict per action; replies never claim a change that needs a yes                                                                   |
| `compliance` | the input compliance check on 40 EN + 40 VI texts: outcome per surface, reject precision, self-harm and injection recall, figurative talk passing |

## Running

```sh
pnpm --filter @cp/ai eval grounding          # one or more suites
pnpm --filter @cp/ai eval --all              # every suite
pnpm --filter @cp/ai eval --changed origin/main   # the suites a branch's changes can move
```

**Replay (default, CI).** Each case carries the model response it is graded against: a recorded
fixture in `test/fixtures/anthropic` or an inline `replay` answer. The request is still built by the
real pipeline and sent through the real gateway; only the network boundary replays. `llm-rubric`
assertions need a model, so replay reports them as skipped, never as passed.

**Live.** Once a Claude key exists, run the same cases against Anthropic's API, rubrics included:

```sh
EVAL_MODE=live ANTHROPIC_API_KEY=<claude key> pnpm --filter @cp/ai eval --all
```

Live runs call `https://api.anthropic.com` unless `EVAL_BASE_URL` names an Anthropic-compatible
endpoint to grade instead (development runs use DeepSeek's, `https://api.deepseek.com/anthropic`,
which answers Claude model names with its own models). `ANTHROPIC_BASE_URL` is ignored, so a local
stand-in endpoint is never graded by accident; the run prints which host it graded. Replace a case's inline `replay` with a recorded fixture when
re-recording from a real Claude response.

**Compliance (Jev).** The `compliance` suite runs `checkCompliance` end to end. Replay serves
`compliance/recorded.json`: real `jev-1.13.0` responses keyed by a hash of each request, so
rewording a question or a case needs a new recording. Record from a live run:

```sh
EVAL_MODE=live EVAL_RECORD=1 TYPESAFE_API_KEY=<key> pnpm --filter @cp/ai eval compliance
```

A live run also prints Jev's p50/p95 latency. With `ANTHROPIC_API_KEY` set, a failed Jev call is
answered by the Haiku twin (pointed at `EVAL_BASE_URL` in development).

## Thresholds

`thresholds.json` holds the minimum pass rate per suite and mode, and `compliance_metrics` the
per-language targets the compliance suite must also meet. Replay is deterministic, so every
replay threshold is 1: any failing case fails the gate. Live thresholds allow for model variance.

## CI

`.github/workflows/ai-evals.yml` runs the changed suites on pull requests touching `packages/ai/**`
(and the domain AI and autonomy code), every suite on pushes to `main`, and a nightly full run,
which switches to live mode when the `ANTHROPIC_API_KEY` repository secret is set. The nightly
run also grades `compliance` live against Jev whenever the `TYPESAFE_API_KEY` secret is set.
