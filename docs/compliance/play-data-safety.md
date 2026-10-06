# Google Play Data safety

Proposed answers for the Play Console's Data safety form, on the same basis as
[app-privacy-labels.md](app-privacy-labels.md) (read on 2026-10-07). Sensitive-permission
declarations are in [docs/play-policy-declarations.md](../play-policy-declarations.md).

## Form answers

| Question | Proposed answer | Basis |
|---|---|---|
| Does the app collect or share user data? | Collects: yes. Shares (as Play defines it, transfer to a third party that is not a service provider): booking details passed to the booking partner when the user books (privacy policy, "Partners and services"); confirm with counsel whether user-initiated transfers are exempt | `packages/content/src/legal/privacy/1.0.0.mdx` |
| Is all data encrypted in transit? | Expected yes: the staging endpoints in `apps/mobile/eas.json` are `https`/`wss`; production endpoints are EAS environment variables outside the repository, and that the production Android build refuses cleartext traffic was **not verified** | `apps/mobile/eas.json` |
| Can users request deletion? | In the app: yes (You → Delete account, 30-day grace, then purge). On the web: **not available yet**, see Open 1 | `apps/mobile/src/features/you/account/delete-screen.tsx`, `packages/domain/src/account/deletion.ts`, `services/worker/src/jobs/account/purge.ts` |
| Independent security review | No (not engaged; see [security-review.md](security-review.md)) | |
| Families policy / target age | see [age-rating.md](age-rating.md) | |

## Data types

| Play data type | Collected | Optional | Purpose |
|---|---|---|---|
| Personal info: name, email, phone, user ids | yes | phone or email is required to keep an account; anonymous use is possible before saving | app functionality, account management |
| Personal info: address | yes | optional (postcards) | app functionality |
| Financial info: purchase history; other financial info (shared expenses, payout details) | yes | payout details optional | app functionality |
| Location: precise and approximate | yes | optional (permission) | app functionality |
| Messages: other in-app messages | yes | | app functionality |
| Photos and videos | yes | optional | app functionality |
| Audio: voice recordings | yes | optional | app functionality |
| Calendar events | yes (busy days only) | optional (permission) | app functionality |
| Contacts | confirm (see app-privacy-labels.md) | optional | app functionality |
| Health info | confirm: dietary needs and allergies, optional | optional | app functionality |
| App activity: app interactions | yes, after consent | optional | analytics |
| App info and performance: crash logs, diagnostics | yes | | app functionality |
| Device or other ids | yes (push tokens, install id) | | app functionality |

## Android permissions in the production config

From `APP_VARIANT=production expo config --type public` in `apps/mobile` on 2026-10-07 (permissions
that config plugins add at prebuild, such as alarms and notifications, are not in this list; see
docs/play-policy-declarations.md): `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`,
`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_VISUAL_USER_SELECTED`,
`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`.

## Open

1. **Web deletion page.** Play requires a web address where a user can ask for account deletion
   without the app. The site config points to `/account/delete`
   (`apps/web/src/components/site/site-config.ts`), but no page exists under `apps/web/src/pages`
   and `GET https://staging.critterpass.app/account/delete` returned 404 on 2026-10-07.
2. **Photo and video permissions.** `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` are in the merged
   permission list. Play's photo and video permissions policy allows them only for apps whose core
   use needs broad library access and asks for a declaration; otherwise the system photo picker
   must be used. Whether the album needs broad access, and whether `READ_MEDIA_AUDIO` and the
   legacy storage permissions are needed at all, is not decided here (unknown).
3. **Purge of stored objects.** The account purge keeps a deleted user's `media_objects` rows "for
   the object store purge" (`packages/domain/src/account/purge-policy.ts`), and
   docs/data-model-sync-and-privacy.md §6 lists a job that deletes stored objects without a row.
   No job that deletes objects from the bucket was found in `services/worker/src/jobs` (searched
   for `media_objects`, "orphan" and object deletes), so "photos are erased on deletion" is
   **not evidenced**.
4. **Deletion end to end.** Database purge behaviour is covered by
   `packages/db/test/purge/account-purge.test.ts`, `packages/db/test/purge/purge-policy-coverage.test.ts`
   (every C3 table is deleted) and `services/worker/test/account/purge.db.test.ts`, which run in CI.
   A device journey from the delete screen to a purged account does not exist yet.
