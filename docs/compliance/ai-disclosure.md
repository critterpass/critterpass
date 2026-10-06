# AI disclosure (EU AI Act Art. 50)

Requirement (docs/system-architecture.md §13, docs/code-standards.md "Disclosure"): people are told
they are talking to an AI, and AI-generated content is marked as such on every guide surface.
Facts below were read from the repository on 2026-10-07.

| Surface | What exists | Evidence | Status |
|---|---|---|---|
| Guide answers (stream) | every finished turn carries `ai_generated: true` and its sources | `packages/ai/src/runner/sse.ts`, `packages/ai/src/runner/turn.ts` | marker sent by the server |
| Destination pitches, guest brief | `ai_generated` set when the text came from a model | `services/api/src/routes/pitches.ts`, `services/api/src/routes/guest-brief.ts` | marker sent by the server |
| Place profile | label "AI summary" (`explore.profile.label`) | `apps/mobile/src/features/explore/place-detail/place-profile.tsx` | labelled in the app |
| Web tips articles | "Drafted with help from AI…" shown when `ai_assisted` | `apps/web/src/components/site/tips/TipArticle.astro`, `packages/content/src/tips/schema.ts` | labelled on the page |
| Legal | "AI guides" document: every guide is an AI and never pretends to be a person | `packages/content/src/legal/ai/1.0.0.mdx`, linked from the privacy policy | draft, not counsel-approved |
| Guide chat, plan changes written by a guide, pitches and briefs **in the app** | no user-facing text found: `ai_generated` is read nowhere in `apps/mobile/src` outside test support, and the English catalogue (`packages/i18n/locales/en`) holds no other string that says AI | `grep -rn ai_generated apps/mobile/src`; `grep -rn -E 'msgstr ".*\bAI\b' packages/i18n/locales/en` | **open** |

## Open

1. In-app disclosure on guide surfaces is not evidenced. The legal document says "the app always
   says so"; the app's copy does not show where. Either a visible label exists that these searches
   miss (for example an image or a design element; unknown), or the label has to be added by the
   owners of the guide chat, plan change and pitch surfaces. Until then this gate is open.
2. A device check (a Maestro assertion on each guide surface for the disclosure text) can only be
   written once the text and its test id exist.
3. Whether the character presentation of guides (named animals) needs a first-use notice in
   addition to per-message marking is a question for counsel (founder item).
