# Age rating questionnaires

Proposed answers for App Store Connect's age rating and Google Play's IARC questionnaire, from what
the app contains on 2026-10-07. The founder files them; items marked unknown need a decision first.
`apps/mobile/store.config.json` has no `apple.advisory` block yet, so nothing is filed from the
repository today.

| Topic | Proposed answer | Basis |
|---|---|---|
| Violence, sexual content, profanity, horror, drugs, alcohol and tobacco references made by us | None | cartoon animal guides; travel planning content |
| User-generated content | Yes: crew chat (text, photos, voice notes), public plans and community posts | `apps/mobile/src/ui/chat`, `apps/mobile/src/features/community`; rules in `packages/content/src/legal/community-guidelines` |
| Moderation, reporting and blocking for that content | Present in code: per-user mute (`user_settings.muted_uids`, docs/data-model.md), media moderation status on avatars, a moderation intake in `services/api/src/admin/moderation-intake.ts`. That report and block are reachable from every user-content surface was **not verified** on a device (unknown) | |
| Users can message each other | Yes, inside a crew joined by invite | |
| Shares location with other users | Yes, precise, opt-in, inside a crew and time-limited | docs/data-model-sync-and-privacy.md §6 |
| Unrestricted web access | Unknown: partner links open outside the app or in an in-app browser; which one was not checked | |
| Gambling, contests, loot boxes | No real-money gambling. Critters hatch from eggs by place and time; whether any paid item has a chance-based outcome is **unknown** and decides the "loot box" answer | |
| In-app purchases | Yes (subscriptions and one-off purchases through the stores, `react-native-purchases`) | `apps/mobile/package.json` |
| Advertising | No (see [affiliate-disclosure.md](affiliate-disclosure.md)) | |
| AI chatbot | Yes: guides answer in natural language; see [ai-disclosure.md](ai-disclosure.md) | |
| Medical or health information | Dietary needs and allergies as trip preferences only; no treatment advice | |
| Made for children / target audience | Not directed at children. The minimum age in the terms and the store age band are counsel and founder decisions (unknown) | `packages/content/src/legal/terms/1.0.0.mdx` |

Expected outcome, to be confirmed by the questionnaires themselves: a teen-level rating driven by
user-generated content and user-to-user messaging.
