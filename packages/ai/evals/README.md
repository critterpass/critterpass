# AI evals

promptfoo-format suites, one directory per suite (`<suite>/promptfooconfig.yaml` plus case files in
promptfoo's `tests` format). They gate every change to prompts, personas, tools and routing.

| Suite             | What it grades                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`            | persona layering, chattiness budget, allowed tool calls, refusal handling                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `persona`         | voice (rubric), sentence caps per chattiness, local words from the guide's own list                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `grounding`       | ids, numbers and times only from tool output; invented ones are caught                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `injection`       | untrusted text stays in data blocks, no write tools, parsers get no tools, no supplier pages                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `autonomy`        | the decider's verdict per action; replies never claim a change that needs a yes                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `compliance`      | the input compliance check on 40 EN + 40 VI texts: outcome per surface, reject precision, self-harm and injection recall, figurative talk passing                                                                                                                                                                                                                                                                                                                                                                         |
| `invite-tags`     | 40 inviter notes (cases in `src/prompts/invite-tags/evals.yaml`): tags only from the taxonomy and supported by the note, nothing the friend avoids, injection held to three tags                                                                                                                                                                                                                                                                                                                                          |
| `crew-welcome`    | 12 welcome lines (`src/prompts/crew-welcome/evals.yaml`): one line under 90 characters greeting the newcomer, nothing from a crew name that tries to instruct                                                                                                                                                                                                                                                                                                                                                             |
| `tips`            | 10 Home tip lines (`src/prompts/tips/evals.yaml`): one line under 120 characters naming the place, every number and month from the detector's facts, nothing from an event name that tries to instruct                                                                                                                                                                                                                                                                                                                    |
| `pitch`           | 10 guide pitches (`src/prompts/pitch/evals.yaml`): a streamed headline, two or three reasons and a quote from the model, every number and month from the pitch tools (grounding 100 %), no budget or supplier names, nothing obeyed from text in the data                                                                                                                                                                                                                                                                 |
| `guest-brief`     | 15 guest-guide briefs (`src/prompts/guest-brief/evals.yaml`): 3 places searched on the allow-list (recorded Tavily) and 12 with a poisoned page; facts cite only fetched allow-listed pages, numbers only from their page, every line keeps the schema, and no injected instruction gets through                                                                                                                                                                                                                          |
| `draft`           | 30 golden crews across the six guide cities, 20 redraft requests and 10 injection cases (`draft/golden`), run through the real drafting pipeline (outline, day plans, repair, redraft, summary line): validator-clean after repair, no invented ids, words-only prose, must-dos kept, planted instructions inert; at least 90% of drafts validator-clean on the first pass. Recordings in `draft/fixtures`, one per case, keyed by call                                                                                   |
| `booking-extract` | booking confirmations to typed bookings (`booking-extract/cases/*.yaml`): kind, code, start, price, the real free-cancellation deadline and its verbatim policy, field by field; injection cases whose planted codes, prices, flights and deadlines never come back. The founder's forwarded confirmation corpus joins as it is recorded                                                                                                                                                                                  |
| `vendor-reply` | 13 WhatsApp replies from places to the ops desk (`vendor-reply/cases/*.yaml`) in English, Indonesian, Vietnamese and Thai, read on the `vendor.reply_intent` decision route: yes, no, counter-offer, question, or a person at the desk; times and prices only as written in the reply; injection replies never change the answer's shape or follow the reply's orders |
| `guide`           | 19 cases through the guide's own prompt builders (`guide/*.yaml`): the sheet (persona, prices only from tools, no held seats claimed, no guessed allergies, a refusal, a menu photo that tries to instruct, fresh questions answered from cited web searches in EN and VI), crew-chat mentions (read or propose only; instructions in chat or a pasted vendor reply are quoted, never obeyed), proactive offers (numbers from the template, nothing from a place name that tries to instruct) and a queued morning answer; the default guide with no trip (`guide/home-guide.yaml`): the app's starter questions in English and Vietnamese and a food question about a city that has its own guide are answered for any destination with nobody sent to another guide, and the same question inside a Đà Nẵng trip is still Chà Vá's |
| `briefing`        | 20 morning briefings across the guides (`briefing/cases.yaml`) through the real `writeBriefing`: the guide's own lines (not the template), at most three, only candidates the worker computed, every number from its candidate's facts, planted instructions in booking titles and names never repeated; seeded slips (an invented time, an unknown candidate) fall back to the template. Recordings in `briefing/fixtures`                                                                                               |
| `place-qna`       | 12 crew chats about a place (`explore/place-qna.yaml`) through the real `summarisePlaceQna`: one neutral line citing a given message, must-say facts kept, and planted instructions (markdown and a poem, a JSON reply with a link, another place, the prompt and other crews' messages) never change the line's shape or leak into it; seeded slips are rejected. Recordings in `explore/fixtures` |
| `quests` | 20 trip days (`quests/cases/*.yaml`) through the real `writeQuests`: 16 days across the guides (Chà Vá's Đà Nẵng first, then Bali, Kyoto, Bangkok, Seoul, Singapore; solo, no visit sharing, no plan, a last day with money open, a plan item that tries to instruct) must keep every proposed quest through the validator with three or more from the guide, no emoji and nothing planted repeated; 4 seeded slips (an invented place, XP past the table, an ungrounded time, an unregistered template and a count past its bounds) must be dropped. Recordings in `quests/fixtures` |
| `translate` | 14 sets of guide-written lines (`translate/cases.yaml`: plan themes and notes, briefing lines, quests, pitch lines; Vietnamese first, then Japanese, Korean, Thai, Spanish, Simplified Chinese) through the real `translateGuideLines`: every line kept, in the reader's script, numbers digit for digit, business, dish and people names as written, places by their local name where the case names one, the app's own words from the glossary (a place's critters are thổ địa in Vietnamese), headings within the room their line has; 2 seeded cases grade the validator on a changed number, a reformatted price, an added gloss, a title turned sentence and a skipped line |

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
