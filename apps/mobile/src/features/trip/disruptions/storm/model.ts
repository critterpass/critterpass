/**
 * The storm screen (3k-8) worked out from synced rows: the storm disruption (its facts and the
 * planner's options), its decision poll and the ballots so far. Who may vote, what the signed-in
 * member voted, how the count stands, and, once decided, what happens to a booked seat (the
 * original booker confirms and pays the new date; the old booking goes only after that). Pure.
 */
/* eslint-disable lingui/no-unlocalized-strings -- option ids and states, never copy. */
export type StormOptionId = 'swap' | 'keep' | 'skip';
export type SeatState =
  | 'awaiting_booker_payment'
  | 'seats_not_confirmed'
  | 'moved'
  | 'cancel_failed'
  | 'change_on_partner'
  | 'booker_cancel';

export interface StormOptionData {
  readonly id: StormOptionId;
  readonly label: string;
  readonly recommended: boolean;
  readonly per_person_minor: number | null;
  readonly currency: string | null;
  readonly supplier: string;
  readonly facts: Readonly<Record<string, string | number>>;
  readonly note: string | null;
  readonly poll_option_id: string;
  readonly swap_day: string | null;
  /** The stormy day itself (the disruption's), set by `stormModel` so copy can name both days. */
  readonly storm_day?: string | null;
  readonly supplier_move?: { readonly state?: string; readonly new_date?: string };
}

export interface StormRowData {
  readonly id: string;
  readonly trip_id: string;
  readonly status: string;
  readonly cause: string;
  readonly title: string;
  readonly summary: string;
  readonly facts: string | null;
  readonly options: string | null;
  readonly source_snapshot: string | null;
  readonly chosen_option_id: string | null;
  readonly i18n: string | null;
}

export interface PollRowData {
  readonly id: string;
  readonly status: string;
  readonly eligible_voter_ids: string | null;
  readonly closes_at: string | null;
  readonly winner_option_id: string | null;
}

export interface BallotRowData {
  readonly user_id: string;
  readonly option_id: string;
}

export interface StormModel {
  readonly facts: Readonly<Record<string, string | number>>;
  readonly day: string | null;
  readonly options: readonly StormOptionData[];
  readonly recommended: StormOptionId | null;
  /** `voting` while the poll is open; `decided` with the crew's choice; `withdrawn` when the
   *  forecast improved; `kept` when the vote closed with nobody choosing a change. */
  readonly phase: 'voting' | 'decided' | 'withdrawn';
  readonly chosen: StormOptionId | null;
  readonly canVote: boolean;
  readonly myVote: StormOptionId | null;
  readonly voterIds: readonly string[];
  readonly votedIds: readonly string[];
  /** Votes per option, most first. */
  readonly tally: readonly { readonly id: StormOptionId; readonly count: number }[];
  readonly closesAt: string | null;
  readonly seat: SeatState | null;
  readonly seatDate: string | null;
}

const IDS: ReadonlySet<string> = new Set(['swap', 'keep', 'skip']);
const SEATS: ReadonlySet<string> = new Set([
  'awaiting_booker_payment',
  'seats_not_confirmed',
  'moved',
  'cancel_failed',
  'change_on_partner',
  'booker_cancel',
]);
/* eslint-enable lingui/no-unlocalized-strings */

function parse<T>(text: string | null, fallback: T): T {
  if (text === null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function stormModel(
  row: StormRowData,
  poll: PollRowData | null,
  ballots: readonly BallotRowData[],
  me: string | null,
): StormModel {
  const rawOptions = parse<unknown>(row.options, []);
  const snapshot = parse<{ day?: string }>(row.source_snapshot, {});
  const options = (Array.isArray(rawOptions) ? (rawOptions as StormOptionData[]) : [])
    .filter((option) => typeof option === 'object' && IDS.has(option.id))
    .map((option) => ({ ...option, storm_day: snapshot.day ?? null }));
  const byPollOption = new Map(options.map((option) => [option.poll_option_id, option.id]));
  const voterIds = parse<unknown>(poll?.eligible_voter_ids ?? null, []);
  const voters = Array.isArray(voterIds) ? (voterIds as string[]) : [];
  const counts = new Map<StormOptionId, number>();
  let myVote: StormOptionId | null = null;
  for (const ballot of ballots) {
    const id = byPollOption.get(ballot.option_id);
    if (id === undefined) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (ballot.user_id === me) myVote = id;
  }
  const chosenRaw = row.chosen_option_id;
  const chosen = chosenRaw !== null && IDS.has(chosenRaw) ? (chosenRaw as StormOptionId) : null;
  const open = row.status === 'open' && poll?.status === 'open';
  const move = options.find((option) => option.supplier_move !== undefined)?.supplier_move;
  const seat =
    move?.state !== undefined && SEATS.has(move.state) ? (move.state as SeatState) : null;
  return {
    facts: parse<Record<string, string | number>>(row.facts, {}),
    day: snapshot.day ?? null,
    options,
    recommended: options.find((option) => option.recommended)?.id ?? null,
    phase: row.status === 'withdrawn' ? 'withdrawn' : open ? 'voting' : 'decided',
    chosen: open ? null : (chosen ?? 'keep'),
    canVote: open && me !== null && voters.includes(me),
    myVote,
    voterIds: voters,
    votedIds: ballots.map((ballot) => ballot.user_id),
    tally: [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    closesAt: poll?.closes_at ?? null,
    seat,
    seatDate: move?.new_date ?? null,
  };
}
