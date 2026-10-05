/**
 * The one-page review of a places corrections batch, readable on a phone: per destination the
 * counts and the must-sees, then every corrected place with what it was, what it becomes, why,
 * the map object its point was checked against and the records that fold into it.
 */
import {
  metresBetween,
  type BeforeRow,
  type CorrectionsFile,
  type PlaceCorrection,
} from './corrections';
import { correctionCounts, FAR_M } from './corrections-counts';

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char,
  );

const distance = (metres: number) =>
  metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;

const mapLink = (point: { lat: number; lng: number }, label: string) =>
  `<a href="https://www.openstreetmap.org/?mlat=${point.lat}&amp;mlon=${point.lng}#map=16/${point.lat}/${point.lng}">${label}</a>`;

const point = (row: { lat: number; lng: number }) => `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`;

/** The revised lines of a note, with the claim they answer and its source. */
function noteLines(place: PlaceCorrection, kept: BeforeRow): string {
  const revised = Object.entries(place.revise ?? {}).map(([line, text]) => {
    const key = line as keyof NonNullable<PlaceCorrection['revise']>;
    const shown = (value: string | number | null | undefined) =>
      escape(typeof value === 'number' ? `${value} min` : (value ?? ''));
    return `<p><span class="k">${key === 'time_needed_min' ? 'Visit' : 'Note'}</span> <s>${shown(kept.item?.editorial[key])}</s> → ${shown(text)}</p>`;
  });
  const claim =
    place.claim === undefined
      ? ''
      : `<p><span class="k">Claim</span> “${escape(place.claim.said)}”: ${escape(place.claim.finding)} (<a href="${escape(place.claim.source)}">source</a>)</p>`;
  const added =
    place.note === undefined || kept.curated
      ? ''
      : `<p><span class="k">Note</span> ${escape(place.note.why_go)}</p>
<p><span class="k">Visit</span> ${escape(place.note.best_time)} · ${place.note.time_needed_min} min · ${escape(place.note.crowd_hint)}${
          place.note.etiquette === null ? '' : ` · ${escape(place.note.etiquette)}`
        }</p>`;
  return `${claim}${revised.join('')}${added}${translations(place, kept)}`;
}

const TEXT_LINES = ['why_go', 'best_time', 'crowd_hint', 'etiquette'] as const;

/** Each translated line beside the English it was written from. */
function translations(place: PlaceCorrection, kept: BeforeRow): string {
  return Object.entries(place.i18n ?? {})
    .map(([locale, text]) => {
      const english = { ...kept.item?.editorial, ...place.revise };
      const rows = TEXT_LINES.filter((line) => text[line] !== undefined).map(
        (line) =>
          `<tr><td class="meta">${line}</td><td>${escape(english[line] ?? '')}</td><td>${escape(text[line] ?? '')}</td></tr>`,
      );
      return `<table class="tr"><tr><th></th><th>English</th><th>${escape(locale)}</th></tr>${rows.join('')}</table>`;
    })
    .join('');
}

