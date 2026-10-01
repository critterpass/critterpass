/**
 * Explore's front page, apart from any rendering: the destinations that have a guide, in the
 * guides' fixed order (guides added later after them, by name), each marked when it is saved and
 * when its offline pack is on this phone.
 */
import { guideFor, type GuideFacts } from './format';

export interface GuideDestinationRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly guide_slug: string | null;
}

export interface DestinationCard {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly guide: GuideFacts;
  readonly saved: boolean;
  /** The map and search for it are on this phone. */
  readonly offline: boolean;
}

/** The destination slug a region file on disk belongs to (`kyoto-2026.10.1.pmtiles` → `kyoto`). */
export function packSlug(fileName: string, slugs: readonly string[]): string | null {
  if (!fileName.endsWith('.pmtiles')) return null;
  // The longest slug wins, so `da-nang-…` is never read as a pack for `da`.
  const matches = slugs.filter((slug) => fileName.startsWith(`${slug}-`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function destinationCards(
  rows: readonly GuideDestinationRow[],
  guideOrder: readonly string[],
  savedIds: ReadonlySet<string>,
  packFiles: readonly string[],
): DestinationCard[] {
  const slugs = rows.map((row) => row.slug);
  const offline = new Set(packFiles.map((file) => packSlug(file, slugs)));
  const rank = (row: GuideDestinationRow) => {
    const at = guideOrder.indexOf(row.guide_slug ?? '');
    return at === -1 ? guideOrder.length : at;
  };
  return rows
    .filter((row) => !guideFor(row.guide_slug).guest)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      guide: guideFor(row.guide_slug),
      saved: savedIds.has(row.id),
      offline: offline.has(row.slug),
    }));
}
