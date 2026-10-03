/**
 * Finds a destination's point on the map from Overture divisions (CDLA-P-2.0): the division in the
 * destination's country whose primary or English name is the destination's name, read from
 * `theme=divisions/type=division` (point geometry, `population`, `subtype`, `names`, checked with
 * `DESCRIBE` on release 2026-09-23.1). Several divisions can share a name (a city and the county
 * around it), so a locality wins over an administrative area, then the larger population.
 */
import {
  DEFAULT_OVERTURE_RELEASE,
  OVERTURE_BUCKET,
  OVERTURE_S3_REGION,
  sqlString,
  withDuckDb,
} from './source-readers';

export interface DivisionTarget {
  readonly key: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2, upper case. */
  readonly country: string;
}

export interface DivisionPoint {
  readonly lat: number;
  readonly lng: number;
  readonly population: number | null;
  readonly subtype: string;
}

export interface DivisionCandidate extends DivisionPoint {
  readonly country: string;
  readonly names: readonly string[];
}

const SUBTYPE_PREFERENCE = [
  'locality',
  'localadmin',
  'county',
  'macrocounty',
  'region',
  'macrohood',
  'neighborhood',
  'borough',
];

/** Lower case, accents and `đ` folded: how a destination name and a division name are compared. */
export function normaliseName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('đ', 'd').trim();
}

function subtypeRank(subtype: string): number {
  const index = SUBTYPE_PREFERENCE.indexOf(subtype);
  return index === -1 ? SUBTYPE_PREFERENCE.length : index;
}

/** The best candidate per target (see file header), or none when no name matches. */
export function pickDivisionPoints(
  targets: readonly DivisionTarget[],
  candidates: readonly DivisionCandidate[],
): Map<string, DivisionPoint> {
  const picked = new Map<string, DivisionPoint>();
  for (const target of targets) {
    const name = normaliseName(target.name);
    const matches = candidates
      .filter((candidate) => candidate.country === target.country)
      .filter((candidate) => candidate.names.some((value) => normaliseName(value) === name))
      .sort(
        (a, b) =>
          subtypeRank(a.subtype) - subtypeRank(b.subtype) ||
          (b.population ?? 0) - (a.population ?? 0),
      );
    const best = matches[0];
    if (best !== undefined) {
      picked.set(target.key, {
        lat: best.lat,
        lng: best.lng,
        population: best.population,
        subtype: best.subtype,
      });
    }
  }
  return picked;
}

/** One scan of the divisions theme for every target's country and name. */
export async function lookupDivisionPoints(
  targets: readonly DivisionTarget[],
): Promise<Map<string, DivisionPoint>> {
  if (targets.length === 0) return new Map();
  const release = process.env['OVERTURE_RELEASE'] ?? DEFAULT_OVERTURE_RELEASE;
  const uri = `s3://${OVERTURE_BUCKET}/release/${release}/theme=divisions/type=division/*`;
  const countries = [...new Set(targets.map((target) => target.country))].map(sqlString).join(', ');
  const names = [...new Set(targets.map((target) => normaliseName(target.name)))]
    .map(sqlString)
    .join(', ');
  const folded = (column: string) => `replace(lower(strip_accents(${column})), 'đ', 'd')`;

  const candidates = await withDuckDb(async (connection) => {
    await connection.run(`SET s3_region='${OVERTURE_S3_REGION}'`);
    const reader = await connection.runAndReadAll(
      `SELECT country, subtype, population, names.primary AS primary_name,
              names.common['en'] AS english_name, bbox.xmin AS lng, bbox.ymin AS lat
       FROM read_parquet(${sqlString(uri)}, hive_partitioning = 1)
       WHERE country IN (${countries})
         AND (list_contains([${names}], ${folded('names.primary')})
           OR list_contains([${names}], ${folded("names.common['en']")}))`,
    );
    return reader.getRowObjectsJson().map((row): DivisionCandidate => ({
      country: typeof row['country'] === 'string' ? row['country'] : '',
      subtype: typeof row['subtype'] === 'string' ? row['subtype'] : '',
      population: typeof row['population'] === 'number' ? row['population'] : null,
      names: [row['primary_name'], row['english_name']].filter(
        (value): value is string => typeof value === 'string',
      ),
      lat: Number(row['lat']),
      lng: Number(row['lng']),
    }));
  });
  return pickDivisionPoints(targets, candidates);
}
