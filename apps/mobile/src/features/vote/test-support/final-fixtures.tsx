/**
 * The destination final the final, showdown and reveal suites share: Kyoto against Lisbon for the
 * harness crew, open with a frozen tie rule or closed with Kyoto the winner, and the two surfaces
 * that draw a poll once it has been read.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are fixtures and SQL. */
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';

import { usePoll } from '../data/use-poll';
import { FinalSplitCard } from '../final/final-split-card';
import { ShowdownView } from '../final/showdown-screen';
import { WinnerRevealView } from '../final/winner-reveal';
import { CREW, KYOTO, LISBON, MAYA, POLL, TRIP, seedPoll } from './vote-harness';

export const OPT_KYOTO = '0192f000-0000-7000-8000-000000000711';
export const OPT_LISBON = '0192f000-0000-7000-8000-000000000712';

const TIE = {
  rule: 'cheaper_for_majority_origin',
  winner_option_id: OPT_KYOTO,
  cheaper_by_minor: 44000,
  currency: 'USD',
  origin: 'SIN',
  member_count: 2,
};

const FINALISTS = [
  { id: OPT_KYOTO, label: 'Kyoto', refId: KYOTO },
  { id: OPT_LISBON, label: 'Lisbon', refId: LISBON },
];

export interface SeedBallot {
  readonly userId: string;
  readonly optionId: string;
}

/** The open final, with `ballots` cast and the tie going to Kyoto. */
export async function seedFinal(s: TestLocalFirst, ballots: readonly SeedBallot[]): Promise<void> {
  await seedPoll(s, {
    kind: 'destination',
    stage: 'final',
    question: null,
    options: FINALISTS,
    ballots,
    result: { tie_preview: TIE },
  });
}

/** The closed final Kyoto won, its trip organised by `organiser`, its reveal seen at `seenAt`. */
export async function seedClosed(
  s: TestLocalFirst,
  ballots: readonly SeedBallot[],
  organiser: string,
  seenAt: string | null = null,
): Promise<void> {
  await seedPoll(s, {
    kind: 'destination',
    stage: 'final',
    status: 'closed',
    question: null,
    options: FINALISTS,
    ballots,
    winnerOptionId: OPT_KYOTO,
    createdBy: MAYA,
  });
  await s.db.execute('INSERT INTO trips (id, crew_id, status) VALUES (?, ?, ?)', [
    TRIP,
    CREW,
    'planning',
  ]);
  await s.db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, role, created_at)
     VALUES ('tp-1', ?, ?, 'organiser', '2026-10-01T00:00:00Z')`,
    [TRIP, organiser],
  );
  await s.db.execute(
    `INSERT INTO poll_reveals (id, poll_id, user_id, seen_at, created_at)
     VALUES ('rv-1', ?, ?, ?, '2026-10-02T00:00:00Z')`,
    [POLL, s.uid, seenAt],
  );
}

export function Final({ me, view }: { readonly me: string; readonly view: 'card' | 'showdown' }) {
  const { poll } = usePoll(POLL, me);
  if (poll === null) return null;
  return view === 'card' ? <FinalSplitCard poll={poll} /> : <ShowdownView poll={poll} />;
}

export function Reveal({ me }: { readonly me: string }) {
  const { poll } = usePoll(POLL, me);
  return poll === null || poll.status !== 'closed' ? null : (
    <WinnerRevealView poll={poll} me={me} />
  );
}
