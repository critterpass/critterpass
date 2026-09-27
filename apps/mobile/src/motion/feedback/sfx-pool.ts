import { createAudioPlayer, type AudioPlayer, type AudioSource } from 'expo-audio';
import { Platform } from 'react-native';

import type { SoundCueId } from '../impact';

// Every in-house `@cp/sound-art` SFX/ambient file, one `.caf` (iOS) + `.ogg` (Android) pair per
// cue (docs/decisions/20260927-in-house-procedural-audio.md). `platformSfx` below picks the right
// one per platform: iOS gets uncompressed PCM in a Core Audio Format container — what
// `AVAudioPlayer` expects for a short, zero-decode-latency SFX; Android gets Ogg-encapsulated
// Opus — `MediaExtractor`/ExoPlayer play it natively, and this environment's ffmpeg build has no
// `libvorbis` encoder to produce Ogg Vorbis instead. Both files of every pair are still bundled
// regardless of which platform actually loads it — Metro resolves a static `import` the same way
// on every platform.
import thudHeavyCaf from '../../../assets/sfx/thud-heavy.caf';
import thudHeavyOgg from '../../../assets/sfx/thud-heavy.ogg';
import thudSoftCaf from '../../../assets/sfx/thud-soft.caf';
import thudSoftOgg from '../../../assets/sfx/thud-soft.ogg';
import slapCaf from '../../../assets/sfx/slap.caf';
import slapOgg from '../../../assets/sfx/slap.ogg';
import peelCaf from '../../../assets/sfx/peel.caf';
import peelOgg from '../../../assets/sfx/peel.ogg';
import whooshCaf from '../../../assets/sfx/whoosh.caf';
import whooshOgg from '../../../assets/sfx/whoosh.ogg';
import tickCaf from '../../../assets/sfx/tick.caf';
import tickOgg from '../../../assets/sfx/tick.ogg';
import snapCaf from '../../../assets/sfx/snap.caf';
import snapOgg from '../../../assets/sfx/snap.ogg';
import successCaf from '../../../assets/sfx/success.caf';
import successOgg from '../../../assets/sfx/success.ogg';
import warningCaf from '../../../assets/sfx/warning.caf';
import warningOgg from '../../../assets/sfx/warning.ogg';
import errorCaf from '../../../assets/sfx/error.caf';
import errorOgg from '../../../assets/sfx/error.ogg';
import voteCaf from '../../../assets/sfx/vote.caf';
import voteOgg from '../../../assets/sfx/vote.ogg';
import bellCaf from '../../../assets/sfx/bell.caf';
import bellOgg from '../../../assets/sfx/bell.ogg';
import alarmCaf from '../../../assets/sfx/alarm-guide.caf';
import alarmOgg from '../../../assets/sfx/alarm-guide.ogg';
import eggCrackCaf from '../../../assets/sfx/egg-crack.caf';
import eggCrackOgg from '../../../assets/sfx/egg-crack.ogg';
import eggPopCaf from '../../../assets/sfx/egg-pop.caf';
import eggPopOgg from '../../../assets/sfx/egg-pop.ogg';
import critterChirpCaf from '../../../assets/sfx/critter-chirp.caf';
import critterChirpOgg from '../../../assets/sfx/critter-chirp.ogg';
import flapCaf from '../../../assets/sfx/flap.caf';
import flapOgg from '../../../assets/sfx/flap.ogg';
import printerCaf from '../../../assets/sfx/printer.caf';
import printerOgg from '../../../assets/sfx/printer.ogg';
import scannerCaf from '../../../assets/sfx/scanner.caf';
import scannerOgg from '../../../assets/sfx/scanner.ogg';
import shutterCaf from '../../../assets/sfx/shutter.caf';
import shutterOgg from '../../../assets/sfx/shutter.ogg';
import penCaf from '../../../assets/sfx/pen.caf';
import penOgg from '../../../assets/sfx/pen.ogg';
import pageCaf from '../../../assets/sfx/page.caf';
import pageOgg from '../../../assets/sfx/page.ogg';
import envelopeCaf from '../../../assets/sfx/envelope.caf';
import envelopeOgg from '../../../assets/sfx/envelope.ogg';

