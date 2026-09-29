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
| `invite-tags` | 40 inviter notes (cases in `src/prompts/invite-tags/evals.yaml`): tags only from the taxonomy and supported by the note, nothing the friend avoids, injection held to three tags |
| `crew-welcome` | 12 welcome lines (`src/prompts/crew-welcome/evals.yaml`): one line under 90 characters greeting the newcomer, nothing from a crew name that tries to instruct |
| `tips` | 10 Home tip lines (`src/prompts/tips/evals.yaml`): one line under 120 characters naming the place, every number and month from the detector's facts, nothing from an event name that tries to instruct |
| `pitch` | 10 guide pitches (`src/prompts/pitch/evals.yaml`): a streamed headline, two or three reasons and a quote from the model, every number and month from the pitch tools (grounding 100 %), no budget or supplier names, nothing obeyed from text in the data |
| `guest-brief` | 15 guest-guide briefs (`src/prompts/guest-brief/evals.yaml`): 3 places searched on the allow-list (recorded Tavily) and 12 with a poisoned page; facts cite only fetched allow-listed pages, numbers only from their page, every line keeps the schema, and no injected instruction gets through |
| `draft` | 30 golden crews across the six guide cities, 20 redraft requests and 10 injection cases (`draft/golden`), run through the real drafting pipeline (outline, day plans, repair, redraft, summary line): validator-clean after repair, no invented ids, words-only prose, must-dos kept, planted instructions inert; at least 90% of drafts validator-clean on the first pass. Recordings in `draft/fixtures`, one per case, keyed by call |

## Running

```sh
pnpm --filter @cp/ai eval grounding          # one or more suites
pnpm --filter @cp/ai eval --all              # every suite
pnpm --filter @cp/ai eval --changed origin/main   # the suites a branch's changes can move
```

**Replay (default, CI).** Each case carries the model responses it is graded against: live
DeepSeek recordings in `test/fixtures/deepseek` (`replay.fixture`, or `replay.fixtures` in call
order for a multi-call turn), recorded Tavily searches in `test/fixtures/tavily`
(`search_fixtures`), or an inline `replay` answer. The request is still built by the real pipeline
and sent through the real gateway, tool registry and web search screen; only the network
boundaries replay. `llm-rubric` assertions need a model, so replay reports them as skipped, never
as passed.

**Live.** The same cases as whole turns against DeepSeek, rubrics included. Tool calls run through
the registry: `web_search` searches Tavily, every other tool answers `TOOL_UNAVAILABLE` (evals have
no database) and the model finishes its answer:

```sh
EVAL_MODE=live ANTHROPIC_API_KEY=<deepseek key> TAVILY_API_KEY=<key> pnpm --filter @cp/ai eval --all
```

Live runs call `https://api.deepseek.com/anthropic` unless `EVAL_BASE_URL` names another
Anthropic-format endpoint; `ANTHROPIC_BASE_URL` is ignored, so an ambient override is never graded
by accident, and the run prints the host it graded. `EVAL_RECORD=1` stores every model and search
response under the names a case lists, which is how its replay recordings are made. A case marked
`seeded` grades a validator on a deliberate model slip, so its inline answer is used in both modes.
A failed case prints what the client would have been shown.

**Compliance (Jev).** The `compliance` suite runs `checkCompliance` end to end. Replay serves
`compliance/recorded.json`: real `jev-1.13.0` responses keyed by a hash of each request, so
rewording a question or a case needs a new recording. Record from a live run:

```sh
EVAL_MODE=live EVAL_RECORD=1 TYPESAFE_API_KEY=<key> pnpm --filter @cp/ai eval compliance
```

A live run also prints Jev's p50/p95 latency. With `ANTHROPIC_API_KEY` set, a failed Jev call is
answered by the fast-tier twin on DeepSeek.

## Thresholds

`thresholds.json` holds the minimum pass rate per suite and mode, and `compliance_metrics` the
per-language targets the compliance suite must also meet. Replay is deterministic, so every
replay threshold is 1: any failing case fails the gate. Live thresholds allow for model variance.

## CI

`.github/workflows/ai-evals.yml` runs the changed suites on pull requests touching `packages/ai/**`
(and the domain AI and autonomy code), every suite on pushes to `main`, and a nightly full run,
which runs the generation suites live against DeepSeek (and Tavily) when the `ANTHROPIC_API_KEY`
secret holds the DeepSeek key, and `compliance` live against Jev when `TYPESAFE_API_KEY` is set.
The thresholds gate live runs exactly as they gate replay.
