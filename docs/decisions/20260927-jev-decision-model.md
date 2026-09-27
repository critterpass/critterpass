# Jev decision model for typed decisions and input compliance

Date: 2026-09-27
Status: decided (founder). Amends D5 ("Claude only") in `docs/product-decisions.md`.
Evidence: `plans/reports/spike-260927-2328-jev-typesafe-decision-model-report.md`.

## Context

D5 routes every AI call to Claude. Several routes are not generation at all: they pick a label,
answer yes/no or score against a rubric (`guide.chime_in_classifier`, `help.intent_classifier`,
`idea.duplicate_tiebreak`, and the moderation classifiers planned in the community, driver
directory and help phases). TypeSafe's Jev (`jev-1.13.0`) is a "System One" model built for exactly
that shape: `POST https://api.typesafe.ai/v1/systemone` with a `state` and named typed questions
(Choice, Score, Noul), returning probabilities and a confidence, never text.

The spike measured 10/10 intent, 6/6 chime-in, 8/8 cross-language POI matches, 7/7 input screening
(injection, harassment, self-harm) plus an indirect injection hidden in a forwarded booking email,
p50 ≈ 250 ms from Saigon, 40 parallel calls with p95 ≈ 510 ms, and a stable noul across repeats.
Price is $0.042 per million input tokens, output free: about 25× cheaper than Haiku 4.5 on a
classifier call.

## Decision

- **Claude stays the only model for generation**: guide chat and voice, drafts, pitches, parsing
  that produces fields, recaps, content factory. Persona quality and grounding rules are unchanged.
- **Jev is allowed for typed decisions**: a route whose output is a closed label set, a yes/no
  probability or a rubric score may run on Jev. Every Jev route declares a Haiku fallback that
  returns the same answer shape.
- **Input compliance check** is the first shared Jev capability: one call screens user or imported
  text for a fixed category set and returns `pass | review | reject` per surface policy. It replaces
  the per-phase Haiku moderation classifiers.
- Numbers, dates and arithmetic stay in code (D5's "all numbers come from code" is unchanged; Jev is
  documented as weak at them).

## Rules

| Rule | Why |
|---|---|
| Pin `jev-1.13.0`, never `jev-latest` | thresholds are tuned per model version; an alias move would silently shift verdicts |
| Thresholds live in code/config per route and surface, tuned on the route's eval set | calibrated probabilities are only useful against a measured threshold |
| Fallback to the Haiku twin on 429/529, timeout (800 ms) or transport error; mark `ai_usage` and the verdict with the model that answered | TypeSafe's rate limits are documented as "adjusting dynamically" |
| Low confidence is a first-class outcome (`review`, ask the user, or Haiku), never a silent guess | the confidence signal is the point of the model |
| Send only the text the question needs: no uid, names or trip context unless the question is about them | new processor; data minimisation; Jev also degrades with irrelevant state |
| Deterministic checks first: phone, email, URL and card or passport patterns via code | cheaper and exact; the model judges only what code cannot |
| Every Jev route has a promptfoo suite with EN and VI cases before it serves production | English is Jev's primary language; the spike's VI results are a small sample |
| Not for images, audio, generation, counting, date comparison | documented Jev 1.13 weaknesses |

## Consequences

- `packages/ai` gains a decision client beside the Claude client; `ai_usage.tier` gains `jev`.
- New env var `TYPESAFE_API_KEY` (`.env`, Railway api + worker, GitHub secret for evals).
- TypeSafe becomes a data processor: sign its DPA, list it with Anthropic in the privacy policy and
  store data-safety forms; zero data retention is enterprise-only, so ask for it before launch.
- Consumer phases (community tips, driver tips, photo notes, idea board, vendor replies, RSVP intent,
  feedback triage, email imports, guide input, POI duplicate sweep) call the shared primitives
  instead of defining their own Haiku classifiers.
