/**
 * The tile build plan: which Geofabrik extracts to download and which buffered boxes to cut from
 * each, grouped so every extract is downloaded once (eleven Vietnamese destinations share one
 * download). The workflow runs the plan with `osmium extract`, merges the cuts and builds tiles.
 */
import { bufferBbox, osmiumBbox, type Bbox, type BoxesFile, type DestinationBox } from './boxes';
import { REGION_BY_SLUG, regionFor, regionUrl } from './regions';

export interface PlannedBox {
  readonly slug: string;
  readonly reason: DestinationBox['reason'];
  readonly bbox: Bbox;
  /** `minLon,minLat,maxLon,maxLat` for `osmium extract --bbox`. */
  readonly osmium: string;
}

export interface PlannedRegion {
  readonly region: string;
  readonly url: string;
  readonly boxes: readonly PlannedBox[];
}

export interface TilePlan {
  readonly regions: readonly PlannedRegion[];
  readonly slugs: readonly string[];
  /** Boxes left out because no Geofabrik extract is known for them. */
  readonly withoutRegion: readonly string[];
}

/** Boxes without a known extract, which the plan leaves out and reports. */
export function slugsWithoutRegion(
  file: BoxesFile,
  regions: Readonly<Record<string, string>> = REGION_BY_SLUG,
): string[] {
  return file.boxes.map((box) => box.slug).filter((slug) => regionFor(slug, regions) === undefined);
}

export function buildPlan(
  file: BoxesFile,
  options: {
    readonly only?: readonly string[];
    readonly regions?: Readonly<Record<string, string>>;
  } = {},
): TilePlan {
  const regions = options.regions ?? REGION_BY_SLUG;
  const only = options.only?.filter((slug) => slug.length > 0) ?? [];
  const unknown = only.filter((slug) => !file.boxes.some((box) => box.slug === slug));
  if (unknown.length > 0) throw new Error(`no box for ${unknown.join(', ')}`);
  const withoutRegion = slugsWithoutRegion(file, regions);
  const asked = only.filter((slug) => withoutRegion.includes(slug));
  if (asked.length > 0) throw new Error(`no Geofabrik region for ${asked.join(', ')}`);

  const selected = file.boxes.filter(
    (box) => (only.length === 0 || only.includes(box.slug)) && !withoutRegion.includes(box.slug),
  );
  const byRegion = new Map<string, PlannedBox[]>();
  for (const box of selected) {
    const region = regionFor(box.slug, regions);
    if (region === undefined) continue;
    const bbox = bufferBbox(box.bbox);
    const planned = { slug: box.slug, reason: box.reason, bbox, osmium: osmiumBbox(bbox) };
    byRegion.set(region, [...(byRegion.get(region) ?? []), planned]);
  }
  return {
    regions: [...byRegion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, boxes]) => ({ region, url: regionUrl(region), boxes })),
    slugs: selected.map((box) => box.slug),
    withoutRegion,
  };
}

/** Whether the plan's boxes differ from a published build's, ignoring order. */
export function boxesChanged(
  plan: TilePlan,
  published: readonly { readonly slug: string; readonly bbox: readonly number[] }[],
): boolean {
  const key = (box: { readonly slug: string; readonly bbox: readonly number[] }) =>
    `${box.slug}:${box.bbox.join(',')}`;
  const planned = plan.regions.flatMap((region) => region.boxes.map(key)).sort();
  const built = published.map(key).sort();
  return planned.length !== built.length || planned.some((entry, index) => entry !== built[index]);
}

/**
 * One drive inside every planned box (`drive` answers a line such as `12 min, 8400 m`, or null when
 * no route was found). Every box's result is logged. A box with no route fails the run, except a
 * day-trip area's: an area can be a valley one road reaches, and one such box must not block every
 * destination's tiles. A plan saved before boxes carried a reason counts as live.
 */
export async function smokePlan(
  plan: TilePlan,
  drive: (bbox: Bbox) => Promise<string | null>,
  log: (line: string) => void = console.log,
): Promise<void> {
  const failures: string[] = [];
  for (const box of plan.regions.flatMap((region) => region.boxes)) {
    const answer = await drive(box.bbox);
    const tolerated = box.reason === 'area';
    if (answer === null && !tolerated) failures.push(box.slug);
    const note = answer === null && tolerated ? ' (an area: not a failure)' : '';
    log(`${box.slug}: ${answer ?? 'no route between inner points'}${note}`);
  }
  if (failures.length > 0) throw new Error(`no route in ${failures.join(', ')}`);
}
