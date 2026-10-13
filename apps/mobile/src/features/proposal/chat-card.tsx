/**
 * The proposal's card in crew chat: each answer and the lock also arrive as their own system lines
 * below it, so the card is not the only place news lands.
 */
import { createElement } from 'react';

import { registerPremiumChatCard } from '@/features/crew';

import { PremiumProposalCard } from './premium/chat-card';

registerPremiumChatCard('proposal', {
  render: (message) => createElement(PremiumProposalCard, { message }),
});
