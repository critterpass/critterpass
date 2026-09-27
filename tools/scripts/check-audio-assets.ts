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
const SFX_MAP_DIR = path.join(MOBILE_DIR, 'src/motion/feedback');

/**
 * Each platform bundles only its own SFX format through a Metro platform module. Android resource
 * names drop the file extension, so a `.caf` and `.ogg` twin in one Android bundle collide in
 * `res/raw` and abort Gradle's resource merge; each map must therefore import exactly one format.
 */
export const SFX_PLATFORM_MAPS = [
  { platform: 'ios', file: 'sfx-assets.ios.ts', ext: '.caf' },
  { platform: 'android', file: 'sfx-assets.android.ts', ext: '.ogg' },
] as const;

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
  readonly sfxMapGaps: readonly string[];
}

/** Asset paths (relative to `apps/mobile/assets/`) a platform SFX map source imports. */
export function importedAssetPaths(source: string, mapDir: string): string[] {
  const assetsDir = path.join(MOBILE_DIR, 'assets');
  return [...source.matchAll(/^import \w+ from '([^']+)';$/gm)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => specifier.includes('/assets/'))
    .map((specifier) => path.relative(assetsDir, path.resolve(mapDir, specifier)));
}

/**
 * Every token cue's asset, in each platform's format, must exist and be imported by that platform's
 * map, and a map must import nothing else (in particular, never the other platform's format).
 */
function findSfxMapGaps(): string[] {
  // Music cues (`music/*.m4a`) ship the same file on both platforms through the music themes.
  const cues = sfxCueAssets().filter(({ assetPath }) => assetPath.startsWith('sfx/'));
  const gaps: string[] = [];
  for (const { platform, file, ext } of SFX_PLATFORM_MAPS) {
    const mapPath = path.join(SFX_MAP_DIR, file);
    if (!existsSync(mapPath)) {
      gaps.push(`${platform}: ${file} is missing`);
      continue;
    }
    const imported = new Set(importedAssetPaths(readFileSync(mapPath, 'utf-8'), SFX_MAP_DIR));
    const expected = new Set<string>();
    for (const { cueId, assetPath } of cues) {
      const platformAsset = assetPath.replace(/\.[^./]+$/, ext);
      expected.add(platformAsset);
      if (!existsSync(path.join(MOBILE_DIR, 'assets', platformAsset))) {
        gaps.push(`${platform}: ${cueId} file missing (assets/${platformAsset})`);
      }
      if (!imported.has(platformAsset)) {
        gaps.push(`${platform}: ${cueId} not imported by ${file} (assets/${platformAsset})`);
      }
    }
    for (const assetPath of imported) {
      if (!expected.has(assetPath)) {
        gaps.push(`${platform}: ${file} imports an unexpected asset (assets/${assetPath})`);
      }
    }
  }
  return gaps;
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

  return { missingSfx, missingMusic, sfxMapGaps: findSfxMapGaps() };
}

function main(): void {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1];
  const mode: CheckMode = modeArg === 'release' ? 'release' : 'pr';

  const { missingSfx, missingMusic, sfxMapGaps } = findMissingAudioAssets();
  const hasGaps = missingSfx.length > 0 || missingMusic.length > 0 || sfxMapGaps.length > 0;

  if (!hasGaps) {
    console.log(
      'Audio asset check passed: every SFX cue (iOS and Android maps) and music guide has an asset.',
    );
    return;
  }

  const lines = [
    ...missingSfx.map((entry) => `  - SFX cue missing an asset: ${entry}`),
    ...missingMusic.map((guideId) => `  - Music guide missing an asset: ${guideId}`),
    ...sfxMapGaps.map((gap) => `  - SFX platform map gap: ${gap}`),
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