function placeBlock(place: PlaceCorrection, rows: ReadonlyMap<string, BeforeRow>): string {
  const kept = rows.get(place.keep);
  if (kept === undefined) throw new Error(`${place.keep} is not in the snapshot`);
  const name = place.name ?? kept.name;
  const local = place.name_local === undefined ? kept.name_local : place.name_local;
  const category = place.category ?? kept.category;
  const mustSee = place.must_see ?? kept.must_see;
  const state = (curated: boolean, flag: boolean) =>
    `${curated ? 'recommended' : 'not recommended'}${flag ? ', must-see' : ''}`;
  const badges = [
    place.essential === true ? '<b class="star">essential</b>' : '',
    place.must_see === true ? '<b class="star">must-see</b>' : '',
    place.essential === false ? '<b class="quiet">gives up essential</b>' : '',
    kept.id === null ? '<b class="new">new place</b>' : '',
    place.stated && !kept.curated ? '<b class="new">joins the recommended set</b>' : '',
    place.stated ? '' : '<b class="quiet">kept record not stated</b>',
  ].join(' ');
  const after = place.stated
    ? `${escape(name)}${local === null ? '' : ` (${escape(local)})`} · ${escape(category)} · ${state(true, mustSee)}`
    : 'unchanged (stays outside the recommended set; only its duplicates are stated)';
  const checked = place.checked;
  const where =
    checked === undefined
      ? 'not re-checked: the point is not touched'
      : `checked against ${escape(checked.source)}, ${
          checked.off_m > FAR_M
            ? `<b class="warn">${distance(checked.off_m)} from it</b>`
            : `${distance(checked.off_m)} from it`
        }`;
  const merged = place.merge.map(({ ref }) => {
    const row = rows.get(ref);
    if (row === undefined) throw new Error(`${ref} is not in the snapshot`);
    const away = metresBetween(row, kept);
    return `<tr><td>${escape(row.name)}</td><td>${escape(row.category)}</td><td>${
      row.merged_into !== null ? 'already merged' : state(row.curated, row.must_see)
    }</td><td>${mapLink(row, point(row))}</td><td${away > FAR_M ? ' class="warn"' : ''}>${distance(away)}</td><td class="id">${escape(row.id ?? '')}</td></tr>`;
  });
  return `<section class="place"><h3>${escape(name)} ${badges}</h3>
<p><span class="k">Before</span> ${
    kept.id === null
      ? 'not in the catalogue: publishing creates the record at this point, and the ingest of the widened box lands on the same record'
      : `${escape(kept.name)}${kept.name_local === null ? '' : ` (${escape(kept.name_local)})`} · ${escape(kept.category)} · ${state(kept.curated, kept.must_see)}`
  }</p>
<p><span class="k">After</span> ${after}</p>
<p><span class="k">Why</span> ${escape(place.why)}</p>${noteLines(place, kept)}
<p><span class="k">Point</span> ${mapLink(kept, point(kept))} · ${where}</p>
<p class="id">${escape(place.keep)} · ${escape(kept.id ?? 'no row yet')}</p>${
    merged.length === 0
      ? ''
      : `<table><tr><th>Merged into it</th><th>Kind</th><th>Was</th><th>Stored point</th><th>From the kept point</th><th>Row</th></tr>${merged.join('')}</table>`
  }</section>`;
}

