/**
 * The poll engine's registrations in crew chat: the `poll` card (every poll the crew posts,
 * destination votes included) and the "+" menu's Poll entry, which opens the new-poll sheet.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { createElement } from 'react';

import { registerAttachEntry, registerPremiumChatCard } from '@/features/crew';

import { PremiumChatPollCard } from './premium/poll/poll-card';
import { voteRoutes } from './routes';

let registered = false;

export function registerPollChatCards(): void {
  if (registered) return;
  registered = true;
  registerPremiumChatCard('poll', {
    render: (message) => createElement(PremiumChatPollCard, { message }),
  });
  registerAttachEntry({
    id: 'poll',
    title: () => t({ id: 'vote.chat.attach', message: 'Poll' }),
    onPress: (crewId) => router.push(voteRoutes.newPoll(crewId)),
  });
}