/** Picks `iosAsset` on iOS, `androidAsset` everywhere else (this app only ships iOS/Android). */
function platformSfx(iosAsset: AudioSource, androidAsset: AudioSource): AudioSource {
  return Platform.OS === 'ios' ? iosAsset : androidAsset;
}

/**
 * Bundled SFX/ambient assets, keyed by cue id: every `sound.tokens.json` cue with a non-null
 * `sfxAsset`, composed in-house and procedurally by `@cp/sound-art` (no licensed/third-party audio
 * — docs/decisions/20260927-in-house-procedural-audio.md). `tools/scripts/check-audio-assets.ts
 * --mode release` fails the build if a cue's asset file goes missing; `playCue` below no-ops
 * (haptic-only) for any cue with no entry in this map (e.g. `holdRamp`/`sos`, haptic-only by design).
 */
export const SFX_ASSET_MODULES: Partial<Record<SoundCueId, AudioSource>> = {
  'thud.heavy': platformSfx(thudHeavyCaf, thudHeavyOgg),
  'thud.soft': platformSfx(thudSoftCaf, thudSoftOgg),
  slap: platformSfx(slapCaf, slapOgg),
  peel: platformSfx(peelCaf, peelOgg),
  whoosh: platformSfx(whooshCaf, whooshOgg),
  tick: platformSfx(tickCaf, tickOgg),
  snap: platformSfx(snapCaf, snapOgg),
  success: platformSfx(successCaf, successOgg),
  warning: platformSfx(warningCaf, warningOgg),
  error: platformSfx(errorCaf, errorOgg),
  vote: platformSfx(voteCaf, voteOgg),
  bell: platformSfx(bellCaf, bellOgg),
  alarm: platformSfx(alarmCaf, alarmOgg),
  crack: platformSfx(eggCrackCaf, eggCrackOgg),
  pop: platformSfx(eggPopCaf, eggPopOgg),
  chirp: platformSfx(critterChirpCaf, critterChirpOgg),
  flap: platformSfx(flapCaf, flapOgg),
  printer: platformSfx(printerCaf, printerOgg),
  scanner: platformSfx(scannerCaf, scannerOgg),
  shutter: platformSfx(shutterCaf, shutterOgg),
  pen: platformSfx(penCaf, penOgg),
  page: platformSfx(pageCaf, pageOgg),
  envelope: platformSfx(envelopeCaf, envelopeOgg),
};

const players = new Map<SoundCueId, AudioPlayer>();

function playerFor(cueId: SoundCueId, source: AudioSource): AudioPlayer {
  const existing = players.get(cueId);
  if (existing) return existing;
  const player = createAudioPlayer(source);
  players.set(cueId, player);
  return player;
}

/**
 * Plays a cue's SFX at `volume` (0–1, already the product of the category/effects volume prefs).
 * A no-op — haptic-only fallback — for any cue with no licensed asset in `SFX_ASSET_MODULES`.
 */
export function playCue(cueId: SoundCueId, volume: number): void {
  const source = SFX_ASSET_MODULES[cueId];
  if (!source) return;
  const player = playerFor(cueId, source);
  player.volume = Math.max(0, Math.min(1, volume));
  // Fire-and-forget rather than awaiting the seek: a rapid replay (e.g. repeated ticks) must never
  // wait a native round-trip before sound starts, at the cost of a rare few-millisecond restart from
  // a reused player's previous position rather than a guaranteed sample-accurate 0.
  void player.seekTo(0);
  player.play();
}

/** Preloads every licensed SFX asset so first playback has no load latency. Call once at app start. */
export function preloadAllSfx(): void {
  for (const cueId of Object.keys(SFX_ASSET_MODULES) as SoundCueId[]) {
    const source = SFX_ASSET_MODULES[cueId];
    if (source) playerFor(cueId, source);
  }
}

/** Test-only: the player pool is module-level state that otherwise leaks across test files. */
export function resetSfxPoolForTests(): void {
  for (const player of players.values()) player.remove();
  players.clear();
}

/** Test-only: inspects the pooled player for a cue (or `undefined` if it was never played). */
export function peekSfxPlayerForTests(cueId: SoundCueId): AudioPlayer | undefined {
  return players.get(cueId);
}
