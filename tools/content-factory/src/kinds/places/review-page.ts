/**
 * The one-page review of a curated places batch, readable on a phone: the must-sees first (pinned
 * places and landmarks), then every place by category with its editorial lines, the records merged
 * into another place, the pairs a reviewer still has to decide, the lines that make a claim worth
 * checking, and what was left out and why. It
 * is built from the batch's own files, so what the founder reads is what queueing would send.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { loadRelease, parseItems, type ContentItem } from '@cp/content';

import { LEFT_OUT_PLACES } from '../../data/pinned-places';
import { stageFiles } from '../../stages/state';
import { readJson, writeText } from '../../work';
import { unsupportedClaim, type PoiSource } from './pois';

type Poi = ContentItem<'places'>;

export interface PlacesReview {
  readonly batchKey: string;
  readonly items: readonly Poi[];
  /** The places the brief chose, with the must-sees marked. */
  readonly sources: readonly PoiSource[];
  /** What the curator left out and why, one line each. */
  readonly leftOut: readonly string[];
}

const SECTIONS: readonly { readonly title: string; readonly categories: readonly string[] }[] = [
  { title: 'Sights and museums', categories: ['museum', 'other'] },
  { title: 'Nature', categories: ['nature', 'beach'] },
  { title: 'Temples and churches', categories: ['temple_shrine'] },
  { title: 'Food and cafés', categories: ['food'] },
  { title: 'Markets', categories: ['market'] },
  { title: 'Nightlife', categories: ['nightlife'] },
  { title: 'Stays and shopping', categories: ['stay', 'shopping'] },
  { title: 'Practical', categories: ['transit', 'health'] },
];

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char,
  );

const title = (poi: { name: string; name_local: string | null }) =>
  `${escape(poi.name)}${poi.name_local === null ? '' : ` <span class="local">${escape(poi.name_local)}</span>`}`;

function placeBlock(poi: Poi, mustSee: boolean): string {
  const { why_go, best_time, time_needed_min, crowd_hint, etiquette } = poi.editorial;
  const facts = [`Best time: ${best_time}`, `${time_needed_min} min`, `Crowds: ${crowd_hint}`];
  const where = `<a href="https://www.openstreetmap.org/?mlat=${poi.lat}&amp;mlon=${poi.lng}#map=17/${poi.lat}/${poi.lng}">map</a>`;
  return `<section class="place"><h3>${mustSee ? '<b class="star">must-see</b> ' : ''}${title(poi)}</h3>
<p>${escape(why_go)}</p><p class="facts">${facts.map(escape).join(' · ')}</p>${
    etiquette === null ? '' : `<p class="facts">Etiquette: ${escape(etiquette)}</p>`
  }<p class="meta">${escape(poi.category)} · ${poi.tags.map(escape).join(', ')} · ${
    poi.address === null ? '' : `${escape(poi.address)} · `
  }${where} · ${escape(poi.licence.source)}</p></section>`;
}

