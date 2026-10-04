/**
 * The review pages of a place-photo batch: one self-contained HTML page per destination (the
 * thumbnails are inside the file, so it opens on a phone as sent), listing every proposed photo
 * with the places it stands for, whether it is the place itself, a labelled generic picture or a
 * street-level photo (with its distance, year and the check's reason), and its source, licence and
 * credit. Photos of the place itself come first, the ones to look at
 * twice (a loose name match, or an item far from the place) marked; the places left without a
 * photo are counted by category at the end. Live photos a later look would drop lead the page of
 * the destination that shows them, so the owner can judge them.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { poiRefSubject, type ContentItem } from '@cp/content';
import { createCanvas, loadImage } from '@napi-rs/canvas';

import { GENERIC_TITLE, isGenericTitle } from './generic';
import type { PlaceProposal, SuggestedDrop } from './place-batch';
import type { StreetTally } from './street-batch';

/** What a place batch's brief leaves for its review pages. */
export interface PlaceReview {
  readonly proposals: readonly PlaceProposal[];
  readonly unanswered: readonly string[];
  readonly suggestedDrops?: readonly SuggestedDrop[];
  /** How the places without a photo fared with street-level photos, by destination. */
  readonly street?: Readonly<Record<string, StreetTally>> | null;
}

const THUMB_W = 400;
/** A match to look at twice: its name is not the item's, or the item lies this far away. */
const FAR_M = 1000;

const escape = (text: string) =>
  text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

async function thumbnail(bytes: Buffer): Promise<string | null> {
  try {
    const image = await loadImage(bytes);
    const scale = Math.min(1, THUMB_W / image.width);
    const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return `data:image/jpeg;base64,${(await canvas.encode('jpeg', 70)).toString('base64')}`;
  } catch {
    return null;
  }
}

const STYLE = `body{font:16px/1.4 -apple-system,system-ui,sans-serif;margin:0;padding:12px;background:#221e3a;color:#fffaf0}
h1{font-size:22px;margin:8px 0}h2{font-size:18px;margin:24px 0 8px}
.sum{background:#332d55;border-radius:12px;padding:12px;margin:8px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:#332d55;border-radius:12px;overflow:hidden}
.card img{width:100%;display:block}.card div{padding:10px 12px}
.name{font-weight:700}.meta{font-size:13px;opacity:.85;word-break:break-word}
.tag{display:inline-block;font-size:12px;font-weight:700;border-radius:8px;padding:2px 8px;margin:0 6px 6px 0}
.own{background:#2e7d5b}.generic{background:#8a5a12}.check{background:#b3261e}.street{background:#3b5bb5}
a{color:#ffd27d}table{border-collapse:collapse}td{padding:2px 12px 2px 0}`;

/** How a destination's places without a photo fared with street-level photos, in a sentence. */
export function passRate(tally: StreetTally): string {
  const share = tally.places === 0 ? 0 : Math.round((tally.kept / tally.places) * 100);
  return `Of ${String(tally.places)} places with no other photo, Mapillary has images near ${String(tally.covered)}; ${String(tally.fitting)} have one that fits (6 to 30 m away, the camera pointing at the place); the check looked at ${String(tally.checked)} images and kept a photo for ${String(tally.kept)} places (${String(share)}%).`;
}

export function needsALook(proposal: PlaceProposal): boolean {
  return proposal.match !== null && (proposal.match.score < 1 || proposal.match.distanceM > FAR_M);
}

function card(
  item: ContentItem<'media'>,
  proposals: readonly PlaceProposal[],
  image: string | null,
  drop?: string,
): string {
  const generic = isGenericTitle(item.title);
  const places = proposals
    .map((p) => {
      const match =
        p.match === null
          ? ''
          : ` <span class="meta">= Wikidata “${escape(p.match.label)}”, ${String(p.match.distanceM)} m away</span>`;
      const seen =
        p.street === undefined
          ? ''
          : `<div class="meta">${String(p.street.distanceM)} m from the place · taken ${String(p.street.year)} · the check: ${escape(p.street.reason)}</div>`;
      return `<div class="name">${escape(p.place.name)} <span class="meta">(${escape(p.place.category)})</span>${match}</div>${seen}`;
    })
    .join('');
  const street = item.source === 'mapillary';
  const kind = generic
    ? `<span class="tag generic">Generic, labelled “Not this place”: ${escape((item.title ?? '').slice(GENERIC_TITLE.length))}</span>`
    : street
      ? '<span class="tag street">Street view (Mapillary)</span>'
      : '<span class="tag own">The place itself</span>';
  const check = proposals.some(needsALook) ? '<span class="tag check">Look twice</span>' : '';
  const why =
    drop === undefined ? '' : `<span class="tag check">Suggested to drop: ${escape(drop)}</span>`;
  return `<div class="card">${image === null ? '' : `<img loading="lazy" alt="" src="${image}">`}<div>
${kind}${check}${why}${places}
<div class="meta">Source: <a href="${escape(item.source_url)}">${escape(item.source)}</a> · Licence: <a href="${escape(item.licence_url)}">${escape(item.licence)}</a></div>
<div class="meta">Credit: ${escape(item.credit)}</div>
<div class="meta">${escape(item.id)}</div></div></div>`;
}

