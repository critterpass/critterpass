# Review fixes: start, home, account

14 Oct 2026, branch `fix/premium-review-start-home` (worktree `review-start-home`), on `origin/feat/drop-legacy-ui` (merged up to 1971d8555). Paths are under `apps/mobile/src/`.

## Fixed

| Finding | Fix |
|---|---|
| Inbox has no way out (HIGH) | `home/premium/inbox/inbox-premium-screen.tsx` is a `PushScreen`: glass back labelled "Home", centred "Inbox", "Mark all read" as the one action. Logged in `docs/undesigned-states.md` (3.17 draws it as a root page). |
| Crew switcher can't scroll, no dark edge, scale-0 entry, one-frame exit (HIGH + MEDIUM) | `home/premium/crew-switcher/crew-switcher-menu.tsx`: rows in a `ScrollView` capped at the window below the anchor; dark uses `shadow.float` (ring + drop); enters at opacity 0 / scale 0.92 from the top-left corner on Snappy, fades out in 150 ms before the Modal unmounts. Rows split into `crew-switcher-rows.tsx`. |
| Family name used as the short name (HIGH) | `shortName` in `home/data/home-queries.ts` (`firstName`, used by the greeting), `home/inbox/inbox-data.ts` (card speakers), `home/widget-gallery/crew-directory.ts` (Siri / notification snapshot), `crew/referral/referral-data.ts`, `help/feedback/use-feedback-sent.ts`, `help/ideas/use-board.ts`, `onboarding/invited/use-manifest.ts`; `onboarding/name/name-suggestions.ts` suggests the given name for family-name-first names. `crew-copy`/`crew-view` already went through it. |
| This-or-that photos, frame, tilt, guide icon (HIGH + LOW) | `QuizPhotoCard` now takes `questionId`: the mornings pair shows the bundled `splash-photos/batur-sunrise.jpg` / `kelingking.jpg` with the design's shade and white words, in a paper frame (`accent.paper`), with the pair's doodle (`card-art.ts`) in a corner. Tilt stays −1.5° / 1.2°: that is what the 2.07 HTML sets (the review's ±3° is not in the design). Tokek's 34 pt doodle leads the guide line. `card-art.ts` no longer imports the legacy `@/ui/icons/generated` type. |
| Plurals (MEDIUM) | crew settings count, trips "coming" count, back-hero "Home N days", share-plan photos, help "Vote on N ideas", settings "N ideas to vote on", plan days "+ N more days"; en + vi catalogs set to ICU plurals. |
| Invite sheet share buttons with no code; "Copied" never resets (MEDIUM + LOW) | `crew/premium/invite-sheet.tsx`: "Send with" row hidden until there is a code; Copied resets after `toastHoldMs` with a cross-fade and a light haptic; 44 pt tap on Copy link. |
| Feedback and Rate keyboard (MEDIUM) | `KeyboardAwareScroll` with `bottomOffset = measured footer + gap16` in `help/premium/feedback-premium-screen.tsx` and `community/premium/rate-premium-screen.tsx`. |
| Page sheet drops edits; seat cap leaves on timing; save sheet grabber dead and no exit (MEDIUM) | `you/premium/components/page-sheet.tsx` has a `dirty` prop: swipe held (`allowSwipeDismissal={!dirty}`), Cancel and back ask (Discard / Keep editing); the name, username and languages sheets pass it. `monetize/premium/components/modal-sheet.tsx` leaves on Smooth with the drag's velocity (clamped). Save sheet: new `onboarding/premium/save/drawn-sheet.tsx` rises from an effect on Smooth, drags down to dismiss, slides out before "Not now" / the dim page move on. |
| Inbox fold animates `maxHeight` (MEDIUM) | `inbox-card.tsx`: opacity + scale 0.96 only, then removed; cards close up with `layoutTransition(reduced)`; answer pills `minHeight`. |
| Stamp falls ease in (MEDIUM) | `onboarding/premium/components/StampLanding.tsx`, `monetize/premium/components/stamp-slam.tsx`: fall on Lively with `overshootClamping` (impact = first contact), then the existing squash + Lively settle. |
| Fixed heights (MEDIUM) | `wait-tile`, `trip-mini-card`: `minHeight`; `trip-collage-card`: `minHeight: 256` and the "going" row in flow at the foot; `PremiumCodePage` chips `minHeight` + one line, "Found it" line `paddingEnd: 72` + one line. |
| Profile name truncates (MEDIUM) | `passport-card.tsx`: two lines, `adjustsFontSizeToFit` to 0.6. Pass+ tag is a `PressableScale` with a 44 pt slop (also fixes a boundaries lint error by importing `PrivateContent` from `@/features/help`). |
| Stamps page blank (MEDIUM) | Kit `EmptyState` "No stamps yet" (`you-stamps-empty`), logged. |
| crew-settings over 300 lines | `crew-settings-screen.tsx` 243 lines; trips and notification cards in `crew/premium/components/crew-settings-cards.tsx`. |
| Small targets (LOW) | crew code pill, "+ Invite", Copy link, Pass+ tag, settings plan chip: `hitSlopFor`. Settings destructive, version and plan rows are `PressableScale`. |
| First-sync shimmer animates `marginStart` (perf MEDIUM) | `home-syncing.tsx`: `translateX` from the measured track; loop cancelled under Reduce Motion. Seat-cap newcomer bob cancelled the same way. |

**"Save my pass" needs two taps on Android.** I couldn't confirm the cause without a device. The flows tap as soon as the button shows, while the issued page is still running its push transition. Android's default transition slides the page up, so a tap aimed at where the button is mid-slide lands under it. Two changes in `app/onboarding/_layout.tsx` and the save sheet:
- `issued` now fades in (`animation: 'fade'`). The button never moves, and a fade suits a page that has no way back.
- The save sheet no longer uses a Reanimated `entering` animation. That kind of animation can stay at its first frame when it mounts during a native transition on Android. The sheet now rises from an effect.

The e2e retry can be removed once a device run shows one tap is enough.

## Not fixed

- **Launch stamp fall and the thud's JS timer** (`launch/premium/PremiumLaunch.tsx`). The fall is locked to the launch timeline (`stampHit` beat; squash, confetti and the thud all hang off fixed beats). A spring can't land on a fixed beat, so this needs a retimed timeline and a device check.
- **Bell haptic on every Home open.** It is no longer in the code: the premium Home has no bell haptic.
- **Guide-line copy** "No wrong answers, only late ones.": the line comes from `packages/content/onboarding/tokek-lines.json` (`taste-start`: "Tap one. There are no wrong answers, only late ones."). That file is outside my owns list.
- **Photos for the other five quiz pairs**: there is no photo data for them (only the mornings pair is designed and bundled). The bottom mornings photo is the bundled Kelingking, not the design's Crystal Bay (not bundled; adding it means a new file under `assets/`).

## Restored behaviour

- **Home "whose turn"**: not restored. 3.02 has no whose-turn line, and the trip hub's planning line carries it.
- **Named seat invites / contact picker / waitlist from the invite sheet**: not built. 3.10 shows only the code, Copy link, the apps and the resend card.

## testIDs (for the e2e lane)

- New: `you-stamps-empty`, `you-edit-name-sheet-cancel` (and the other field sheets' `-cancel`, unchanged pattern).
- `inbox-screen` is now a push page. On Android the drawn back is present, so a flow can leave with the back control.
- The invite sheet's `crew-invite-wa`, `crew-invite-imsg` and `crew-invite-more` are absent until a code exists.
- `issued` fades in, and `save-sheet-scrim` and `save-not-now` are unchanged. The save sheet can now be dragged down.

## Founder questions

1. Named seat invites, the contact picker and the seat-limit/waitlist path have no entry in premium 3.10. Keep the code-only invite, design an entry, or remove the old pieces?
2. Should the quiz's five other pairs get photos? This needs picked photos bundled under `assets/`.
3. Should the guide line read the design's "No wrong answers, only late ones."? This is a content change.

## Unresolved / follow-ups

- The server still cuts names to the first word for invites: `services/api/src/links/join-code-provider.ts:64` and `links/providers/invite.ts:56` send `inviter_first_name` / `invitee_first_name` as `split(/\s+/)[0]`. So "Ask Đặng for a new code" stays until the API uses the same given-name rule. Not my owns.
- Two legacy kit imports remain on my area's premium screens and will break when `src/ui/**` goes, if the shell lane doesn't move them: `crew/premium/crew-settings-screen.tsx` (`@/ui/avatar/guides`) and `you/premium/settings/settings-premium-screen.tsx` (`SettingsRow` type from `@/ui/inputs/SettingsGroup`). Also `app/inbox/_layout.tsx` (`@/ui/states/SessionGate`).

## Checks

`tsc --noEmit` clean after merging 1971d8555. eslint and prettier clean on every changed file. Jest suites run:
- inbox (7/7)
- crew screens (11/11)
- issued, save and phone (29/29)
- taste and home (9/9)
- account guard rails (18/18)
- name suggestions (4/4)
- field-sheet discard (2/2, new)
- greeting name (3/3, new)

`no-plan-ids` passes. `@cp/i18n` extract and compile were run and the catalogs are committed.

Status: DONE_WITH_CONCERNS
Summary: Every start, home and account finding is fixed except the launch timeline's fall and three items that need content or assets I don't own. The Android "Save my pass" double tap has a likely fix (the issued page fades in, the save sheet rises from an effect) that still needs a device run to confirm.
Concerns/Blockers: Server-side first-name cuts for invites, the three remaining legacy kit imports, and an Android device check of the Save my pass tap.
