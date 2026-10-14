/**
 * Which row each ranked candidate lands on. An existing row is found by QID, GeoNames id, the slug
 * the candidate would take, or the same folded name in the same country (the hand-seeded and
 * critter rows hold the country's English name, not its code). A found row is enriched and keeps
 * its slug; any other candidate becomes a new base row with a fresh slug (`-2`, `-3` on a clash;
 * a slug once taken is never offered again, since rows are never removed). Rows a candidate holds
 * the QID or GeoNames id of are claimed first, so a namesake cannot take them. A candidate that is
 * the twin of a critter row (`isTwin`: an alias such as Sài Gòn for Thành phố Hồ Chí Minh, a
 * critter row with no country code or centre yet) enriches that row, and a second twin of an
 * already-claimed critter row is dropped instead of becoming a duplicate base row.
 */
import { baseSlug, foldName, foldedNames, type BaseCandidate } from './base-set';
import { isTwin, placeNames, type TwinPlace } from './critter-twins';

export interface ExistingDestination {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly countryCode: string | null;
  readonly origin: 'seed' | 'critter' | 'area' | 'base';
  readonly qid: string | null;
  readonly geonamesId: number | null;
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly names?: Readonly<Record<string, string>>;
}

export interface PlannedRow<C extends BaseCandidate> {
  readonly candidate: C;
  readonly slug: string;
  /** The row it enriches, or null for a new base row. */
  readonly existing: ExistingDestination | null;
}

export function planUpsert<C extends BaseCandidate>(
  candidates: readonly C[],
  existing: readonly ExistingDestination[],
  countryNames: ReadonlyMap<string, string>,
): PlannedRow<C>[] {
  const byQid = new Map<string, ExistingDestination>();
  const byGeonames = new Map<number, ExistingDestination>();
  const bySlug = new Map<string, ExistingDestination>();
  const byName = new Map<string, ExistingDestination>();
  for (const row of existing) {
    if (row.qid !== null) byQid.set(row.qid, row);
    if (row.geonamesId !== null) byGeonames.set(row.geonamesId, row);
    bySlug.set(row.slug, row);
    const country = row.countryCode ?? row.country;
    if (country !== null) byName.set(`${foldName(country)}|${foldName(row.name)}`, row);
  }
  const used = new Set<string>();
  const slugs = new Set(existing.map((row) => row.slug));
  const planned: PlannedRow<C>[] = [];
  const fresh: C[] = [];
  // Rows claimed by id before any name lookup runs.
  const byId = new Map<C, ExistingDestination>();
  for (const candidate of candidates) {
    const row =
      (candidate.qid === null ? undefined : byQid.get(candidate.qid)) ??
      (candidate.geonamesId === null ? undefined : byGeonames.get(candidate.geonamesId));
    if (row !== undefined && !used.has(row.id)) {
      used.add(row.id);
      byId.set(candidate, row);
    }
  }
  const critters = existing.filter((row) => row.origin === 'critter');
  // A claimed critter row without a centre compares by its claimant's centre.
  const claimedAt = new Map<string, { lat: number; lng: number }>();
  const twinOf = (candidate: C) => {
    const place: TwinPlace = {
      names: placeNames(candidate.name, candidate.names),
      countryCode: candidate.countryCode,
      country: countryNames.get(candidate.countryCode) ?? null,
      lat: candidate.lat,
      lng: candidate.lng,
    };
    return critters.find((row) => {
      const at = claimedAt.get(row.id);
      return isTwin(
        {
          slug: row.slug,
          names: placeNames(row.name, row.names ?? null),
          countryCode: row.countryCode,
          country: row.country,
          lat: row.lat ?? at?.lat ?? null,
          lng: row.lng ?? at?.lng ?? null,
        },
        place,
      );
    });
  };
  for (const candidate of candidates) {
    const countryKeys = [candidate.countryCode, countryNames.get(candidate.countryCode)];
    const nameHit = [...foldedNames(candidate)].flatMap((name) =>
      countryKeys.flatMap((country) =>
        country === undefined ? [] : [byName.get(`${foldName(country)}|${name}`)],
      ),
    );
    let found =
      byId.get(candidate) ??
      [bySlug.get(baseSlug(candidate.countryCode, candidate.name)), ...nameHit].find(
        (row) => row !== undefined && !used.has(row.id),
      );
    if (found === undefined || found.origin === 'base') {
      const twin = twinOf(candidate);
      if (twin !== undefined && used.has(twin.id)) continue;
      if (twin !== undefined) found = twin;
    }
    if (found === undefined) {
      fresh.push(candidate);
      continue;
    }
    used.add(found.id);
    if (found.origin === 'critter') {
      claimedAt.set(found.id, { lat: candidate.lat, lng: candidate.lng });
    }
    // An id another row already holds stays with that row.
    const qidOwner = candidate.qid === null ? undefined : byQid.get(candidate.qid);
    const geoOwner =
      candidate.geonamesId === null ? undefined : byGeonames.get(candidate.geonamesId);
    planned.push({
      candidate: {
        ...candidate,
        qid: qidOwner === undefined || qidOwner === found ? candidate.qid : found.qid,
        geonamesId:
          geoOwner === undefined || geoOwner === found ? candidate.geonamesId : found.geonamesId,
      },
      slug: found.slug,
      existing: found,
    });
  }
  for (const candidate of fresh) {
    const base = baseSlug(candidate.countryCode, candidate.name);
    let slug = base;
    for (let n = 2; slugs.has(slug); n += 1) slug = `${base}-${n}`;
    slugs.add(slug);
    const held = (id: string | null, owners: Map<string, ExistingDestination>) =>
      id !== null && owners.has(id);
    const geoHeld = candidate.geonamesId !== null && byGeonames.has(candidate.geonamesId);
    planned.push({
      candidate: {
        ...candidate,
        qid: held(candidate.qid, byQid) ? null : candidate.qid,
        geonamesId: geoHeld ? null : candidate.geonamesId,
      },
      slug,
      existing: null,
    });
  }
  return planned;
}
