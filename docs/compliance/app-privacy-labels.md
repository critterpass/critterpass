# App Store privacy labels and privacy manifests

Proposed answers for App Store Connect's App Privacy section, derived on 2026-10-07 from the
privacy classes each table registers (`registerTablePrivacy` in `packages/db/src/schema/*.ts`;
classes defined in docs/data-model.md §1: C0 public, C1 crew-visible, C2 personal, C3 sensitive,
C4, C5 financial record), the SDKs in `apps/mobile/package.json`, and the draft privacy policy
(`packages/content/src/legal/privacy/1.0.0.mdx`). The founder enters them; counsel confirms the
classifications marked "confirm".

Registered tables by class: C0 42, C1 102, C2 85, C3 22, C4 3, C5 4.

## Tracking

**Data used to track you: none.** No advertising SDK, no AdSupport, no
`NSUserTrackingUsageDescription` in the production `Info.plist` (generated with
`expo prebuild --platform ios` for the production variant on 2026-10-07), and analytics use a
pseudonymous id (`apps/mobile/src/lib/analytics/client.ts`).

## Data linked to the user

| Apple data type | Collected | Purpose | Where it lives |
|---|---|---|---|
| Contact info: name | yes | app functionality | `users` (C1) |
| Contact info: email, phone | yes | app functionality (sign-in, invites) | `user_private` (C3, encrypted, owner-only) |
| Contact info: physical address | yes, optional (postcards) | app functionality | `mailing_addresses` (C3) |
| Location: precise | yes, with permission | app functionality (crew map, leave-by, critters, SOS) | `location_fixes` (C3, deleted after 15 minutes outside an open SOS: docs/data-model-sync-and-privacy.md §6), `visits` (C3) |
| User content: photos or videos | yes | app functionality (album, receipts, avatars) | `media_objects`, album tables |
| User content: audio | yes (voice notes in chat; guide voice clips are transcribed, then deleted per the privacy policy) | app functionality | chat attachments |
| User content: other (plans, votes, messages, expenses) | yes | app functionality | C1 crew tables |
| User content: customer support | yes | app functionality | `feedback_tickets` |
| Identifiers: user id, device id | yes | app functionality | `users`, `devices`, push tokens |
| Purchases | yes | app functionality | `store_transactions`, `billing_events` (C5); RevenueCat SDK (`react-native-purchases`) |
| Financial info: other | yes (shared expenses, payout details for settling up) | app functionality | expenses tables; `payout_methods` (C3, encrypted) |
| Sensitive info | confirm: passport number (`user_private.passport_no_enc`), insurance policies (`insurance_policies`), dietary needs and allergies (`dietary_profiles`) are all optional and C3; whether Apple's "Sensitive info" or "Health" applies to allergies is a counsel reading (unknown) | app functionality | C3 tables |
| Contacts | confirm: the contact picker is the system one (`apps/mobile/modules/cp-contact-picker`); what an invite stores is in `invite_prefill` (C3, encrypted, short-lived). Whether that counts as collecting "Contacts" is unknown | app functionality | `invite_prefill` |
| Other data: calendar busy days | yes, with permission | app functionality | `calendar_sources`, `calendar_days` (C3 per docs/data-model-sync-and-privacy.md §1) |
| Usage data: product interaction | yes, only after consent | analytics | PostHog EU, events carry ids and enums only (`apps/mobile/src/lib/analytics/client.ts`) |
| Diagnostics: crash and performance data | yes | app functionality | Sentry, `sendDefaultPii: false`, no screenshots, no replay (`apps/mobile/src/lib/observability/sentry.ts`) |

Not collected: browsing history, search history outside the app, health and fitness sensor data,
advertising data. Card details never reach us (payments go through the App Store and Google Play).

Three tables are registered C4 (`route_cache`, `crew_chat_counters`, `guide_crew_turns` in
`packages/db/src/schema/{planning,chat,guide-chat}.ts`) although docs/data-model.md §1 defines C4
as "biometric/minors (on-device only, never stored)". These look like server bookkeeping rather
than biometric data; the mismatch between the definition and its use is **unknown** and needs the
data-model owner to settle before the labels are filed.

## Privacy manifests

Run: `pnpm tsx tools/scripts/security/privacy-manifest-check.ts` (fails today).

| Bundle | Required-reason APIs our Swift calls | Manifest | Result on 2026-10-07 |
|---|---|---|---|
| App (`app.critterpass`) | `UserDefaults` in `apps/mobile/modules/cp-permissions/ios/PermissionProbes.swift`, `cp-location/ios/MonitorRotation.swift`, `cp-location/ios/SessionManager.swift` | none: `ios.privacyManifests` is not set in `apps/mobile/app.config.ts`, and the production prebuild writes no `PrivacyInfo.xcprivacy` into the app target | **fail** |
| Widgets (`apps/mobile/targets/widgets`) | none found | none | note |
| Notification service (`targets/notification-service`) | none found | none | note |
| Notification content (`targets/notification-content`) | none found | none | note |
| App Clip (`targets/app-clip`, development builds only) | none found | none | note |

Fix (outside this document's owners): add `ios.privacyManifests` to `apps/mobile/app.config.ts`
with `NSPrivacyAccessedAPICategoryUserDefaults` (reason `CA92.1`, the app's own defaults),
`NSPrivacyTracking: false` and the collected data types from the table above; add a
`PrivacyInfo.xcprivacy` to each extension folder so every bundle carries one. Third-party pods
(React Native, Sentry, RevenueCat and others) ship their own manifests; they were not audited here
(unknown), and Apple's upload report is the check for those.

`ITSAppUsesNonExemptEncryption` is `false` in the generated `Info.plist` (the app uses only the
operating system's cryptography, per the note in `apps/mobile/app.config.ts`).
