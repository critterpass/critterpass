/**
 * The proposal's card in crew chat, in both chat registries: each answer and the lock also arrive
 * as their own system lines below it, so the card is not the only place news lands.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { createElement } from 'react';

import { registerChatCard, registerPremiumChatCard, type ChatCardProps } from '@/features/crew';
import { PillButton } from '@/ui/buttons/PillButton';
import { ActionCard } from '@/ui/cards/ActionCard';
import { Skeleton } from '@/ui/states/Skeleton';

import { useProposalCard } from './chat-card-model';
import { PremiumProposalCard } from './premium/chat-card';

export function ProposalMessageCard({ message }: ChatCardProps) {
  const card = useProposalCard(message);
  if (card === null) {
    return createElement(Skeleton, {
      preset: 'card',
      label: t({ id: 'proposal.card.loading', message: 'Loading the proposal' }),
    });
  }
  return createElement(ActionCard, {
    tone: 'yellow',
    title: card.title,
    body: card.body,
    actions: createElement(PillButton, {
      size: 'sm',
      tone: 'ink',
      label: card.action,
      onPress: () => router.push(card.href),
      testID: `proposal-card-open-${card.proposalId}`,
    }),
    testID: 'proposal-card',
  });
}

registerChatCard('proposal', {
  Component: ProposalMessageCard,
  estimateHeight: () => 160,
  a11yLabel: () => t({ id: 'proposal.card.a11y', message: 'Trip proposal' }),
});

registerPremiumChatCard('proposal', {
  render: (message) => createElement(PremiumProposalCard, { message }),
});
