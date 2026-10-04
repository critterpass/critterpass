/**
 * The proposal's card in crew chat: sending a proposal posts a `proposal` message naming it, so
 * every member finds it in the chat as well as in their push. The card holds the trip's streams
 * (the message carries the trip) until the proposal row arrives, then opens it: the trailer or
 * the member's own version, or the organiser's tracker. A member who has answered reads their
 * answer on the card and opens their version (the story has played); each answer and the lock
 * also arrive as their own system lines below it, so the card is not the only place news lands.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { createElement } from 'react';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { registerChatCard, type ChatCardProps } from '@/features/crew';
import { PillButton } from '@/ui/buttons/PillButton';
import { ActionCard } from '@/ui/cards/ActionCard';
import { Skeleton } from '@/ui/states/Skeleton';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { useLocale } from '@/lib/i18n/use-locale';

import { useProposal } from './data/proposal';
import { useLiveRows } from './data/rows';
import { useProposalTrip } from './data/trip';
import { proposalRoutes } from './routes';
import { turnCopy } from './turn/copy';
import { tripTurn } from './turn/model';

const TRIP_SQL = 'SELECT trip_id FROM messages WHERE id = ?';

export function ProposalMessageCard({ message }: ChatCardProps) {
  const proposalId = message.refId ?? '';
  const { rows } = useLiveRows<{ trip_id: string | null }>(TRIP_SQL, [message.id], ['messages']);
  const tripId = rows[0]?.trip_id ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const proposal = useProposal(proposalId);
  const locale = useLocale();
  if (trip == null || proposal == null) {
    return createElement(Skeleton, {
      preset: 'card',
      label: t({ id: 'proposal.card.loading', message: 'Loading the proposal' }),
    });
  }
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
  return createElement(ActionCard, {
    tone: 'yellow',
    title: t({ id: 'proposal.card.title', message: `${trip.destination}: the proposal` }),
    body: locked
      ? t({ id: 'proposal.card.locked', message: 'The crew is locked in.' })
      : trip.isOrganiser
        ? t({ id: 'proposal.card.organiser', message: 'See who’s in so far.' })
        : answered !== null
          ? turnCopy(answered, {
              locale,
              guide: GUIDE_STICKERS[trip.guide].name,
              organiser: trip.people.find((person) => person.organiser)?.name ?? '',
            }).line
          : t({ id: 'proposal.card.memberReady', message: 'Your version is ready. Are you in?' }),
    actions: createElement(PillButton, {
      size: 'sm',
      tone: 'ink',
      label: trip.isOrganiser
        ? t({ id: 'proposal.card.track', message: 'Who’s in?' })
        : t({ id: 'proposal.card.open', message: 'Open it' }),
      onPress: () =>
        router.push(
          trip.isOrganiser
            ? proposalRoutes.tracker(proposal.id)
            : proposal.format === 'trailer' && answered === null
              ? proposalRoutes.trailer(proposal.id)
              : proposalRoutes.open(proposal.id),
        ),
      testID: `proposal-card-open-${proposal.id}`,
    }),
    testID: 'proposal-card',
  });
}

registerChatCard('proposal', {
  Component: ProposalMessageCard,
  estimateHeight: () => 160,
  a11yLabel: () => t({ id: 'proposal.card.a11y', message: 'Trip proposal' }),
});
