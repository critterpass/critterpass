/**
 * The one-page review of editorial crowd curves waiting for approval: per destination, the month
 * crowd index fit multiplies a curve by, then per place its facts and a week of hourly bars. It
 * shows exactly the rows `approveCrowdCurves` would approve, so what the founder reads is what
 * goes live.
 */
import type pg from 'pg';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

export interface ReviewPlace {
  readonly name: string;
  readonly category: string;
  readonly crowdHint: string | null;
  readonly bestTime: string | null;
  /** Index 0 = Sunday; missing days are empty. */
  readonly week: readonly (readonly number[] | null)[];
}

export interface ReviewDestination {
  readonly slug: string;
  readonly name: string;
  /** Reviewed crowd index by month (1-12); fit divides by their mean. */
  readonly months: readonly { readonly month: number; readonly crowdIndex: number }[];
  readonly places: readonly ReviewPlace[];
}

export async function readCrowdReview(
  pool: pg.Pool,
  destinations: readonly string[],
): Promise<ReviewDestination[]> {
  const { rows } = await pool.query<{
    slug: string;
    destination: string;
    poi_id: string;
    name: string;
    category: string;
    crowd_hint: string | null;
    best_time: string | null;
    dow: number;
    hourly: number[];
  }>(
    `SELECT d.slug, d.name AS destination, p.id AS poi_id, p.name, p.category,
            p.editorial->>'crowd_hint' AS crowd_hint, p.editorial->>'best_time' AS best_time,
            f.dow, f.hourly
       FROM crowd_forecasts f JOIN pois p ON p.id = f.poi_id
       JOIN destinations d ON d.id = p.destination_id
      WHERE d.slug = ANY($1) AND f.source = 'editorial' AND f.approved_at IS NULL
      ORDER BY d.slug, p.name, f.dow`,
    [destinations],
  );
  const { rows: months } = await pool.query<{ slug: string; month: number; crowd_index: number }>(
    `SELECT d.slug, s.month, s.crowd_index FROM season_months s
       JOIN destinations d ON d.id = s.destination_id
      WHERE d.slug = ANY($1) AND s.reviewed_at IS NOT NULL ORDER BY s.month`,
    [destinations],
  );
  const bySlug = new Map<string, { name: string; places: Map<string, ReviewPlace> }>();
  for (const row of rows) {
    const entry = bySlug.get(row.slug) ?? {
      name: row.destination,
      places: new Map<string, ReviewPlace>(),
    };
    const place: ReviewPlace = entry.places.get(row.poi_id) ?? {
      name: row.name,
      category: row.category,
      crowdHint: row.crowd_hint,
      bestTime: row.best_time,
      week: Array.from({ length: 7 }, () => null),
    };
    (place.week as (readonly number[] | null)[])[row.dow] = row.hourly;
    entry.places.set(row.poi_id, place);
    bySlug.set(row.slug, entry);
  }
  return [...bySlug.entries()].map(([slug, entry]) => ({
    slug,
    name: entry.name,
    months: months
      .filter((row) => row.slug === slug)
      .map((row) => ({ month: row.month, crowdIndex: row.crowd_index })),
    places: [...entry.places.values()],
  }));
}

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char,
  );

const bars = (levels: readonly number[], className: string) =>
  `<span class="${className}">${levels
    .map(
      (level, hour) =>
        `<i style="height:${Math.max(1, level / 4)}px" title="${hour}:00 ${level}"></i>`,
    )
    .join('')}</span>`;

function monthLine(destination: ReviewDestination): string {
  if (destination.months.length === 0)
    return '<p class="note">No reviewed month index: fit uses each curve as is.</p>';
  const mean =
    destination.months.reduce((sum, row) => sum + row.crowdIndex, 0) / destination.months.length;
  const cells = destination.months
    .map(
      (row) =>
        `<td>${MONTHS[row.month - 1] ?? row.month}<br><b>${row.crowdIndex}</b><br>×${Math.min(1.4, Math.max(0.6, row.crowdIndex / mean)).toFixed(2)}</td>`,
    )
    .join('');
  return `<table class="months"><tr>${cells}</tr></table>`;
}

function placeBlock(place: ReviewPlace): string {
  const facts = [
    escape(place.category),
    place.crowdHint === null ? null : `hint: ${escape(place.crowdHint)}`,
    place.bestTime === null ? null : `best time: ${escape(place.bestTime)}`,
  ].filter((part) => part !== null);
  const days = place.week
    .map((levels, dow) =>
      levels === null
        ? ''
        : `<div class="day"><span>${DAY_NAMES[dow]}</span>${bars(levels, 'bars')}</div>`,
    )
    .join('');
  return `<section class="place"><h3>${escape(place.name)}</h3><p>${facts.join(' · ')}</p>${days}</section>`;
}

export function renderCrowdReview(
  destinations: readonly ReviewDestination[],
  batchKey: string,
): string {
  const body = destinations
    .map(
      (destination) =>
        `<h2>${escape(destination.name)} · ${destination.places.length} places</h2>${monthLine(destination)}<div class="grid">${destination.places.map(placeBlock).join('')}</div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Crowd curves ${escape(batchKey)}</title><style>
body{font:12px system-ui;margin:16px;color:#222}h2{margin:16px 0 4px}h3{margin:0;font-size:12px}
p{margin:2px 0 4px;color:#555}.note{color:#a50}.months td{text-align:center;padding:2px 6px;border:1px solid #ddd}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.place{border:1px solid #ddd;border-radius:6px;padding:6px}.day{display:flex;align-items:flex-end;gap:4px}
.day span{width:26px;color:#777}.bars{display:inline-flex;align-items:flex-end;gap:1px;height:26px}
.bars i{display:inline-block;width:6px;background:#3a7}
</style></head><body><h1>Editorial crowd curves · ${escape(batchKey)}</h1>
<p>Usual busyness by hour (00–23), 0–100, waiting for approval. Fit multiplies a curve by its month's factor (×, the index over the year's mean). Copy says "usually busy from …".</p>
${body || '<p>Nothing waiting for approval.</p>'}</body></html>
`;
}
