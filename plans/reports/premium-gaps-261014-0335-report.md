# Premium gaps: report

Branch `fix/premium-avatar-and-gaps` (from `origin/feat/drop-legacy-ui` 8dc4c57d5), pushed.

## Commits

- `c2a753085` fix(mobile): avatars draw the member's chosen photo or critter
- `6bfbdd219` feat(critters): sticker shelf on the Critterdex in the premium look
- `25d78c5b0` feat(you): permissions section in the premium settings
- `6675153c6` docs: point the kit and qa paths at the premium kit and lib

## What changed

1. **Avatar faces.** `ui/premium/people/Avatar.tsx` takes optional `uid`, `photo` and `critter` props. It reads `useMemberFace(uid, size)`, which `MemberFacesRoot` already provides at the root. A photo draws with `cache: 'force-cache'`, sized to the circle, and the initial shows until it loads. A failed photo falls back to the critter, then the initial. Erased accounts still show the people glyph. `avatarFill()` holds that branching, and `ui/premium/__tests__/avatar-face.test.tsx` covers it plus a render. `CrewMember` gets an optional `uid` (`CrewStack` uses `uid ?? id`). The person toast takes an optional `uid`. Every premium caller that knows the member's user id now passes it: chat (sender, system pill, welcome ring, who reacted), crew (grid, sheet, pass seats, leave radio rows, live map pins and panel), inbox, home, guide (question author, Pass+ holder), money (settle, payer, split, history, payment, receipt picker, scan, expense detail), setup (must-do, getting there, rooms), plan comments, proposal send, day readiness, quests, SOS and session map, recap (memory chips, awards, stamp signers), album who-sheet, monetize seats. To do that, `SosModel` gets a `senderUid` field. Left as initials, because there is no member id there: drivers (not members), the referral friend rows, invite previews (pre-join), the boost buyer name, critter "also has it", and the avatar picker's initials preview.
2. **Sticker shelf.** The chat sticker tray (5.08) already existed and was wired (`features/crew/premium/chat/sticker-tray.tsx`). The gap was the PASS/Critterdex reward shelf, which had been deleted. It is now `features/critters/stickers/sticker-shelf.tsx`, built from kit parts and rendered through a new `shelf` slot in `DexViewProps`, under the dex cards and above the sets. Tapping a sticker opens `/(modal)/sticker/[stickerId]`. When there are no stickers, a line says how to earn one. The file sits in `features/critters/stickers` so its strings stay in the `quests/stickers` catalog, and the old translations (vi included) were restored.
3. **Settings permissions.** New `features/you/premium/settings/permissions-card.tsx`, added after the designed sections in `settings-premium-screen.tsx`. It reuses `usePermissionsState`, `requestWithPrimer`, `openPermissionSettings` and the `lib/permissions/primer-copy` lines. Location is left out because it lives under Privacy. The test is `features/you/premium/settings/__tests__/permissions-card.test.ts`, covering ask vs settings, detail lines and values. Translations were restored from the old `permissions.po`, vi included. The strings now live in `you.po`.
4. **Docs.** `docs/code-standards.md` (runtime guards now point to `lib/qa` and the kit's critter renderer) and `docs/design-system-premium.md` (the kit as the only library, engine paths, intro line).

## testIDs for the e2e lane

- New: `sticker-shelf`, `sticker-shelf-empty`, `sticker-shelf-<stickerId>`. These are the old shelf ids plus a per-item id.
- New: `you-settings-permissions` (the card), `you-settings-permission-<kind>` for each row (`notifications`, `alarms`, `calendar`, `camera`, `microphone`, `photos_add`, `photos_read`, `live_activities`). The legacy rows were `settings-row-<kind>`.
- New: `<avatar testID>-photo` on an avatar's photo, only when the avatar has a testID.
- Nothing renamed.

## Undesigned states (appended to docs/undesigned-states.md)

- The Critterdex sticker shelf.
- The Settings permissions section.

## Checks

- `tsc --noEmit -p .`: clean.
- eslint and prettier on changed files: clean.
- `no-plan-ids`: 5/5.
- Jest: avatar-face 6/6, pass-screen 12/12, permissions-card 5/5.
- Jest in this worktree only runs with `NODE_PATH=<repo>/node_modules/.pnpm/node_modules`. Without it, every `.tsx` suite fails with `Cannot find module '@babel/runtime/helpers/interopRequireDefault'`, even untouched ones like toast-host. The same suites pass in `polish-shell`, whose config and install look identical. This is an environment issue, not a code issue. CI is unaffected.

## Unresolved questions

- Should the shelf sit higher on the Critterdex, or on the passport page instead? The legacy put it on the PASS tab, where it is now.
- Is it fine that German, French and other catalogs have no translation for the permission values? The legacy catalogs had none either.
- Expiring photo links (15 min) change the image URL, so a refreshed link loads that photo again, with the initial showing briefly.

Status: DONE
Summary: Premium avatars now draw each member's chosen photo or critter at every caller that knows the member. The Critterdex sticker shelf and the Settings permissions section are rebuilt from the kit, and the two docs point at the current paths.
Concerns/Blockers: local Jest needs the NODE_PATH workaround in this worktree. The SosModel got a `senderUid` field so the SOS avatars can draw the sender's face.
