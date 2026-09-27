import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateGallery } from './gallery-gen';
import { encodeToFile } from './encode';
import type { BakeManifest } from './manifest-types';
import {
  renderAllMusic,
  renderAllNotify,
  renderAllSfx,
  type RenderedMusic,
  type RenderedNotify,
  type RenderedSfx,
} from './render-outputs';

const OUT_DIR = path.resolve(import.meta.dirname, '../out');
const SFX_DIR = path.join(OUT_DIR, 'sfx');
const MUSIC_DIR = path.join(OUT_DIR, 'music');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const SAMPLE_RATE = 48000;

function buildManifest(): BakeManifest {
  const sfx = renderAllSfx();
  const notify = renderAllNotify();
  const music = renderAllMusic();
  return {
    generatedAt: new Date().toISOString(),
    sampleRate: SAMPLE_RATE,
    sfx: sfx.map((r) => r.entry),
    notify: notify.map((r) => r.entry),
    music: music.map((r) => r.entry),
  };
}

interface WriteOutputsResult {
  readonly manifest: BakeManifest;
  readonly sfx: readonly RenderedSfx[];
  readonly notify: readonly RenderedNotify[];
  readonly music: readonly RenderedMusic[];
}

function writeOutputs(): WriteOutputsResult {
  mkdirSync(SFX_DIR, { recursive: true });
  mkdirSync(MUSIC_DIR, { recursive: true });

  const sfx = renderAllSfx();
  for (const { pcm, entry } of sfx) {
    encodeToFile(pcm, SAMPLE_RATE, 'caf', path.join(OUT_DIR, entry.files.caf));
    encodeToFile(pcm, SAMPLE_RATE, 'ogg', path.join(OUT_DIR, entry.files.ogg));
  }

  const notify = renderAllNotify();
  for (const { pcm, entry } of notify) {
    encodeToFile(pcm, SAMPLE_RATE, 'caf', path.join(OUT_DIR, entry.files.caf));
    encodeToFile(pcm, SAMPLE_RATE, 'ogg', path.join(OUT_DIR, entry.files.ogg));
  }

  const music = renderAllMusic();
  for (const { pcm, previewPcm, entry } of music) {
    encodeToFile(pcm, SAMPLE_RATE, 'm4a', path.join(OUT_DIR, entry.files.loop));
    encodeToFile(previewPcm, SAMPLE_RATE, 'm4a', path.join(OUT_DIR, entry.files.preview));
  }

  const manifest: BakeManifest = {
    generatedAt: new Date().toISOString(),
    sampleRate: SAMPLE_RATE,
    sfx: sfx.map((r) => r.entry),
    notify: notify.map((r) => r.entry),
    music: music.map((r) => r.entry),
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, sfx, notify, music };
}

/** Compares freshly-rendered PCM hashes against the committed manifest — never encoded file bytes,
 * which vary by ffmpeg version/build across machines. Used by `--check` in CI. */
function checkAgainstCommittedManifest(): boolean {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      'sound-art bake --check: no committed manifest at out/manifest.json. Run `pnpm bake` first.',
    );
    return false;
  }
  const committed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as BakeManifest;
  const fresh = buildManifest();
  let ok = true;

  const committedSfxById = new Map(committed.sfx.map((e) => [e.id, e]));
  for (const entry of fresh.sfx) {
    const prior = committedSfxById.get(entry.id);
    if (!prior || prior.pcmHash !== entry.pcmHash) {
      console.error(
        `sound-art bake --check: SFX "${entry.id}" PCM hash changed or missing. Re-run \`pnpm bake\`.`,
      );
      ok = false;
    }
  }

  const committedNotifyByGuide = new Map(committed.notify.map((e) => [e.guideId, e]));
  for (const entry of fresh.notify) {
    const prior = committedNotifyByGuide.get(entry.guideId);
    if (!prior || prior.pcmHash !== entry.pcmHash) {
      console.error(
        `sound-art bake --check: notify "${entry.guideId}" PCM hash changed or missing.`,
      );
      ok = false;
    }
  }

  const committedMusicByGuide = new Map(committed.music.map((e) => [e.guideId, e]));
  for (const entry of fresh.music) {
    const prior = committedMusicByGuide.get(entry.guideId);
    if (
      !prior ||
      prior.pcmHash !== entry.pcmHash ||
      prior.previewPcmHash !== entry.previewPcmHash
    ) {
      console.error(
        `sound-art bake --check: theme "${entry.guideId}" PCM hash changed or missing.`,
      );
      ok = false;
    }
  }

  if (ok)
    console.log('sound-art bake --check: all PCM content hashes match the committed manifest.');
  return ok;
}

function main(): void {
  const checkMode = process.argv.includes('--check');
  if (checkMode) {
    process.exitCode = checkAgainstCommittedManifest() ? 0 : 1;
    return;
  }

  const { manifest, sfx, notify, music } = writeOutputs();
  generateGallery({ sfx, notify, music }, OUT_DIR);
  console.log(
    `sound-art bake: wrote ${manifest.sfx.length} SFX, ${manifest.notify.length} notify motifs and ${manifest.music.length} themes to ${OUT_DIR}`,
  );
}

main();
