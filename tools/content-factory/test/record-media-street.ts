// Records the street-photo tests' fixtures from Mapillary and the model:
// `railway run --service api --environment staging -- tsx test/record-media-street.ts`
// (needs MAPILLARY_TOKEN and the model gateway's variables). Mapillary's answers for the church
// are kept in the source cache format under test/fixtures/media-street, cut down to the images
// that fit, their neighbours in the sequence and a dozen others, with the expiring file links
// replaced; the model's
// two answers are kept in the replay format, the photo left out of the saved request.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway, loadGatewayEnv } from '@cp/ai';

import { streetCandidates, streetImagesNear } from '../src/kinds/media/mapillary';
import { checkCopy, checkPhoto } from '../src/kinds/media/photo-check';
import { BLESSED_SACRAMENT, RIVERSIDE_GRILL, STREET_NOW } from './media-street-fixture';

const token = process.env['MAPILLARY_TOKEN'];
if (!token) throw new Error('set MAPILLARY_TOKEN');
const fixtures = path.join(import.meta.dirname, 'fixtures');
const cacheDir = path.join(fixtures, 'media-street');
rmSync(cacheDir, { recursive: true, force: true });
const kept = { fetch, cacheDir, now: () => STREET_NOW };
const scratch = { ...kept, cacheDir: mkdtempSync(path.join(os.tmpdir(), 'street-cache-')) };
const fitting = new Set<string>();

let recorded = 0;
const names = ['deepseek-photo-check-keep', 'deepseek-photo-check-other-name'];
const recording: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const body: unknown = await response.clone().json();
  const name = names[recorded];
  recorded += 1;
  if (name !== undefined) {
    writeFileSync(
      path.join(fixtures, `${name}.json`),
      `${JSON.stringify({ source: `model ${new Date().toISOString().slice(0, 10)}`, request: null, response: { status: response.status, body } }, null, 2)}\n`,
    );
  }
  return response;
};
const check = {
  gateway: createGateway({ ...loadGatewayEnv(), fetch: recording }),
  cacheDir: mkdtempSync(path.join(os.tmpdir(), 'street-record-')),
};

for (const [place, imageId] of [
  [BLESSED_SACRAMENT, '1018975135577358'],
  [RIVERSIDE_GRILL, '4703989716294526'],
] as const) {
  const http = place === BLESSED_SACRAMENT ? kept : scratch;
  const images = await streetImagesNear(http, token, place);
  const candidates = streetCandidates(place, images);
  if (http === kept) {
    for (const c of candidates) fitting.add(c.image.id);
  }
  const candidate = candidates.find((c) => c.image.id === imageId);
  console.log(place.name, images.length, 'images;', candidates.map((c) => c.image.id).join(' '));
  if (candidate === undefined) throw new Error(`${imageId} is no longer a candidate`);
  const copy = await checkCopy(
    Buffer.from(await (await fetch(candidate.image.preview)).arrayBuffer()),
  );
  if (copy === null) throw new Error('the image could not be read');
  const verdict = await checkPhoto(check, imageId, copy, place);
  console.log(' ', verdict.accepted, JSON.stringify(verdict.verdict));
}

// The file links are signed and expire within hours: a stable stand-in keeps the fixture quiet.
const OTHERS = 12;
const NEIGHBOURS = 2;
for (const file of readdirSync(cacheDir)) {
  const saved = JSON.parse(readFileSync(path.join(cacheDir, file), 'utf8')) as {
    body: { data: { id: string; sequence?: string; captured_at?: number }[] };
  };
  const frames = [...saved.body.data].sort(
    (a, b) =>
      (a.sequence ?? '').localeCompare(b.sequence ?? '') ||
      (a.captured_at ?? 0) - (b.captured_at ?? 0),
  );
  const near = new Set<string>();
  frames.forEach((frame, at) => {
    if (!fitting.has(frame.id)) return;
    for (const other of frames.slice(Math.max(0, at - NEIGHBOURS), at + NEIGHBOURS + 1)) {
      if (other.sequence === frame.sequence) near.add(other.id);
    }
  });
  let others = 0;
  saved.body.data = saved.body.data.filter((image) => {
    if (near.has(image.id)) return true;
    others += 1;
    return others <= OTHERS;
  });
  const text = JSON.stringify(saved, null, 2).replace(
    /"(thumb_\d+_url)": "https:[^"]+"/gu,
    '"$1": "https://scontent.example.fbcdn.net/m1/v/t6/expired.jpg"',
  );
  writeFileSync(path.join(cacheDir, file), `${text}\n`);
}