export function renderCorrectionsReview(
  file: CorrectionsFile,
  before: readonly BeforeRow[],
): string {
  const rows = new Map(before.map((row) => [row.ref, row]));
  const destinations = [
    ...new Set([...file.places, ...file.hidden].map((entry) => entry.destination)),
  ];
  const sections = destinations.map((destination) => {
    const places = file.places.filter((place) => place.destination === destination);
    const counts = correctionCounts(places, before);
    const mustSees = places
      .filter((place) => place.must_see === true)
      .map((place) => {
        const kept = rows.get(place.keep);
        return `<li>${escape(place.name ?? kept?.name ?? place.stored_name)} <span class="meta">${escape(place.category ?? kept?.category ?? '')}</span></li>`;
      });
    const essentials = places
      .filter((place) => place.essential === true)
      .map((place) => {
        const kept = rows.get(place.keep);
        return `<li>${escape(place.name ?? kept?.name ?? place.stored_name)} <span class="meta">${escape(place.category ?? kept?.category ?? '')}</span></li>`;
      });
    const hidden = file.hidden
      .filter((entry) => entry.destination === destination)
      .map((entry) => {
        const row = rows.get(entry.ref);
        return `<li><b>${escape(entry.stored_name)}</b>: ${escape(entry.why)} ${row === undefined ? '' : mapLink(row, point(row))} <span class="id">${escape(row?.id ?? entry.ref)}</span></li>`;
      });
    const noted = file.left_alone.filter((entry) => entry.destination === destination);
    const leftAlone = noted
      .filter((entry) => entry.hide === undefined)
      .map((entry) => `<li><b>${escape(entry.name)}</b>: ${escape(entry.why)}</li>`);
    const toHide = noted
      .filter((entry) => entry.hide !== undefined)
      .map(
        (entry) =>
          `<li><b>${escape(entry.name)}</b>: ${escape(entry.why)} <span class="id">${escape(entry.hide ?? '')}</span></li>`,
      );
    return `<h2>${escape(destination)}</h2>
<table class="counts"><tr><td>Places corrected</td><td>${counts.places}</td></tr>
<tr><td>Records merged into another</td><td>${counts.merges} (${counts.recommendedMerges} of them recommended until now)</td></tr>
<tr><td>Kinds corrected</td><td>${counts.kindChanges}</td></tr><tr><td>Names corrected</td><td>${counts.renames}</td></tr>
<tr><td>Places that had a recommended record over 2 km off</td><td>${counts.movedPoints}</td></tr>
<tr><td>Records that join the recommended set</td><td>${counts.added}</td></tr>
<tr><td>Must-sees this batch flags or restates</td><td>${counts.mustSees}</td></tr>
<tr><td>Essentials</td><td>${counts.essentials}</td></tr>
<tr><td>Records hidden</td><td>${hidden.length}</td></tr></table>
${essentials.length === 0 ? '' : `<h3>Essentials · ${essentials.length}</h3><p class="meta">The places a first visit is built around (<code>editorial.essential</code>); each is a must-see too.</p><ul class="cols">${essentials.join('')}</ul>`}
<h3>Must-sees this batch flags or restates · ${mustSees.length}</h3><ul class="cols">${mustSees.join('')}</ul>
${places.map((place) => placeBlock(place, rows)).join('')}
${hidden.length === 0 ? '' : `<h3>Hidden by this batch · ${hidden.length}</h3><p class="meta">Each is pinned far from the place it names and the catalogue has no record at the place to merge it into. Publishing sets the record to hidden and takes it out of the recommended set; it refuses if a trip points at one.</p><ul>${hidden.join('')}</ul>`}
${toHide.length === 0 ? '' : `<h3>Recommended records to hide in the console · ${toHide.length}</h3><p class="meta">Pinned far from the place they name, with no record at the place to merge them into (it lies outside the destination's map, or the catalogue has none). A release cannot take a record out of the set.</p><ul>${toHide.join('')}</ul>`}
${leftAlone.length === 0 ? '' : `<h3>Found and left alone · ${leftAlone.length}</h3><ul>${leftAlone.join('')}</ul>`}`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Place corrections ${escape(file.batch)}</title><style>
body{font:15px/1.4 system-ui;margin:0 auto;max-width:860px;padding:12px;color:#222}h1{font-size:20px}
h2{font-size:18px;margin:28px 0 6px;border-bottom:2px solid #222;padding-bottom:4px}h3{font-size:15px;margin:12px 0 4px}
p{margin:2px 0}.place{padding:8px 0;border-bottom:1px solid #ddd}.k{display:inline-block;min-width:52px;color:#666;font-size:12px;text-transform:uppercase}
.meta{color:#888;font-size:12px}.id{color:#999;font:11px ui-monospace,monospace}.star{color:#b45309;font-size:11px;text-transform:uppercase}
.new{color:#047857;font-size:11px;text-transform:uppercase}.quiet{color:#666;font-size:11px;text-transform:uppercase}.warn{color:#b91c1c}
table{border-collapse:collapse;margin:6px 0;font-size:13px}td,th{padding:2px 10px 2px 0;text-align:left;vertical-align:top}th{color:#666;font-weight:500}
.cols{columns:2}li{margin:3px 0}.tr td{width:48%}
</style></head><body><h1>Place corrections · ${escape(file.batch)}</h1>
<p>A proposal: nothing is queued or published. Points were checked on ${escape(file.checked_at.slice(0, 10))} against OpenStreetMap (through photon.komoot.io).</p>
<p>Publishing never moves the point of an existing record. A place pinned in the wrong spot is corrected by keeping the record that sits at the real place and merging the wrong one into it; a merged record leaves search, suggestions and drafts. A stop of an existing trip that points at a merged record keeps pointing at it.</p>
${sections.join('')}
</body></html>
`;
}