/** Writes `places-<destination>.html` into `outDir` and returns the file names. */
export async function renderPlacePages(
  items: readonly ContentItem<'media'>[],
  { proposals, unanswered, suggestedDrops = [], street = null }: PlaceReview,
  previews: ReadonlyMap<string, Buffer>,
  outDir: string,
  batchKey: string,
): Promise<string[]> {
  const files: string[] = [];
  const thinner =
    unanswered.length === 0
      ? ''
      : `<div class="sum meta">Searches a source did not answer (fewer generic photos to choose from): ${unanswered.map(escape).join(' · ')}</div>`;
  for (const destination of [...new Set(proposals.map((p) => p.place.destination))]) {
    const local = proposals.filter((p) => p.place.destination === destination);
    const bySubject = new Map(local.map((p) => [poiRefSubject(p.place.ref), p]));
    const count = (outcome: string) => local.filter((p) => p.outcome === outcome).length;
    const cards: Record<'own' | 'generic' | 'drop' | 'street', string[]> = {
      own: [],
      generic: [],
      drop: [],
      street: [],
    };
    const drops = new Map(
      suggestedDrops
        .filter((drop) => drop.destinations.includes(destination))
        .map((drop) => [drop.id, drop.reason]),
    );
    const shown = items
      .map((item) => ({
        item,
        places: item.subjects.flatMap((subject) => bySubject.get(subject) ?? []),
      }))
      .filter(({ places }) => places.length > 0)
      // The ones to look at twice lead their section.
      .sort((a, b) => Number(b.places.some(needsALook)) - Number(a.places.some(needsALook)));
    for (const { item, places } of shown) {
      const bytes = previews.get(item.id);
      const image = bytes === undefined ? null : await thumbnail(bytes);
      const section = isGenericTitle(item.title)
        ? 'generic'
        : item.source === 'mapillary'
          ? 'street'
          : 'own';
      cards[section].push(card(item, places, image));
      const drop = drops.get(item.id);
      if (drop !== undefined) cards.drop.push(card(item, places, image, drop));
    }
    const none = new Map<string, string[]>();
    for (const p of local.filter((l) => l.outcome === 'none')) {
      none.set(p.place.category, [...(none.get(p.place.category) ?? []), p.place.name]);
    }
    const noneRows = [...none.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(
        ([category, names]) =>
          `<details><summary>${escape(category)}: ${String(names.length)}</summary><div class="meta">${names.map(escape).join(' · ')}</div></details>`,
      )
      .join('');
    const tally = street?.[destination];
    const streetRow =
      tally === undefined
        ? ''
        : `<tr><td>Street view (Mapillary, checked)</td><td>${String(count('street'))} places, ${String(cards.street.length)} photos</td></tr>`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Place photos · ${escape(destination)}</title>
<style>${STYLE}</style></head><body>
<h1>Place photos · ${escape(destination)}</h1>
<div class="sum">Batch ${escape(batchKey)} · ${String(local.length)} curated places<table>
<tr><td>The place itself (Wikimedia Commons)</td><td>${String(count('own'))} places, ${String(cards.own.length)} photos</td></tr>
<tr><td>Generic, labelled “Not this place” (Pexels, Pixabay)</td><td>${String(count('generic'))} places, ${String(cards.generic.length)} photos</td></tr>
${streetRow}
<tr><td>No photo (the category doodle)</td><td>${String(count('none'))} places</td></tr></table></div>
${thinner}${
      cards.drop.length === 0
        ? ''
        : `\n<h2>Live today, suggested to drop</h2><div class="sum meta">These ${String(cards.drop.length)} photos are in the live release and in this batch. They stay unless you say to drop them.</div><div class="grid">${cards.drop.join('\n')}</div>`
    }
<h2>The place itself</h2><div class="grid">${cards.own.join('\n')}</div>
<h2>Generic, labelled “Not this place”</h2><div class="grid">${cards.generic.join('\n')}</div>
${
  tally === undefined
    ? ''
    : `<h2>Street view (Mapillary), for places with nothing else</h2><div class="sum meta">${passRate(tally)}</div><div class="grid">${cards.street.join('\n')}</div>`
}
<h2>No photo</h2><div class="sum">${noneRows}</div>
</body></html>`;
    const file = `places-${destination}.html`;
    writeFileSync(path.join(outDir, file), html);
    files.push(file);
  }
  return files;
}
