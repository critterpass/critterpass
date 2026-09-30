/**
 * The proposal's card in crew chat: sending a proposal posts a `proposal` message naming it, so
 * every member finds it in the chat as well as in their push. The card holds the trip's streams
 * (the message carries the trip) until the proposal row arrives, then opens it: the member's own
 * version, or the organiser's tracker.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { createElement } from 'react';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { registerChatCard, type ChatCardProps } from '@/features/crew';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { ActionCard } from '@/ui/cards/ActionCard';
import { Sticker } from '@/ui/sticker/Sticker';
import { Skeleton } from '@/ui/states/Skeleton';

import { useProposal } from './data/proposal';
import { useLiveRows } from './data/rows';
import { useProposalTrip } from './data/trip';
import { proposalRoutes } from './routes';

const TRIP_SQL = 'SELECT trip_id FROM messages WHERE id = ?';

function ProposalMessageCard({ message }: ChatCardProps) {
  const proposalId = message.refId ?? '';
  const { rows } = useLiveRows<{ trip_id: string | null }>(TRIP_SQL, [message.id], ['messages']);
  const tripId = rows[0]?.trip_id ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const proposal = useProposal(proposalId);
  if (trip == null || proposal == null) {
    return createElement(Skeleton, {
      preset: 'card',
      label: t({ id: 'proposal.card.loading', message: 'Loading the proposal' }),
    });
  }
  const guide = GUIDE_STICKERS[trip.guide];
  const locked = proposal.status === 'locked';
  return createElement(ActionCard, {
    tone: 'yellow',
    title: t({ id: 'proposal.card.title', message: `${trip.destination}: the proposal` }),
    body: locked
      ? t({ id: 'proposal.card.locked', message: 'The crew is locked in.' })
      : trip.isOrganiser
        ? t({ id: 'proposal.card.organiser', message: 'See who’s in so far.' })
        : t({
            id: 'proposal.card.member',
            message: `${guide.name} wrote you your own version. Are you in?`,
          }),
    leading: createElement(Sticker, { kind: guide.kind, name: guide.name, size: 48 }),
    actions: createElement(PillButton, {
      size: 'sm',
      tone: 'ink',
      label: trip.isOrganiser
        ? t({ id: 'proposal.card.track', message: 'Who’s in?' })
        : t({ id: 'proposal.card.open', message: 'Open it' }),
      onPress: () =>
        router.push(
          trip.isOrganiser ? proposalRoutes.tracker(proposal.id) : proposalRoutes.open(proposal.id),
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
