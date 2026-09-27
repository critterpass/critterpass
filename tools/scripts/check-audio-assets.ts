import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { tokens } from '@cp/design-tokens';

/**
 * Guards the phase's launch gate (plan §"Non-code dependencies"): every `sound.tokens.json` cue with
 * an SFX asset, and every guide in the music manifest, needs a real licensed file before release.
 * `--mode release` (the default release-build gate) fails on any gap; `--mode pr` (CI on pull
 * requests, before assets are licensed) only warns, so day-to-day development is never blocked by
 * this launch-gate dependency.
 */
export type CheckMode = 'release' | 'pr';

const MOBILE_DIR = path.resolve(import.meta.dirname, '../../apps/mobile');
const MUSIC_MANIFEST_PATH = path.join(MOBILE_DIR, 'assets/music/manifest.json');

export interface MusicManifestGuide {
  readonly guideId: string;
  readonly available: boolean;
  readonly asset: string | null;
}

interface MusicManifest {
  readonly guides: readonly MusicManifestGuide[];
}

function readMusicManifest(): MusicManifest {
  const raw = readFileSync(MUSIC_MANIFEST_PATH, 'utf-8');
  return JSON.parse(raw) as MusicManifest;
}

/** Every `sound.tokens.json` cue whose `sfxAsset` should exist under `apps/mobile/assets/`. */
function sfxCueAssets(): { cueId: string; assetPath: string }[] {
  return Object.entries(tokens.sound.cue)
    .filter(([, cue]) => cue.sfxAsset !== null)
    .map(([cueId, cue]) => ({ cueId, assetPath: cue.sfxAsset as string }));
}

export interface AudioAssetCheckResult {
  readonly missingSfx: readonly string[];
  readonly missingMusic: readonly string[];
}

/** Pure check over the token cue table and the music manifest; safe to unit test without real audio files. */
export function findMissingAudioAssets(): AudioAssetCheckResult {
  const missingSfx = sfxCueAssets()
    .filter(({ assetPath }) => !existsSync(path.join(MOBILE_DIR, 'assets', assetPath)))
    .map(({ cueId, assetPath }) => `${cueId} (assets/${assetPath})`);

  const manifest = readMusicManifest();
  const missingMusic = manifest.guides
    .filter(
      (guide) =>
        !guide.available ||
        !guide.asset ||
        !existsSync(path.join(MOBILE_DIR, 'assets', guide.asset)),
    )
    .map((guide) => guide.guideId);

  return { missingSfx, missingMusic };
}

function main(): void {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1];
  const mode: CheckMode = modeArg === 'release' ? 'release' : 'pr';

  const { missingSfx, missingMusic } = findMissingAudioAssets();
  const hasGaps = missingSfx.length > 0 || missingMusic.length > 0;

  if (!hasGaps) {
    console.log('Audio asset check passed: every SFX cue and music guide has a licensed asset.');
    return;
  }

  const lines = [
    ...missingSfx.map((entry) => `  - SFX cue missing an asset: ${entry}`),
    ...missingMusic.map((guideId) => `  - Music guide missing an asset: ${guideId}`),
  ];

  if (mode === 'release') {
    console.error('Audio asset check failed (release gate):');
    for (const line of lines) console.error(line);
    process.exitCode = 1;
    return;
  }

  console.warn('Audio asset check: gaps found (warning only outside a release build):');
  for (const line of lines) console.warn(line);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main();
}