export function renderPlacesReview(review: PlacesReview): string {
  const byRef = new Map(review.items.map((poi) => [poi.ref, poi]));
  // A must-see merged into another record of the same place makes that record the must-see.
  const mustSee = new Set(
    review.sources
      .filter((s) => s.mustSee === true)
      .map((s) => {
        let ref = s.ref;
        for (let hops = 0; hops < 5; hops += 1) {
          const into = byRef.get(ref)?.merge_into ?? null;
          if (into === null) break;
          ref = into;
        }
        return ref;
      }),
  );
  const visible = review.items.filter((poi) => poi.merge_into === null);
  const byName = (a: Poi, b: Poi) => a.name.localeCompare(b.name, 'vi');
  const first = (a: Poi, b: Poi) =>
    Number(mustSee.has(b.ref)) - Number(mustSee.has(a.ref)) || byName(a, b);
  const sections = SECTIONS.map((section) => ({
    title: section.title,
    places: visible.filter((poi) => section.categories.includes(poi.category)).sort(first),
  })).filter((section) => section.places.length > 0);
  const merged = review.items
    .filter((poi) => poi.merge_into !== null)
    .map((poi) => {
      const into = byRef.get(poi.merge_into ?? '');
      return `<li>${title(poi)} → ${into === undefined ? escape(poi.merge_into ?? '') : title(into)}</li>`;
    });
  const undecided = visible
    .filter((poi) => poi.possible_duplicate_of !== null)
    .map((poi) => {
      const other = byRef.get(poi.possible_duplicate_of ?? '');
      return `<li>${title(poi)} and ${other === undefined ? escape(poi.possible_duplicate_of ?? '') : title(other)}</li>`;
    });
  const claims = visible.flatMap((poi) => {
    const claim = unsupportedClaim(poi);
    return claim === null
      ? []
      : [`<li>${title(poi)}: "${escape(claim)}" in "${escape(poi.editorial.why_go)}"</li>`];
  });
  const untagged = review.sources
    .filter((source) => !byRef.has(source.ref))
    .map((source) => `<li>${escape(source.name)} (${escape(source.category)})</li>`);
  const list = (heading: string, note: string, rows: readonly string[]) =>
    rows.length === 0
      ? ''
      : `<h2>${heading} · ${rows.length}</h2><p>${note}</p><ul>${rows.join('')}</ul>`;
  const destinations = [...new Set(review.items.map((poi) => poi.destination))].join(', ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Places ${escape(review.batchKey)}</title><style>
body{font:15px/1.4 system-ui;margin:0 auto;max-width:720px;padding:12px;color:#222}h1{font-size:20px}
h2{font-size:17px;margin:24px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:15px;margin:0}
p{margin:2px 0}.place{padding:8px 0;border-bottom:1px solid #eee}.local{color:#666;font-weight:400}
.facts{color:#444;font-size:13px}.meta{color:#888;font-size:12px}.star{color:#b45309;font-size:11px;text-transform:uppercase}
li{margin:3px 0}table{border-collapse:collapse}td{padding:2px 12px 2px 0}
</style></head><body><h1>Curated places · ${escape(destinations)} · ${escape(review.batchKey)}</h1>
<p>${visible.length} places, ${merged.length} more merged into another record. A proposal: nothing is queued or published.</p>
<table>${sections.map((s) => `<tr><td>${s.title}</td><td>${s.places.length}</td></tr>`).join('')}</table>
<h2>Must-sees · ${visible.filter((poi) => mustSee.has(poi.ref)).length}</h2>
<ul>${[...visible]
    .filter((poi) => mustSee.has(poi.ref))
    .sort(byName)
    .map((poi) => `<li>${title(poi)} <span class="meta">${escape(poi.category)}</span></li>`)
    .join('')}</ul>
${sections.map((s) => `<h2>${s.title} · ${s.places.length}</h2>${s.places.map((poi) => placeBlock(poi, mustSee.has(poi.ref))).join('')}`).join('')}
${list('Merged', 'Records of one place: publishing redirects the first to the second.', merged)}
${list('Possible duplicates', 'Too close to call: the reviewer decides in the console.', undecided)}
${list('Lines to check', 'A superlative or a date the open data does not back.', claims)}
${list(
  'Left out',
  'Why these are not in the set.',
  review.leftOut.map((line) => `<li>${escape(line)}</li>`),
)}
${list('Chosen but without notes', 'The writer found no taste tag for these, so they stay out.', untagged)}
</body></html>
`;
}

/**
 * Writes the review page of a batch into its work directory from its stage files (or its
 * committed artifact) and returns the path. What was left out is the curator's list for the
 * batch's destinations, then one line per row of `leftOutFile` (notes that name no record).
 */
export function writePlacesReview(batchKey: string, leftOutFile?: string): string {
  const files = stageFiles('places', batchKey);
  const staged = files.items();
  const items =
    staged === undefined
      ? loadRelease(readJson<unknown>(files.paths.artifact), 'places').items
      : parseItems('places', staged);
  const sources = (files.brief()?.units ?? []).flatMap((unit) => unit.input as PoiSource[]);
  const leftOut = [
    ...[...new Set(items.map((poi) => poi.destination))].flatMap((slug) =>
      (LEFT_OUT_PLACES[slug] ?? []).map((place) => `${place.name}: ${place.why}`),
    ),
    ...(leftOutFile !== undefined && existsSync(leftOutFile)
      ? readFileSync(leftOutFile, 'utf8')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : []),
  ];
  const file = path.join(files.paths.dir, 'review.html');
  writeText(file, renderPlacesReview({ batchKey, items, sources, leftOut }));
  return file;
}
