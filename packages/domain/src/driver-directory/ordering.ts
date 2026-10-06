/**
 * Directory order (6e-1): the Wilson lower bound of crews who loved him over crews who rated him,
 * then trips with crews, then the longest listed. The input carries crew answers and dates only, so
 * nothing paid, sponsored or commission-bearing can move a driver up the list.
 */

export interface DirectoryRankInput {
  readonly id: string;
  readonly crews_loved: number;
  readonly crews_rated: number;
  readonly trips: number;
  /** ISO timestamp. */
  readonly listed_at: string;
}

/** z for a 95 % interval. */
const Z = 1.959964;

export function wilsonLowerBound(positive: number, total: number, z: number = Z): number {
  if (total <= 0) return 0;
  const p = positive / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return (centre - margin) / (1 + z2 / total);
}

export function compareDirectoryRank(a: DirectoryRankInput, b: DirectoryRankInput): number {
  const score =
    wilsonLowerBound(b.crews_loved, b.crews_rated) - wilsonLowerBound(a.crews_loved, a.crews_rated);
  if (score !== 0) return score;
  if (a.trips !== b.trips) return b.trips - a.trips;
  const listed = Date.parse(a.listed_at) - Date.parse(b.listed_at);
  if (listed !== 0) return listed;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Sorts a copy; only the rank fields are read. */
export function rankDirectory<T extends DirectoryRankInput>(listings: readonly T[]): T[] {
  return [...listings].sort((a, b) => compareDirectoryRank(pickRank(a), pickRank(b)));
}

function pickRank(listing: DirectoryRankInput): DirectoryRankInput {
  return {
    id: listing.id,
    crews_loved: listing.crews_loved,
    crews_rated: listing.crews_rated,
    trips: listing.trips,
    listed_at: listing.listed_at,
  };
}
