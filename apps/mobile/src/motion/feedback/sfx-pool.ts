import { createAudioPlayer, type AudioPlayer, type AudioSource } from 'expo-audio';

import type { SoundCueId } from '../impact';

import { SFX_ASSET_MODULES } from './sfx-assets';

/**
 * Bundled SFX/ambient assets, keyed by cue id: every `sound.tokens.json` cue with a non-null
 * `sfxAsset`, composed in-house and procedurally by `@cp/sound-art` (no licensed/third-party audio
 * — docs/decisions/20260927-in-house-procedural-audio.md). Each platform bundles only its own
 * format: `sfx-assets.ios.ts` maps `.caf` files, `sfx-assets.android.ts` maps `.ogg` files.
 * `tools/scripts/check-audio-assets.ts --mode=release` fails the build if a cue's asset goes missing
 * or the two maps drift; `playCue` below no-ops (haptic-only) for any cue with no entry in this map
 * (e.g. `holdRamp`/`sos`, haptic-only by design).
 */
export { SFX_ASSET_MODULES };

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
