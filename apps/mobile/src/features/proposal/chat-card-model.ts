/**
 * What the proposal's card in crew chat says and opens: sending a proposal posts a `proposal`
 * message naming it, so every member finds it in the chat as well as in their push. The card holds
 * the trip's streams (the message carries the trip) until the proposal row arrives, then opens it:
 * the trailer or the member's own version, or the organiser's tracker. A member who has answered
 * reads their answer on the card and opens their version (the story has played).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import type { ChatMessage } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';

import { useProposal } from './data/proposal';
import { useLiveRows } from './data/rows';
import { useProposalTrip } from './data/trip';
import { proposalRoutes } from './routes';
import { turnCopy } from './turn/copy';
import { tripTurn } from './turn/model';

const TRIP_SQL = 'SELECT trip_id FROM messages WHERE id = ?';

export interface ProposalCardModel {
  readonly proposalId: string;
  readonly title: string;
  readonly body: string;
  readonly action: string;
  readonly href: Href;
}

/** Null until the trip and the proposal are on this phone. */
export function useProposalCard(message: ChatMessage): ProposalCardModel | null {
  const proposalId = message.refId ?? '';
  const { rows } = useLiveRows<{ trip_id: string | null }>(TRIP_SQL, [message.id], ['messages']);
  const tripId = rows[0]?.trip_id ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const proposal = useProposal(proposalId);
  const locale = useLocale();
  if (trip == null || proposal == null) return null;
  const locked = proposal.status === 'locked';
  // A member who has answered reads their answer here, not a second "are you in?".
  const mine = trip.isOrganiser
    ? null
    : tripTurn({
        status: 'proposed',
        role: 'member',
        crewSize: trip.people.length,
        proposal: { status: proposal.status, replyBy: proposal.replyBy },
        myRsvp: trip.people.find((person) => person.uid === trip.me)?.rsvp ?? null,
        recipients: [],
      }).turn;
  const answered = mine?.kind === 'answered' ? mine : null;
  return {
    proposalId: proposal.id,
    title: t({ id: 'proposal.card.title', message: `${trip.destination}: the proposal` }),
    body: locked
      ? t({ id: 'proposal.card.locked', message: 'The crew is locked in.' })
      : trip.isOrganiser
        ? t({ id: 'proposal.card.organiser', message: 'See who’s in so far.' })
        : answered !== null
          ? turnCopy(answered, {
              locale,
              guide: guideSticker(trip.guide).name,
              organiser: trip.people.find((person) => person.organiser)?.name ?? '',
            }).line
          : t({ id: 'proposal.card.memberReady', message: 'Your version is ready. Are you in?' }),
    action: trip.isOrganiser
      ? t({ id: 'proposal.card.track', message: 'Who’s in?' })
      : t({ id: 'proposal.card.open', message: 'Open it' }),
    href: trip.isOrganiser
      ? proposalRoutes.tracker(proposal.id)
      : proposal.format === 'trailer' && answered === null
        ? proposalRoutes.trailer(proposal.id)
        : proposalRoutes.open(proposal.id),
  };
}
