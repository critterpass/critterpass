# Spike: TypeSafe Jev as a decision model for CritterPass

Date 2026-09-27 · Docs: https://docs.typesafe.ai (llms.txt, API, Models, Jev 1.13 jaggedness) · Model answered: `jev-1.13.0`

## What Jev is

- Not an LLM. "System One" decision model: `POST https://api.typesafe.ai/v1/systemone` with `{state, model, questions}`, returns typed answers only.
- 3 primitives: **Choice** (≤255 options, probabilities + confidence), **Score** (2–10 ordered levels), **Noul** (yes-probability 0–1).
- Many questions on one state per call (fan-out); state ingested once.
- Price **$0.042 / Mtok input, output free**. Haiku 4.5 is $1 in / $5 out → ~24× cheaper on input alone.
- Limits: 64k tokens/request (32k state + longest question); 250k tok/s, 1,200 req/min (docs: "adjusting dynamically", may change without notice).
- Text only. English primary; other languages "handled, not equally well".
- Not trained on customer data; ZDR only on enterprise plans; DPA on legal page.
- Documented weaknesses: literal reading, counting/math, date comparison, multi-hop indirection, distractor-heavy state, adversarial state, generation.
- JS SDK `@typesafe-ai/sdk` (Node ≥ 20, ESM + types); plain fetch is enough.

## Live results (from Asia/Saigon, jev-latest)

No Claude baseline: local `.env` `ANTHROPIC_BASE_URL` proxy serves `deepseek-flash`, not Haiku, so head-to-head accuracy was not measured. Costs below use list prices.

| Task (CritterPass shape) | Primitive | Accuracy | p50 latency | USD / 1k calls |
|---|---|---|---|---|
| Help intent, 7 topics, EN + VI | Choice | 10/10 (conf ≥ 0.98) | 258 ms | 0.021 |
| Guide chime-in on crew chat | Noul | 6/6 (+ "guide muted" case) | 281 ms | 0.014 |
| Idea duplicate tiebreak | Noul | 4/6; misses at p = 0.49 / 0.64 (gray zone, one label debatable) | 252 ms | 0.014 |
| POI conflation, VI ↔ EN names | Noul, 8 pairs in 1 call | 8/8 (Chùa Cầu ↔ Japanese Covered Bridge, Bảo tàng Chứng tích ↔ War Remnants) | 259 ms total | 0.006 per pair |
| Untrusted-input screen | Choice | 7/7 (injection, harassment, self-harm, "kill time" safe) | 237 ms | 0.017 |
| Indirect injection hidden in forwarded booking email | Noul | caught (0.98); benign imperative email 0.08 | 265 ms | — |
| Receipt: pick total line from OCR lines | Choice | correct (0.99) | 251 ms | — |
| Place ↔ taste fit | Score | high 1.99, low 0.00 | 270 ms | — |

- Consistency: same request 5× → 0.46, 0.46, 0.45, 0.46, 0.49 (stable, and honest about the gray zone).
- 40 parallel requests: all 200, p50 460 ms, p95 507 ms, wall 511 ms.
- Fan-out: 60 questions over one state = 319 ms, 2,537 tokens, **$0.0001**.

Haiku 4.5 reference for a ~300-token classifier call with ~5 output tokens: ≈ $0.33 / 1k calls vs Jev ≈ $0.013 / 1k. Small static prompts sit under Haiku's minimum cacheable length, so caching doesn't close the gap.

## Where it fits in CritterPass

**Replace (Haiku routes that are pure decisions today, declared in `packages/ai/src/routing.ts`, not yet implemented):**
1. `guide.chime_in_classifier`: runs on every crew message, so it's the biggest volume and the biggest saving. Noul + chattiness budget in code.
2. `help.intent_classifier`: Choice; confidence < 0.5 → ask the user or send to a human.
3. `idea.duplicate_tiebreak`: Noul; 0.35–0.65 band → Haiku (or keep both ideas).

**New capability at near-zero cost:**
4. POI conflation gray zone (`services/worker/src/places/conflate.ts`): trigram ≥ 0.6 misses cross-language names; send pairs within 60 m with low trigram to Jev in batched fan-out.
5. Untrusted-input screen before `guide.*` and `email.parse` / `receipt.parse`: complements `context/wrap-untrusted.ts`; costs little enough to run on every message.
6. First-pass text moderation for tips, notes, ratings and shared plans (moderation kind handlers): uncertain → ops queue. Avatars are images, so they stay on the existing path.
7. Ranking signals: taste-fit Score per candidate place as a feature; ranking arithmetic stays in code, as D5 requires.
8. Parse cascade: OCR/regex candidates → Jev picks total, currency and date parts → Sonnet only on low confidence. Only worth trying after 1–5.

**No fit:** any generation (guide chat and voice, quests, roundup, drafts, recap, pitch, fit_line, notification templates, content factory), anything image-based, and all money/date arithmetic.

## Integration shape (if approved)

- `packages/ai`: a separate decision client (not an `AiTier`), fetch-based and typed per question. Routes gain `provider: 'claude' | 'jev'`, with a Haiku fallback on 429/529, timeouts (~800 ms) and low confidence.
- `ai_usage`: `tier` CHECK is `haiku|sonnet|opus`, so it needs a migration adding `jev`, plus a price row of 42,000 micros per Mtok input and 0 for output.
- Evals: add a promptfoo HTTP provider for these routes so they share the Claude eval surface (D5).
- Pin `jev-1.13.0` (not `jev-latest`), because confidence thresholds are tuned per version.
- Secrets: `TYPESAFE_API_KEY` in `.env` / Railway only.

## Risks

- **D5 is "Claude only".** Adopting Jev needs a founder amendment. Its rationale (persona quality, single eval surface) isn't hit by non-generative classifiers, but it is still a reversal.
- Vendor maturity: rate limits are explicitly unstable. Mitigation: every Jev route keeps its Haiku fallback.
- Privacy: crew chat and emails go to a new processor, and ZDR is enterprise-only. We have no subprocessor list yet; the privacy policy and store data-safety forms need updating.
- Vietnamese: the small sample worked, but the docs say accuracy is lower outside English. Needs an eval set per route before switching.
- Adversarial state: the docs admit it can be steered. The screen is a signal, not the only defence.

## Outcome (2026-09-27)

Founder adopted option A: D5 amended, [decision record](../../docs/decisions/20260927-jev-decision-model.md), phase 13 tasks T10 (decision client) and T11 (input compliance check); consumer phases 18, 31, 32, 34, 35, 44, 47, 52, 56 now call the shared primitives. `TYPESAFE_API_KEY` is in the local `.env` only.

## Unresolved questions

- Enterprise/ZDR with TypeSafe before production traffic that includes crew or guide text (phase 13 non-code dependency).
- Actual latency from Railway's region to api.typesafe.ai was not measured (only from Saigon).
- The API key was pasted in chat; rotate it before production use.
