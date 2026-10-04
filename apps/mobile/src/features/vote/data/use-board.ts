/**
 * The crew's destination vote from local rows: its open poll, the places on it (name, guide,
 * colour), whether the viewer organises it, and Home's vote-slot summary.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { HomeVoteSlot } from '@cp/domain';
import { useMemo } from 'react';

import type { GuideId } from '@/ui/people/GuideLine';
import { useGuidesPerCity } from '@/data/guides';

import { guideColour, guideOr } from '../format';
import { useLiveRows } from './live-rows';
import { OPEN_DESTINATION_SQL, PLACES_TABLES, placesSql } from './poll-queries';
import type { PollView } from './poll-view';
import { useMyUid } from './use-my-uid';
import { useRevealOnOpen } from './use-final';
import { usePoll } from './use-poll';

export interface BoardPlace {
  readonly id: string;
  /** The destination's slug, its editorial media's subject (absent in hand-built gallery scenes). */
  readonly slug?: string;
  readonly name: string;
  readonly guide: GuideId;
  readonly colour: string;
  readonly coverage: 'live' | 'guest';
}

const POLL_TABLE = ['polls'];
const ORGANISER_SQL = `SELECT 1 AS yes FROM trip_participants
  WHERE trip_id = ? AND user_id = ? AND role = 'organiser'`;
const ORGANISER_TABLES = ['trip_participants'];

export function useOpenDestinationPoll(crewId: string | null): string | null {
  const { rows } = useLiveRows<{ id: string }>(
    OPEN_DESTINATION_SQL,
    crewId === null ? null : [crewId],
    POLL_TABLE,
  );
  return rows[0]?.id ?? null;
}

export function usePlaces(pollId: string | null): ReadonlyMap<string, BoardPlace> {
  const perCity = useGuidesPerCity();
  const { rows } = useLiveRows<{
    id: string;
    slug: string;
    name: string;
    coverage: string | null;
    colour: string | null;
    guide_slug: string | null;
    city_guide_slug: string | null;
  }>(placesSql(perCity), pollId === null ? null : [pollId], PLACES_TABLES);
  return useMemo(
    () =>
      new Map(
        rows.map((row) => {
          const live = row.coverage === 'live';
          // The city's own critter is its guide, curated set or not; else the place's guide.
          const guide = guideOr(row.city_guide_slug, live ? guideOr(row.guide_slug) : 'tokek');
          return [
            row.id,
            {
              id: row.id,
              slug: row.slug,
              name: row.name,
              guide,
              colour: row.colour ?? guideColour(guide),
              coverage: live ? 'live' : 'guest',
            },
          ] as const;
        }),
      ),
    [rows],
  );
}

export function useIsOrganiser(poll: PollView | null, me: string | null): boolean {
  const { rows } = useLiveRows<{ yes: number }>(
    ORGANISER_SQL,
    poll?.tripId == null || me === null ? null : [poll.tripId, me],
    ORGANISER_TABLES,
  );
  return poll !== null && (poll.createdBy === me || rows.length > 0);
}

export function homeVoteOf(poll: PollView): HomeVoteSlot {
  return {
    pollId: poll.id,
    stage: poll.stage === 'final' ? 'final' : 'board',
    candidates: poll.options.map((option) => ({
      placeId: option.refId ?? option.id,
      votes: option.votes,
    })),
    votersIn: poll.votedCount,
    memberCount: poll.eligibleIds.length,
    closesAt: poll.closesAt,
  };
}

/** Home's vote slot: the crew's open destination poll, or null. */
export function useHomeDestinationVote(crewId: string | null): HomeVoteSlot | null {
  const me = useMyUid();
  useRevealOnOpen(me);
  const pollId = useOpenDestinationPoll(crewId);
  const { poll } = usePoll(pollId, me);
  return useMemo(() => (poll === null || poll.status !== 'open' ? null : homeVoteOf(poll)), [poll]);
}
