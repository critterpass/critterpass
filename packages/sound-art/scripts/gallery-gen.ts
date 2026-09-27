import { writeFileSync } from 'node:fs';
import path from 'node:path';

import type { RenderedMusic, RenderedNotify, RenderedSfx } from './render-outputs';

/** Downsamples PCM into `buckets` min/max pairs (0-1 range) for a lightweight inline SVG waveform. */
function waveformPoints(
  pcm: Float32Array,
  buckets: number,
): readonly (readonly [number, number])[] {
  const bucketSize = Math.max(1, Math.floor(pcm.length / buckets));
  const points: [number, number][] = [];
  for (let b = 0; b < buckets; b += 1) {
    const start = b * bucketSize;
    const end = Math.min(pcm.length, start + bucketSize);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i += 1) {
      const v = pcm[i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    points.push([min, max]);
  }
  return points;
}

function waveformSvg(pcm: Float32Array, width: number, height: number): string {
  const points = waveformPoints(pcm, width);
  const mid = height / 2;
  const bars = points
    .map(([min, max], i) => {
      const y1 = mid - max * mid;
      const y2 = mid - min * mid;
      return `<line x1="${i}" y1="${y1.toFixed(1)}" x2="${i}" y2="${y2.toFixed(1)}" />`;
    })
    .join('');
  return `<svg class="waveform" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${bars}</svg>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sfxRowHtml(rendered: RenderedSfx): string {
  const { entry } = rendered;
  return `
    <tr>
      <td>${escapeHtml(entry.id)}</td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${entry.durationSec.toFixed(2)}s</td>
      <td>${entry.loudnessLufs.toFixed(1)} LUFS / ${entry.truePeakDb.toFixed(1)} dBTP</td>
      <td>${waveformSvg(rendered.pcm, 160, 32)}</td>
      <td><audio controls src="../out/${entry.files.ogg}"></audio></td>
    </tr>`;
}

function notifyRowHtml(rendered: RenderedNotify): string {
  const { entry } = rendered;
  return `
    <tr>
      <td>notify-${escapeHtml(entry.guideId)}</td>
      <td>${entry.durationSec.toFixed(2)}s</td>
      <td>${entry.loudnessLufs.toFixed(1)} LUFS / ${entry.truePeakDb.toFixed(1)} dBTP</td>
      <td>${waveformSvg(rendered.pcm, 160, 32)}</td>
      <td><audio controls src="../out/${entry.files.ogg}"></audio></td>
    </tr>`;
}

function musicSectionHtml(rendered: RenderedMusic): string {
  const { entry } = rendered;
  const proposalBadge = entry.proposalPendingApproval
    ? '<span class="badge">proposal — pending founder approval</span>'
    : '<span class="badge badge-named">named theme</span>';
  return `
    <article class="theme">
      <h3>${escapeHtml(entry.title)} ${proposalBadge}</h3>
      <p>${escapeHtml(entry.styleDescription)}</p>
      <p class="meta">${entry.durationSec.toFixed(1)}s loop &middot; ${entry.loudnessLufs.toFixed(1)} LUFS &middot; ${entry.truePeakDb.toFixed(1)} dBTP</p>
      ${waveformSvg(rendered.pcm, 640, 80)}
      <div class="players">
        <label>Loop <audio controls loop src="../out/${entry.files.loop}"></audio></label>
        <label>Preview <audio controls src="../out/${entry.files.preview}"></audio></label>
      </div>
    </article>`;
}

const PAGE_STYLE = `
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #222; background: #faf7f0; }
  h1 { margin-bottom: 0.25rem; }
  h2 { margin-top: 2.5rem; border-bottom: 2px solid #ddd; padding-bottom: 0.25rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  td, th { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
  .waveform { width: 160px; height: 32px; stroke: #b5602e; }
  .waveform line { stroke: #b5602e; }
  .theme .waveform { width: 640px; height: 80px; }
  audio { height: 28px; }
  .theme { background: white; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .badge { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: #e0e0e0; margin-left: 0.5rem; }
  .badge-named { background: #cfe8cf; }
  .players label { display: inline-block; margin-right: 1.5rem; font-size: 0.85rem; }
`;

export interface GalleryInput {
  readonly sfx: readonly RenderedSfx[];
  readonly notify: readonly RenderedNotify[];
  readonly music: readonly RenderedMusic[];
}

/** Writes the static listening gallery (`gallery/index.html`), linking to the just-baked audio files. */
export function generateGallery(input: GalleryInput, outDir: string): void {
  const sfxByCategory = new Map<string, RenderedSfx[]>();
  for (const rendered of input.sfx) {
    const list = sfxByCategory.get(rendered.entry.category) ?? [];
    list.push(rendered);
    sfxByCategory.set(rendered.entry.category, list);
  }

  const sfxSections = Array.from(sfxByCategory.entries())
    .map(
      ([category, rows]) => `
      <h2>${escapeHtml(category)}</h2>
      <table>
        <thead><tr><th>Cue</th><th>Category</th><th>Duration</th><th>Loudness</th><th>Waveform</th><th>Play</th></tr></thead>
        <tbody>${rows.map(sfxRowHtml).join('')}</tbody>
      </table>`,
    )
    .join('');

  const notifySection = `
    <h2>Per-guide notification sounds</h2>
    <table>
      <thead><tr><th>Cue</th><th>Duration</th><th>Loudness</th><th>Waveform</th><th>Play</th></tr></thead>
      <tbody>${input.notify.map(notifyRowHtml).join('')}</tbody>
    </table>`;

  const musicSection = `
    <h2>Guide music themes</h2>
    ${input.music.map(musicSectionHtml).join('')}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Critterpass sound-art listening gallery</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <h1>Critterpass sound-art listening gallery</h1>
  <p>Every cue and theme is synthesised in-house from code — no samples, no third-party audio. Generated by <code>pnpm --filter @cp/sound-art bake</code>.</p>
  ${musicSection}
  ${notifySection}
  ${sfxSections}
</body>
</html>
`;

  writeFileSync(path.join(outDir, '..', 'gallery', 'index.html'), html);
}
