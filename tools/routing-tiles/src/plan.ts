/**
 * The tile build plan: which Geofabrik extracts to download and which buffered boxes to cut from
 * each, grouped so every extract is downloaded once (eleven Vietnamese destinations share one
 * download). The workflow runs the plan with `osmium extract`, merges the cuts and builds tiles.
 */
import { bufferBbox, osmiumBbox, type Bbox, type BoxesFile } from './boxes';
import { REGION_BY_SLUG, regionUrl } from './regions';

export interface PlannedBox {
  readonly slug: string;
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
}

/** Boxes without a region, which the plan refuses to drop silently. */
export function slugsWithoutRegion(
  file: BoxesFile,
  regions: Readonly<Record<string, string>> = REGION_BY_SLUG,
): string[] {
  return file.boxes.map((box) => box.slug).filter((slug) => regions[slug] === undefined);
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
  const missing = slugsWithoutRegion(file, regions);
  if (missing.length > 0) throw new Error(`no Geofabrik region for ${missing.join(', ')}`);

  const selected = file.boxes.filter((box) => only.length === 0 || only.includes(box.slug));
  const byRegion = new Map<string, PlannedBox[]>();
  for (const box of selected) {
    const region = regions[box.slug];
    if (region === undefined) continue;
    const bbox = bufferBbox(box.bbox);
    const planned = { slug: box.slug, bbox, osmium: osmiumBbox(bbox) };
    byRegion.set(region, [...(byRegion.get(region) ?? []), planned]);
  }
  return {
    regions: [...byRegion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, boxes]) => ({ region, url: regionUrl(region), boxes })),
    slugs: selected.map((box) => box.slug),
  };
}
