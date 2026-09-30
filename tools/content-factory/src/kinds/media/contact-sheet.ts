/**
 * Review sheets for a media batch: each candidate's preview saved beside the batch, and one sheet
 * per subject with every candidate numbered by rank and labelled with its id, kind and credit, so
 * a reviewer can pick at a glance before keeping or rejecting items in the ops console.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ContentItem } from '@cp/content';
import { createCanvas, loadImage } from '@napi-rs/canvas';

import type { RenderedItem } from '../types';
import { USER_AGENT } from './http';

const THUMB_W = 480;
const THUMB_H = 300;
const LABEL_H = 54;
const COLUMNS = 4;

async function download(url: string, fetchImpl: typeof fetch): Promise<Buffer | null> {
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

export async function renderMediaSheets(
  items: readonly ContentItem<'media'>[],
  outDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedItem[]> {
  mkdirSync(outDir, { recursive: true });
  const rendered: RenderedItem[] = [];
  const previews = new Map<string, Buffer>();
  for (const item of items) {
    const bytes = await download(item.preview_url, fetchImpl);
    if (bytes === null) continue;
    const file = `${item.id}.jpg`;
    writeFileSync(path.join(outDir, file), bytes);
    previews.set(item.id, bytes);
    rendered.push({ ref: item.id, file });
  }
  const subjects = [...new Set(items.flatMap((item) => item.subjects))];
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
