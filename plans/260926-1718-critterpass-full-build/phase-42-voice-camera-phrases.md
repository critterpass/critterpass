---
phase: 42
title: Voice mode, point-and-ask, phrase practice
status: pending
depends_on: [32, 41]
wave: 20
features: [F-095, F-096, F-192]
screens: [3j-2, 3j-3, 3l-7, 3n-2]
tasks: 9
owns:
  - apps/mobile/modules/cp-speech/**
  - apps/mobile/modules/cp-ocr/src/live/**
  - apps/mobile/src/features/guide/{voice,camera,phrase-practice}/**
  - apps/mobile/src/app/(modal)/guide/{voice,camera,practice}.tsx
  - packages/ai/src/routes/{voice,camera,phrase-practice}/**
  - packages/ai/evals/{voice,camera,phrase-practice}/**
  - services/api/src/routes/{voice,camera,stt-token}.ts
  - services/api/src/commands/guide/record-phrase-practice.ts
  - services/api/src/lib/tts/**
  - services/worker/src/jobs/quests/templates/phrase-practice.ts
  - packages/i18n/locales/en/guide/{voice,camera,practice}.po
  - e2e/guide/{voice,camera,practice}*.yaml
---
# Phase 42 — Voice mode, point-and-ask, phrase practice

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (cascaded voice, vision via OCR + Sonnet), C12 (voice/camera in 30/day; Talk out loud free in meter), C48 |
| `docs/system-architecture.md` | §4.6 AI, native modules |
| `docs/code-standards.md` | native module rules, a11y, AI rules |
| `docs/data-model.md` | `guide_messages.attachments`/`voice`, `phrase_progress`, `phrase_cards`, `participant_dietary_flags`, `fair_use_counters` (voice_seconds, vision_calls) |
| `docs/api-contracts.md` | §4.8 `record_phrase_practice`; §5.3 `turns` mode voice `audio{seq}`, `POST /v1/camera/menu`, `POST /v1/stt/token` |
| Phases | P32 guide sheet/meter/phrase cards, P41 quests (`quest.evaluate` consumes `phrase.practised`), P33 cp-ocr still-image module |
| Reports | `researcher-260926-1143-ai-guide-report.md` §3.3, §4.4 voice latency, §4.5 camera, §4.9 safety; master §2 F-095/F-096/F-192, AI-21, AI-22, AI-43, platform rows (camera, speech/TTS) |
| Renders | `docs/design-renders/screens/3j-2_Voice.png`, `3j-3_Point_and_ask.png`, `3l-7_Crew_quests.png`, `3n-2_*.png` |

## Overview

Goal: talk to the guide hands-free (on-device/Deepgram STT → Haiku → ElevenLabs Flash per-guide voice, barge-in), point the camera at a menu for live translation stickers with crew dietary clash flags, and practise phrases with the guide feeding the "Say it in Bahasa" quest.

Done when: a voice turn returns first audio ≤ 1.5 s p50 on Singapore stack, interrupting playback stops audio and starts listening; a menu scan shows on-device stickers then Sonnet translations keyed by OCR line id with clash flags + allergy caution; five practised phrases advance the quest via `phrase.practised`; all three count in the 30/day meter (practice exempt).

## Requirements

### F-095 Voice mode (3j-2)
| Item | Behaviour |
|---|---|
| Entry | hold-to-talk in guide composer, or voice button → full voice screen; mode line "TOKEK · GROUP MODE" |
| Listening | rings breathe (`ping`), waveform follows mic level (RMS from native module at 30 Hz), live partial transcript |
| STT | iOS 26 SpeechAnalyzer/SpeechTranscriber on device; Android and unsupported locales: Deepgram Nova-3 streaming via short-lived token (`POST /v1/stt/token`) |
| Brain | same `turns` route with `mode: voice` (Haiku, P13 routing), spoken-length cap by chattiness; filler line during tool rounds ("Checking the rain…") |
| TTS | ElevenLabs Flash v2.5 streaming, one owned voice per guide (`guides.voice_id`); v3 fallback for unsupported languages; audio chunks via SSE `audio{seq}` |
| Answer | rings snap in; swap cards drop onto table one after another; SEND TO THE GROUP → `create_vote_from_guide` |
| Barge-in | user speech detected (VAD on-device) during playback → stop audio, cancel remaining TTS, start new turn; partially spoken answer kept as text. Echo: VAD runs on the echo-cancelled mic signal — iOS `AVAudioSession` mode `.voiceChat` (voice-processing I/O), Android `AudioSource.VOICE_COMMUNICATION` + `AcousticEchoCanceler` (and `NoiseSuppressor`) when available; device without AEC → barge-in only via tap (hold-to-talk) |
| Talk out loud (3n-2) | "Voice replies when you speak first": text turns reply in text; voice turns reply spoken; free within meter (C12) |
| Audio session | iOS `playAndRecord` + `.voiceChat`, ducking others, Bluetooth HFP/A2DP routes; Android `MODE_IN_COMMUNICATION` while in voice mode. `playAndRecord` ignores the ring/silent switch and iOS has no public switch API, so muting is explicit: voice-screen "Mute replies" toggle (persisted) and media volume 0 → reply shown as text only, no audio; text is always shown alongside audio |
| Metering | each voice turn = 1 question; `fair_use_counters.voice_seconds` silent cap on unlimited tiers |
| States (design in code) | mic/speech permission primer + denied path, no network (on-device STT → text queued), STT failure, TTS failure → text reply, quota hit (4b-1 card spoken trail-off), noisy environment hint |
| A11y | VoiceOver: announces transcript and reply; hold-to-talk also has toggle mode |

### F-096 Point and ask (3j-3)
| Item | Behaviour |
|---|---|
| Camera | vision-camera + live OCR frame processor (Vision `RecognizeTextRequest` iOS / ML Kit Android) returning lines + boxes with stable line ids |
| First stickers | on-device translation (Apple Translation framework / ML Kit Translate) peel onto boxes ≤ 1.5 s |
| Server | on lock (stable frame), `POST /v1/camera/menu` with `ocr_lines[{id,text,bbox}]` + downscaled crop (≤1568 px) → Sonnet structured `item{ocr_line_id, translation, description, spice, flags[{member, ok\|clash, reason}]}` + suggestion line (D5: no numbers from the model); price parsed by code from the OCR text of the item's line (and adjacent price-column lines by bbox row) with currency detection → `price{amount, currency, source_line_id}`; validator strips any digits/currency from model text fields; overlays keyed by line id |
| Dietary | crew flags via `participant_dietary_flags` (consented only); clashing dishes shake once and turn pink; chips "JORDAN ✓ VEG", "ALEX ✕ PEANUTS" |
| Caution | persistent "Flags are a guide, not medical advice. Ask staff about allergies." + one-tap allergy phrase card (P32 `<PhraseCard>`) |
| Follow-ups | chips LEAST SPICY?, ORDER FOR 6 (order card: dish list in local language + show mode), SPLIT THE BILL (P33 expense prefill); composer "Ask about this menu" → turn with menu context |
| Metering | one scan = 1 question; follow-ups = questions; `vision_calls` fair-use |
| Privacy | photo not stored unless user saves; crop sent to API only; no supplier content |
| States | camera permission primer/denied, low light, no text found, unsupported script, offline (on-device stickers only, labelled) |

### F-192 Phrase practice (3l-7)
- Practice mode from phrase card or quest "SAY IT IN BAHASA": guide says phrase (pre-rendered), user repeats; on-device STT recognises in target language; AI-43 feedback `{recognised, ok|retry, tip}` (Haiku, only on mismatch; exact match graded locally).
- `record_phrase_practice` → `phrase_progress` + `phrase.practised` event → P41 `quest.evaluate` (five phrases → +80 XP).
- Progress list (learned / practising), streak-free; pronunciation check optional (toggle; off = tap "I said it").
- Unmetered.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Native `cp-speech` | Swift: SpeechAnalyzer stream, AVAudioSession (`.voiceChat`), RMS level events, VAD, AVAudioPlayer chunk queue; Kotlin: SpeechRecognizer/AudioRecord (VOICE_COMMUNICATION + AEC), Deepgram websocket, level, ExoPlayer chunk queue; JS API `start({locale}) / stop() / onPartial / onLevel / onSpeechStart / playChunks / cancelPlayback / setMuted`; debug-only `setInputSource({fixtureAudio: uri})` feeds a WAV file instead of the mic (compiled out of release) for simulator/Maestro tests |
| Native `cp-ocr/src/live` | frame-processor plugin (vision-camera) extending P33 still-image OCR; returns `{id, text, bbox, confidence}` with id stable across frames (IoU tracking); debug-only fixture-frame source (image/video file replayed as frames, compiled out of release) for simulator/Maestro tests |
| HTTP | `POST /v1/stt/token` (Deepgram scoped key, 60 s TTL), `POST /v1/camera/menu` (SSE), `turns` `mode: voice` streams `audio{seq, url}` |
| Server TTS | `services/api/src/lib/tts/elevenlabs.ts` streaming client, sentence chunker, per-guide voice lookup |
| Commands | `record_phrase_practice` |
| Events | `phrase.practised` (quest input) |
| AI routes | `voice.turn` (Haiku, speech-length cap), `camera.menu` (Sonnet structured, no tools), `phrase.feedback` (Haiku) |
| Consent | `consents.purpose=ai_voice` recorded at first voice use (audio to third-party STT on Android) |

## Tasks

### T1 — cp-speech iOS: STT, audio session, playback
- Goal: iOS half of `cp-speech` with the JS API.
- Files: `apps/mobile/modules/cp-speech/{expo-module.config.json,src/**,ios/**}`
- Steps: 1. Expo module scaffold + TS API. 2. SpeechAnalyzer/SpeechTranscriber stream with partials. 3. AVAudioSession `playAndRecord` + `.voiceChat`, route changes, interruptions. 4. RMS level events 30 Hz. 5. Chunk playback queue + cancel + `setMuted`. 6. Debug fixture-audio input source.
- Tests: `pnpm --filter @cp/mobile test -- modules/cp-speech`; `xcodebuild test -scheme CpSpeechTests`
- Done when: XCTests pass; on the iOS 26 simulator the fixture WAV produces the expected transcript and chunks play in order and stop on `cancelPlayback`.

### T2 — cp-speech Android + Deepgram
- Goal: Android half and Deepgram streaming for Android/unsupported locales.
- Files: `apps/mobile/modules/cp-speech/android/**`, `apps/mobile/modules/cp-speech/src/deepgram.ts`
- Steps: 1. AudioRecord (VOICE_COMMUNICATION) + AcousticEchoCanceler/NoiseSuppressor. 2. Deepgram Nova-3 websocket with `POST /v1/stt/token` token (iOS fallback path shares the TS client). 3. On-device SpeechRecognizer where the locale is supported offline. 4. ExoPlayer chunk queue + cancel + mute. 5. Debug fixture-audio source.
- Tests: `./gradlew :cp-speech:testDebugUnitTest`; `pnpm --filter @cp/mobile test -- modules/cp-speech/deepgram`
- Done when: unit tests pass (Deepgram with recorded websocket fixture); on the API 36 emulator the fixture WAV yields a transcript and playback cancels.

### T3 — VAD and barge-in
- Goal: speech-start detection during playback on the echo-cancelled signal.
- Files: `apps/mobile/modules/cp-speech/{ios/Vad.swift,android/src/main/java/app/critterpass/speech/Vad.kt,src/barge-in.ts}` + tests
- Steps: 1. Energy + spectral VAD with hangover on AEC input. 2. `onSpeechStart` during playback → `cancelPlayback` within 200 ms. 3. No-AEC device → barge-in disabled, tap-to-interrupt. 4. Fixture: TTS audio playing + fixture user speech mixed in.
- Tests: `xcodebuild test -scheme CpSpeechTests -only-testing:VadTests`; `./gradlew :cp-speech:testDebugUnitTest --tests '*Vad*'`; `pnpm --filter @cp/mobile test -- modules/cp-speech/barge-in`
- Done when: own-TTS-only fixture never triggers barge-in; TTS + user-speech fixture stops playback ≤ 200 ms (both platforms, simulator/emulator).

### T4 — Voice server path (STT token, TTS streaming)
- Goal: voice turns stream audio.
- Files: `services/api/src/routes/stt-token.ts`, `services/api/src/lib/tts/**`, `packages/ai/src/routes/voice/**`, `packages/ai/evals/voice/**`
- Steps: 1. Token route (rate-limited). 2. Sentence chunker → ElevenLabs Flash stream → R2-less direct chunk URLs/b64. 3. Filler lines. 4. Latency metrics to OTel.
- Tests: `pnpm --filter @cp/api test -- routes/voice`; `pnpm --filter @cp/ai eval -- voice`
- Done when: integration test with recorded ElevenLabs fixture verifies ordered `audio{seq}`; TTFA metric emitted.

### T5 — Voice screen (3j-2) + barge-in
- Goal: designed voice UI with rings/waveform and barge-in.
- Files: `apps/mobile/src/features/guide/voice/**`, `apps/mobile/src/app/(modal)/guide/voice.tsx`, `packages/i18n/locales/en/guide/voice.po`
- Steps: 1. Rings/waveform (Skia) from level. 2. Turn lifecycle + swap cards + SEND TO THE GROUP. 3. Barge-in cancel. 4. Permission and failure states.
- Tests: `pnpm --filter @cp/mobile test -- features/guide/voice`; `maestro test e2e/guide/voice-turn.yaml` (debug build, fixture-audio source)
- Done when: barge-in UI test (fixture audio during playback) stops playback within 200 ms; mute toggle yields text-only reply; denied-permission path falls back to text.

### T6 — Live OCR frame processor
- Goal: stable line ids from live camera.
- Files: `apps/mobile/modules/cp-ocr/src/live/**`
- Steps: 1. Vision/ML Kit per frame (throttled 5 fps). 2. IoU tracking ids. 3. On-device translation hook. 4. Debug fixture-frame source.
- Tests: `xcodebuild test -scheme CpOcrLiveTests`; `./gradlew :cp-ocr:testDebugUnitTest`
- Done when: fixture video frames yield stable ids across ≥ 90 % of frames.

### T7 — Menu server route (Sonnet structured) + dietary flags
- Goal: translation + clash flags keyed by OCR line id.
- Files: `services/api/src/routes/camera.ts`, `packages/ai/src/routes/camera/**`, `packages/ai/evals/camera/**`
- Steps: 1. Validate lines/crop. 2. Consented flags from `llm` view. 3. Structured output (no price field); drop items with unknown line ids; strip digits/currency from model text. 4. `parseMenuPrice(lines, item_line_id)` in code (same-row bbox, currency symbols/codes, thousand separators e.g. "45.000" IDR, "45k"). 5. Meter + vision fair-use.
- Tests: `pnpm --filter @cp/api test -- routes/camera`; `pnpm --filter @cp/ai eval -- camera`
- Done when: eval covers peanut/veg clash on 10 fixture menus; unknown ids rejected; no flags without consent; every displayed price equals the code-parsed OCR value (unit tests on 10 fixture menus); model output with numbers is stripped.

### T8 — Point-and-ask screen (3j-3)
- Goal: stickers, shake-pink clash, caution, follow-ups.
- Files: `apps/mobile/src/features/guide/camera/**`, `apps/mobile/src/app/(modal)/guide/camera.tsx`, `packages/i18n/locales/en/guide/camera.po`
- Steps: 1. Sticker overlay aligned to boxes. 2. Clash animation. 3. Caution + allergy phrase card. 4. ORDER FOR 6 card, SPLIT THE BILL prefill, follow-up turns.
- Tests: `pnpm --filter @cp/mobile test -- features/guide/camera`; `maestro test e2e/guide/camera-menu.yaml` (debug build, cp-ocr fixture-frame source)
- Done when: caution text always visible when any flag shown; offline shows on-device stickers only.

### T9 — Phrase practice (3l-7)
- Goal: practise mode feeding quests.
- Files: `apps/mobile/src/features/guide/phrase-practice/**`, `apps/mobile/src/app/(modal)/guide/practice.tsx`, `services/api/src/commands/guide/record-phrase-practice.ts`, `packages/ai/src/routes/phrase-practice/**`, `packages/i18n/locales/en/guide/practice.po`
- Steps: 1. Listen → repeat → local grade → Haiku tip on mismatch. 2. Command + event. 3. Progress list. 4. Register quest template `phrase_practice{n, language}` consuming `phrase.practised` via the P41 `registerQuestTemplate` registry (`services/worker/src/jobs/quests/templates/phrase-practice.ts`).
- Tests: `pnpm --filter @cp/api test -- commands/guide/record-phrase-practice`; `pnpm --filter @cp/worker test -- quests/templates/phrase-practice`; `maestro test e2e/guide/practice-quest.yaml` (fixture-audio source)
- Done when: five practised phrases advance the quest in P41 test fixture; practice turns not metered.

## Phase acceptance criteria
- [ ] Voice TTFA p50 ≤ 1.5 s measured on staging (OTel dashboard).
- [ ] Barge-in stops audio ≤ 200 ms.
- [ ] Menu clash flags only for consented members; caution always shown.
- [ ] Voice turns and scans each consume one meter unit; practice consumes none.
- [ ] Maestro flows `e2e/guide/{voice,camera,practice}*.yaml` pass on iOS and Android.

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Latency above target | shorter first clause, Flash only, filler line; flag `voice.enabled` hides voice entry |
| Allergy harm from wrong flag | advisory copy, "ask staff" phrase, never "safe" wording; eval fixtures |
| On-device STT locale gaps | Deepgram fallback on iOS too |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Owned voice actors per guide | stock ElevenLabs voice per guide |
| Deepgram / ElevenLabs contracts, DPA | iOS on-device STT only; TTS off → text replies |
| Counsel review of allergy disclaimer | ship with conservative advisory copy |
| Founder device checklist (agents cannot run physical devices or real mic/camera) | on iPhone (iOS 26) + Android 36 phone: real-voice turn TTFA, barge-in over speaker without self-trigger, Bluetooth route, live menu scan in low light |

## Open questions
1. Pronunciation check on by default? Default off (tracking + "I said it"), toggle on.
2. Extend P33 `cp-ocr` vs separate live module? Default extend under `cp-ocr/src/live` (coordinate with P33 owner).
3. doc delta: `consents.purpose ai_voice` use at first voice turn; `phrase.feedback` route not in api-contracts §5.3.
4. plan.md delta: tasks 9 (cp-speech split into T1–T3).
