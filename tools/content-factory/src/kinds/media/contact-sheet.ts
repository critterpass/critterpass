/**
 * Review sheets for a media batch: each candidate's preview saved beside the batch, and one sheet
 * per subject with every candidate numbered by rank and labelled with its id, kind and credit, so
 * a reviewer can pick at a glance before keeping or rejecting items in the ops console. A place
 * batch's places are reviewed on its pages instead (review-page.ts), one per destination.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ContentItem } from '@cp/content';
import { createCanvas, loadImage } from '@napi-rs/canvas';

import { readJsonIfExists } from '../../work';
import type { RenderedItem } from '../types';
import { USER_AGENT } from './http';
import { renderPlacePages, type PlaceReview } from './review-page';

/** The proposals a place batch's brief leaves beside the batch, for its review pages. */
export const PROPOSALS_FILE = 'place-proposals.json';

const THUMB_W = 480;
const THUMB_H = 300;
const LABEL_H = 54;
const COLUMNS = 4;

const TRIES = 5;
const BUSY_WAIT_MS = 4000;

/**
 * A preview's bytes, or null when the source does not answer (the sheet shows its label alone). A
 * dropped connection or a busy answer (429) is tried again a few times.
 */
async function download(
  url: string,
  fetchImpl: typeof fetch,
  wait: (ms: number) => Promise<void>,
): Promise<Buffer | null> {
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (response.status !== 429) return null;
    } catch {
      // A dropped connection gets another try.
    }
    await wait(BUSY_WAIT_MS);
  }
  return null;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function renderMediaSheets(
  items: readonly ContentItem<'media'>[],
  outDir: string,
  fetchImpl: typeof fetch = fetch,
  batchKey = path.basename(outDir),
  wait: (ms: number) => Promise<void> = pause,
): Promise<RenderedItem[]> {
  mkdirSync(outDir, { recursive: true });
  const review = readJsonIfExists<PlaceReview>(path.join(outDir, PROPOSALS_FILE));
  const rendered: RenderedItem[] = [];
  const previews = new Map<string, Buffer>();
  for (const item of items) {
    const file = `${item.id}.jpg`;
    const saved = path.join(outDir, file);
    // A re-run keeps the previews it already has.
    const bytes = existsSync(saved)
      ? readFileSync(saved)
      : await download(item.preview_url, fetchImpl, wait);
    if (bytes === null) continue;
    writeFileSync(saved, bytes);
    previews.set(item.id, bytes);
    rendered.push({ ref: item.id, file });
  }
  if (review !== undefined) await renderPlacePages(items, review, previews, outDir, batchKey);
  const subjects = [...new Set(items.flatMap((item) => item.subjects))].filter(
    (subject) => review === undefined || !subject.startsWith('poi:'),
  );
  for (const subject of subjects) {
    const members = items
      .filter((item) => item.subjects.includes(subject))
      .sort((a, b) => a.rank - b.rank);
    const rows = Math.ceil(members.length / COLUMNS);
    const canvas = createCanvas(COLUMNS * THUMB_W, Math.max(1, rows) * (THUMB_H + LABEL_H));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#221e3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [index, item] of members.entries()) {
      const x = (index % COLUMNS) * THUMB_W;
      const y = Math.floor(index / COLUMNS) * (THUMB_H + LABEL_H);
      const bytes = previews.get(item.id);
      if (bytes !== undefined) {
        const image = await loadImage(bytes);
        const scale = Math.max(THUMB_W / image.width, THUMB_H / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, THUMB_W, THUMB_H);
        ctx.clip();
        ctx.drawImage(image, x + (THUMB_W - w) / 2, y + (THUMB_H - h) / 2, w, h);
        ctx.restore();
      }
      ctx.fillStyle = '#fffaf0';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(
        `${index + 1}. ${item.kind === 'video' ? '▶ ' : ''}${item.id}`,
        x + 8,
        y + THUMB_H + 22,
      );
      ctx.font = '14px sans-serif';
      ctx.fillText(item.credit.slice(0, 58), x + 8, y + THUMB_H + 44);
    }
    const file = `sheet-${subject.replace(':', '-')}.jpg`;
    writeFileSync(path.join(outDir, file), await canvas.encode('jpeg', 80));
  }
  return rendered;
}
