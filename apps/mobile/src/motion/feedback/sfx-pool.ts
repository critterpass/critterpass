import { createAudioPlayer, type AudioPlayer, type AudioSource } from 'expo-audio';

import type { SoundCueId } from '../impact';

/**
 * Bundled SFX/ambient assets, keyed by cue id. Empty today: the SFX library (~40 clips across 6
 * families — thud, slap, peel, chimes, flap, ambient) is a launch-gate licensing dependency the
 * founder owns (plan §"Non-code dependencies"); this repo never commits unlicensed audio. Add a
 * literal `require('../../../assets/sfx/<file>.m4a')` entry here per cue as each licensed asset
 * lands — `tools/scripts/check-audio-assets.ts --mode release` fails the build until every SFX-kind
 * cue has one, and `playCue` below no-ops (haptic-only) for any cue missing from this map.
 */
export const SFX_ASSET_MODULES: Partial<Record<SoundCueId, AudioSource>> = {};

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
