---
phase: 44
title: Shared album, curation, postcards, printed mail
status: pending
depends_on: [10, 12, 13, 43]
wave: 20
features: [F-135, F-136, F-137, F-138]
screens: [3m-2, 3m-9, 3k-4, 3o-4]
tasks: 9
owns:
  - packages/domain/src/album/**
  - packages/db/src/schema/album.ts
  - packages/db/migrations/<ts>_album_postcards.sql
  - packages/db/test/permissions/{photos,album-picks,photo-people,postcards,postcard-mailings,mailing-addresses}.test.ts
  - packages/ai/src/routes/album/**
  - packages/ai/evals/album/**
  - services/api/src/commands/album/**
  - services/api/src/commands/postcards/**
  - services/api/src/routes/webhooks/print.ts
  - services/api/test/album/**
  - services/worker/src/jobs/album/**
  - services/worker/src/jobs/postcards/**
  - services/worker/src/jobs/recap/contributors/album.ts
  - services/worker/src/print/**
  - services/worker/test/album/**
  - apps/mobile/modules/cp-media-upload/**
  - apps/mobile/modules/cp-photo-analysis/**
  - apps/mobile/src/app/(trip)/album/**
  - apps/mobile/src/app/(trip)/recap/[tripId]/postcard.tsx
  - apps/mobile/src/features/album/**
  - apps/mobile/src/features/recap/cards/postcard-card.tsx
  - packages/i18n/locales/en/album/**
  - e2e/album/**
---
# Phase 44 — Shared album, curation, postcards, printed mail

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D4 (R2 presigned multipart, media Worker HMAC reads, thumbnails in worker), D5 (Sonnet vision), D7 (Pass+ perks server-driven), D17 (print-on-demand), D18 (GDPR special category), C25 (no GPS), C42 (album never gated), C48 (printed postcard is a shipped Pass+ perk) |
| `docs/data-model.md` | §3.10 `photos`, `album_picks`, `postcards`, `postcard_mailings`, `mailing_addresses`, `media_objects` (P8); consents (P8) |
| `docs/data-model-sync-and-privacy.md` | photo upload machine `pending → uploaded | failed`; `trip` stream (metadata; bytes via media Worker); `media.orphans`; deletion purge |
| `docs/api-contracts.md` | §4.14 `register_photo`, `delete_photo`, `set_album_pick`, `request_album_export`, `create_postcard`/`edit_postcard`, `send_postcard`, `mail_postcard`; §5.4 media presign/multipart/read-urls; webhook `/webhooks/print` |
| `docs/api-contracts-async.md` | `trip_album:{trip_id}` (`photo.added`, `photo.picked`, `curation.done`); queues `media.process`, `ai.curate_album`, `postcard.fulfil`; `maint.purge` face data |
| Phases | P10 media routes + media Worker + upload queue; P12 entitlements (Pass+, quotas); P13 LLM gateway; P5 share/postcard print templates; P43 recap card slot, contributors registry, memory photo provider; P3 i18n; P17 moderation queue |
| Reports | `design-analysis-260926-1143-critters-after-report.md` §2 3m-2, 3m-9, §7 risk 16, §8; `researcher-260926-1143-native-platform-monetization-report.md` photos/background transfer rows; `researcher-260926-1649-custom-hono-backend-report.md` R2/media Worker; master §2 F-135…F-138, §6.1 Photos row, AI-34, AI-35, Q-6C |
| Renders | `docs/design-renders/screens/{3m-2_Photos,3m-9_Recap_the_postcard,3k-4_Offline_at_the_top}.png` |

## Overview

Goal: the crew's shared trip album — photos upload in the background (offline-queued, EXIF GPS stripped), stream live to everyone, are curated by the guide (on-device quality prefilter + Sonnet picks and note, opt-in self-recognition for "who's in"), become postcards with an LLM note in three formats sent to the crew, and — for Pass+ — one printed postcard per trip is mailed to every crew member through a print vendor.
Done when: 12 photos picked offline upload after reconnect via background transfer on iOS and Android, appear live on a second device, curation returns 24 picks with everyone ≥ 3 where possible, a postcard sends to the crew, and a Pass+ mailing reaches the vendor sandbox with status updates via webhook.

## Requirements

### F-137 Shared album (3m-2, 3k-4)
| Item | Behaviour |
|---|---|
| Ingestion | manual multi-pick via PHPicker / Android Photo Picker (no library permission) is the default; optional "Add my trip photos automatically" toggle (PhotoKit limited/full, READ_MEDIA_IMAGES/partial) scans only photos taken between trip dates (Q-6C default: manual + opt-in auto) |
| Upload | device strips EXIF GPS (C25), computes sha256 + pHash, creates `photos` row locally `pending`; `cp-media-upload` does presigned PUT (≤ 5 MB) or multipart (> 5 MB) via background URLSession / WorkManager; on completion queues `register_photo` (O); failures retry with backoff; "Uploading 12 photos from today." banner; 3k-4 offline count |
| Server | `media.process`: thumbnails (display + thumb, sharp), dedupe by sha256 per trip, moderation hook (P17; text captions or notes that leave the crew go through P13 `checkCompliance`, surface `public_text`), `media_objects` manifest; publish `photo.added` |
| Reads | `POST /v1/media/read-urls` mints HMAC URLs (15 min) after trip membership check; media Worker verifies; client caches thumbnails |
| UI | "PHOTOS" + "+ UPLOAD"; segmented BEST · n / ALL · n / BY PERSON; day sections "DAY 4 · BATUR SUNRISE" (plan day + POI); masonry (1 large 2×2 + small), uploader avatar chip; photos drop in live (y-drop + fade); picks glint (sheen sweep); long-press → who's in |
| Viewer (undesigned) | full-screen pager, pinch zoom, uploader + time + place, save to Photos (add-only), share, delete (owner/organiser), report, pick toggle |
| Other states (design in code) | empty album, upload progress/failed/retry, permission limited/denied, duplicates skipped, video (photos only at launch — video picker filtered; stated in copy), download all (`request_album_export` → zip link), storage fair-use cap per trip (silent server cap, D7), curation in progress, deleted uploader |
| Gates | free forever, never gated on payment (C42) |

### F-138 Album curation AI (3m-2, 3o-4)
| Item | Behaviour |
|---|---|
| On-device prefilter | `cp-photo-analysis`: blur (Laplacian variance), exposure, near-duplicate clusters (pHash distance), face count (Vision / ML Kit detection; counts only) → scores sent in `register_photo` metadata |
| Self-recognition (opt-in, GDPR Art. 9 explicit consent) | a member may enrol their own face on their own device (`consents` kind `face_self_match`); recognition model = bundled on-device face-embedding model (CoreML on iOS, TFLite/LiteRT on Android; MobileFaceNet-class, licence must permit commercial use — checked in T4 before bundling; Vision / ML Kit only detect and crop); their device matches album thumbnails locally — embeddings of other faces are computed in memory only for the comparison, never persisted or sent (bystander minimisation) — and publishes only `photo_people(photo_id, user_id, source='self_match')`; no face templates leave the device or are stored server-side (C4 "no face data stored"); withdraw = delete local template + own tags. Manual tagging "I'm in this" also allowed |
| Server curation | `ai.curate_album` (debounced 10 min after uploads, and at trip end): code preselects candidates (best of each dup cluster, quality threshold), Sonnet 5 vision on thumbnails scores aesthetics/moment; code picks 24 with coverage constraint (each tagged member ≥ 3 when available) and day spread; AI-35 writes note ("I picked 24 keepers. Nothing blurry, and everyone's in at least three." only when true — note built from computed facts) |
| Output | `album_picks(picked_by='guide')`, `photos.is_pick`, `trip_album` `curation.done`, glint animation; users can override picks (`set_album_pick`) |
| Cost | prefilter keeps vision calls ≤ 60 thumbnails per run (AI-35 ~$0.03 target) |

### F-135 Postcard composer (3m-9)
- Recap card 8 (`cards/postcard-card.tsx`): front photo (top guide pick, or guide art when no photos) flips to back every few seconds with small bounce; note from AI-34 highlights, rewritable; stamp = this trip's guide.
- Composer: choose photo, edit note (LLM draft + "rewrite" regenerate, max length per format), 3 formats (classic 6×4 landscape, square, 9:16 story) via P5 postcard templates; save image; `send_postcard{to_uids}` delivers to crew (inbox card + chat message type photo with postcard ref).
- States: no photos, offline (save draft, send queued), regenerate failure (keep draft).

### F-136 Printed postcard mailing (3m-9, Pass+)
| Item | Behaviour |
|---|---|
| Entitlement | Pass+ only; 1 mailing per trip per payer (P12 quota `postcard_mail`); paywall entry when not Pass+ (P46) |
| Recipients | every crew member who has saved a mailing address and consented to receive; missing addresses → in-app request card to that member ("{name} wants to mail you a postcard — add an address"); addresses `mailing_addresses.fields_enc` (C3, never shown to crew, never to LLM) |
| Fulfilment | `mail_postcard` → `postcard.fulfil`: print-ready render (P5 print variant, 300 dpi, bleed) → vendor order with each address → `postcard_mailings` status queued/sent/printed/shipped/failed; `/webhooks/print/{secret_token}` (unguessable path token) only triggers a re-fetch of order status from the vendor API (`getStatus`) — the callback body is never trusted; HMAC verified in addition where the vendor signs callbacks; failure → quota refunded + notice |
| Tracking UI | status timeline per recipient (no address shown), estimated delivery |
| Vendor adapter | `services/worker/src/print/` interface `{createOrder, getStatus, cancel}`; outbound via fixed IP; timeouts ≤ 120 s |
| Unsupported countries | adapter coverage list; recipients outside get digital postcard only, stated in UI |

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | create `photos`, `album_picks`, `postcards`, `postcard_mailings`, `mailing_addresses` (data-model §3.10; `memories`/`memory_reactions` moved to P43 — doc delta); doc delta: `photo_people(photo_id, user_id, source self_match|manual, created_at)` uk (photo_id, user_id); `photos.quality jsonb` (blur, exposure, dup_cluster, face_count); `mailing_consents` folded into `consents` kind `postcard_recipient` |
| RLS backstop | photos/picks/postcards/photo_people readable by trip participants; insert own; delete own photo (organiser may hide); `mailing_addresses` self only, never `guide_reader` or `powersync_repl`; `postcard_mailings` status columns only via view |
| Sync | `trip`: photos (metadata), album_picks, photo_people, postcards, postcard_mailings status view; `me`: own mailing address presence flag only (not fields) |
| Commands | §4.14 set + doc deltas: `tag_self_in_photo{photo_id, on}`, `save_mailing_address{fields}` (A, encrypted server-side), `set_album_auto_ingest{trip_id, on}` |
| Jobs | `media.process` (photo branch), `ai.curate_album`, `postcard.fulfil`, `album.export` (zip → R2 signed link, 7 d); recap contributor `album.ts` (photo count, top uploader) + memory highlight photo provider for P43 |
| Realtime | `trip_album:{trip_id}` photo.added / photo.picked / curation.done |
| Push | album digest via roundup (no per-photo push); mailing status N via inbox |
| Native | `cp-media-upload` (iOS background URLSession with resumable multipart parts; Android WorkManager with constraints), `cp-photo-analysis` (Vision/ML Kit blur, pHash, face count, self-match with on-device template in Keychain/EncryptedFile) |
| AI | AI-35 route `packages/ai/src/routes/album/` (scores + note), AI-34 postcard note reuse from P43 route |
| Deletion | uploader deletion removes photos + R2 objects via `media_objects`; face templates purge on consent withdrawal (device) |

## Tasks

### T1 — Schema + permission tests
- Goal: album and postcard tables.
- Files: `packages/db/src/schema/album.ts`, `packages/db/migrations/<ts>_album_postcards.sql`, `packages/db/test/permissions/{photos,album-picks,photo-people,postcards,postcard-mailings,mailing-addresses}.test.ts`
- Steps: 1. Tables + deltas. 2. RLS/grants/publication (address fields excluded everywhere). 3. Status view for mailings.
- Tests: `pnpm --filter @cp/db test -- permissions/photos permissions/album-picks permissions/photo-people permissions/postcards permissions/postcard-mailings permissions/mailing-addresses`
- Done when: crew cannot read addresses; non-members cannot read photos; publication check passes.

### T2 — Native background upload module
- Goal: `cp-media-upload` iOS + Android.
- Files: `apps/mobile/modules/cp-media-upload/{expo-module.config.json,index.ts,ios/CpMediaUploadModule.swift,ios/BackgroundSession.swift,android/src/main/java/app/critterpass/mediaupload/{CpMediaUploadModule,UploadWorker}.kt}`
- Steps: 1. Enqueue (file, presign/multipart plan) → background transfer. 2. Resume parts after app kill. 3. Events to JS (progress, done, failed). 4. EXIF GPS strip before enqueue.
- Tests: `xcodebuild test -scheme CpMediaUploadTests`; `./gradlew :cp-media-upload:testDebugUnitTest`
- Done when: tests prove GPS tags removed and a killed upload resumes.

### T3 — Upload queue + album server path
- Goal: offline queue, register, process, reads, export.
- Files: `apps/mobile/src/features/album/upload/**`, `services/api/src/commands/album/{register-photo,delete-photo,set-album-pick,request-album-export,set-album-auto-ingest}.ts`, `services/worker/src/jobs/album/{process-photo,export}.ts`, `services/api/test/album/commands.test.ts`, `services/worker/test/album/process.test.ts`
- Steps: 1. Local pending rows + queue. 2. Handlers + events + `trip_album`. 3. Thumbnails, dedupe, moderation, manifest. 4. Export zip.
- Tests: `pnpm --filter @cp/api test -- album`; `pnpm --filter @cp/worker test -- album/process`
- Done when: duplicate sha256 in one trip registers once; read-URL mint refuses non-members.

### T4 — On-device analysis + self-recognition consent
- Goal: `cp-photo-analysis` + consent UX.
- Files: `apps/mobile/modules/cp-photo-analysis/{expo-module.config.json,index.ts,ios/CpPhotoAnalysisModule.swift,android/src/main/java/app/critterpass/photoanalysis/CpPhotoAnalysisModule.kt}`, `apps/mobile/src/features/album/faces/**`, `services/api/src/commands/album/tag-self-in-photo.ts`
- Steps: 0. Pick + licence-check the recognition model (CoreML/TFLite), record licence in `apps/mobile/modules/cp-photo-analysis/MODEL_LICENSE.md`. 1. Blur, exposure, pHash, face count. 2. Consent sheet (explicit, separate, withdrawable) → enrol own face locally. 3. Local match → `tag_self_in_photo`. 4. Withdrawal clears template and own tags.
- Tests: `xcodebuild test -scheme CpPhotoAnalysisTests`; `./gradlew :cp-photo-analysis:testDebugUnitTest`; `pnpm --filter @cp/mobile test -- features/album/faces`
- Done when: no face template or embedding appears in any network payload (test intercepts); consent absent → no matching runs; non-enrolled face embeddings are not persisted (test inspects storage after a match run); server flag `album.face_self_match` defaults off.

### T5 — Curation job + AI-35 + evals
- Goal: picks[24] + truthful note.
- Files: `packages/domain/src/album/{select-picks.ts,note-facts.ts}`, `packages/ai/src/routes/album/{prompt.ts,schema.ts,index.ts}`, `packages/ai/evals/album/**`, `services/worker/src/jobs/album/curate.ts`, `services/worker/test/album/curate.test.ts`
- Steps: 1. Candidate preselect. 2. Sonnet vision scoring on thumbnails. 3. Coverage-constrained pick (code). 4. Note from computed facts only. 5. Debounce + trip-end run.
- Tests: `pnpm --filter @cp/worker test -- album/curate`; `pnpm --filter @cp/ai eval -- album`
- Done when: coverage test passes; note never claims "everyone's in at least three" unless true.

### T6 — Album UI + viewer
- Goal: 3m-2 + undesigned viewer and states.
- Files: `apps/mobile/src/app/(trip)/album/{index,[photoId]}.tsx`, `apps/mobile/src/features/album/{grid,viewer,people}/**`, `packages/i18n/locales/en/album/album.po`
- Steps: 1. Segments, day sections, masonry, live drop-in, pick glint. 2. BY PERSON + long-press who's in. 3. Viewer actions. 4. Empty/limited/denied/progress/export states.
- Tests: `pnpm --filter @cp/mobile test -- features/album`
- Done when: RNTL covers all listed states; live `photo.added` inserts without reflow jank (FlashList masonry).

### T7 — Postcard composer + recap card 8
- Goal: F-135.
- Files: `apps/mobile/src/features/recap/cards/postcard-card.tsx`, `apps/mobile/src/app/(trip)/recap/[tripId]/postcard.tsx`, `apps/mobile/src/features/album/postcard/**`, `services/api/src/commands/postcards/{create-postcard,edit-postcard,send-postcard}.ts`, `services/worker/src/jobs/recap/contributors/album.ts`
- Steps: 1. Flip card. 2. Composer with photo pick, note regenerate, 3 formats, save. 3. Send to crew. 4. Recap album contributor + memory photo provider.
- Tests: `pnpm --filter @cp/mobile test -- features/album/postcard`; `pnpm --filter @cp/api test -- postcards`
- Done when: sent postcard appears for each recipient; recap shows photo count from contributor.

### T8 — Printed mailing
- Goal: F-136 with vendor adapter.
- Files: `services/worker/src/print/{adapter.ts,vendor.ts,coverage.ts}`, `services/worker/src/jobs/postcards/fulfil.ts`, `services/api/src/commands/postcards/{mail-postcard,save-mailing-address}.ts`, `services/api/src/routes/webhooks/print.ts`, `apps/mobile/src/features/album/mailing/**`, `services/worker/test/album/fulfil.test.ts`
- Steps: 1. Address capture + encryption + recipient consent/request card. 2. Entitlement + quota reserve/refund. 3. Vendor order (sandbox) + webhook secret path token → re-fetch status via `getStatus` (HMAC verify only where vendor supports it). 4. Tracking UI.
- Tests: `pnpm --filter @cp/worker test -- album/fulfil`; `pnpm --filter @cp/api test -- postcards webhooks/print`
- Done when: non-Pass+ gets `ENTITLEMENT_REQUIRED`; second mailing same trip rejected; failed order refunds quota; webhook with wrong path token rejected; a forged callback body cannot change status (status comes only from vendor re-fetch).

### T9 — End-to-end
- Goal: Maestro coverage.
- Files: `e2e/album/{offline-upload,live-stream,curation,postcard-send,postcard-mail}.yaml`
- Steps: 1. Airplane-mode pick 12 → reconnect → uploaded. 2. Second device sees drop-in. 3. Postcard send + mail (sandbox).
- Tests: `maestro test e2e/album`
- Done when: flows pass on iOS and Android.

## Phase acceptance criteria
- [ ] Offline-picked photos upload in background after reconnect/app kill on both platforms; GPS EXIF stripped
- [ ] Media reads only via HMAC URLs minted after membership check
- [ ] Curation picks satisfy coverage when tags exist; note facts are code-computed
- [ ] Face data never leaves the device; consent explicit and withdrawable
- [ ] Postcards send to crew; printed mailing Pass+ only, 1 per trip, quota refunded on failure
- [ ] Addresses unreadable by crew, guide and sync (permission tests)
- [ ] Album never gated on payment
- [ ] All unit, permission, native, eval and Maestro suites pass

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Background transfer throttled by OS | resumable parts; foreground resume on open; progress banner |
| Biometric consent / legal exposure | self-match only, on-device, explicit consent; feature flag off → manual tags only |
| Vision cost | prefilter caps candidates; debounce; fair-use cap |
| Print vendor coverage/delays | coverage list, digital fallback, refund on failure |
| Storage cost | server fair-use cap per trip; originals kept, display derivatives cached at edge |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Print vendor account + API keys + sandbox (default Prodigi or Gelato; decision 17) | Pass+ perk list hides printed postcard via server-driven `shipped=false` (C48) until live |
| Counsel review of face self-match consent (GDPR Art. 9, Vietnam PDPL) | flag `album.face_self_match` ships off → manual "I'm in this" tags only until sign-off |
| Counsel ruling on bystander processing (crewmates' faces transiently embedded during another member's self-match without their consent) | flag stays off; if counsel requires crew consent, add a crew-level opt-in (all tagged-photo members consent) before enabling |
| Recognition model with commercial-use licence | flag off; manual tags only |
| Photos permission purpose strings (App Store / Play) | manual picker only |

## Open questions
1. `photo_people`, `photos.quality`, `tag_self_in_photo`, `save_mailing_address`, `set_album_auto_ingest`, memories moved to P43 — doc deltas; default: add in T1/T3 and update docs.
2. Ingestion mode (Q-6C) — default: manual pick; opt-in auto by trip dates.
3. Print vendor — default Prodigi (global postcard API, webhooks); adapter interface allows swap.
4. Video — default: photos only at launch, copy says so.
5. Recipients without Critterpass address — default: in-app request; no address typed by others.
