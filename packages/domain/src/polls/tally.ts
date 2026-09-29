/**
 * Tallies: the per-option counts every surface draws (bars, sticker avatars, the tally strip, the
 * widget stamp), from the current ballots. Only eligible voters count, and a ballot on an option
 * knocked out of the board no longer counts; the bar denominator is the eligible voter count.
 */

export interface TallyOption {
  readonly id: string;
  readonly position: number;
  /** Knocked out when the board advanced to the final. */
  readonly eliminated?: boolean;
}

export interface TallyBallot {
  readonly optionId: string;
  readonly userId: string;
  readonly castAt: Date;
}

export interface OptionTally {
  readonly optionId: string;
  readonly count: number;
  /** Voters in the order they cast (earliest first). */
  readonly voterIds: readonly string[];
}

export interface Tally {
  readonly options: readonly OptionTally[];
  /** Ballots counted (eligible voters on live options). */
  readonly total: number;
  readonly eligibleCount: number;
  readonly pendingVoterIds: readonly string[];
  /** The options with the highest count, by position; empty while nobody has voted. */
  readonly leaderIds: readonly string[];
  readonly allVoted: boolean;
}

export interface TallyInput {
  readonly options: readonly TallyOption[];
  readonly ballots: readonly TallyBallot[];
  readonly eligibleVoterIds: readonly string[];
}

export function liveOptions(options: readonly TallyOption[]): TallyOption[] {
  return options
    .filter((option) => option.eliminated !== true)
    .sort((a, b) => a.position - b.position);
}

export function computeTally(input: TallyInput): Tally {
  const eligible = new Set(input.eligibleVoterIds);
  const live = liveOptions(input.options);
  const liveIds = new Set(live.map((option) => option.id));
  const counted = input.ballots
    .filter((ballot) => eligible.has(ballot.userId) && liveIds.has(ballot.optionId))
    .sort((a, b) => a.castAt.getTime() - b.castAt.getTime() || (a.userId < b.userId ? -1 : 1));
  const voters = new Map<string, string[]>(live.map((option) => [option.id, []]));
  const voted = new Set<string>();
  for (const ballot of counted) {
    if (voted.has(ballot.userId)) continue;
    voted.add(ballot.userId);
    voters.get(ballot.optionId)?.push(ballot.userId);
  }
  const options = live.map((option) => {
    const ids = voters.get(option.id) ?? [];
    return { optionId: option.id, count: ids.length, voterIds: ids };
  });
  const top = Math.max(0, ...options.map((option) => option.count));
  const pendingVoterIds = [...eligible].filter((uid) => !voted.has(uid)).sort();
  return {
    options,
    total: voted.size,
    eligibleCount: eligible.size,
    pendingVoterIds,
    leaderIds: top === 0 ? [] : options.filter((o) => o.count === top).map((o) => o.optionId),
    allVoted: eligible.size > 0 && pendingVoterIds.length === 0,
  };
}

/** The single leading option, or `null` when nobody leads outright. */
export function soleLeader(tally: Tally): string | null {
  return tally.leaderIds.length === 1 ? (tally.leaderIds[0] ?? null) : null;
}

/** The wire shape of `ballot.upserted` / `poll.tally` hints: counts only, keyed by option. */
export function tallyWire(tally: Tally): {
  readonly option_tallies: Readonly<Record<string, number>>;
  readonly pending_count: number;
  readonly eligible_count: number;
} {
  return {
    option_tallies: Object.fromEntries(tally.options.map((o) => [o.optionId, o.count])),
    pending_count: tally.pendingVoterIds.length,
    eligible_count: tally.eligibleCount,
  };
}
