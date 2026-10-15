/**
 * The change set's registration in crew chat: sending a change set for a vote posts a `changeset`
 * message, drawn as the change set's card. The message names the change set; its trip comes from
 * the synced change set row.
 */
import { createElement } from 'react';

import { registerPremiumChatCard } from '@/features/crew';

import { PremiumChangesetCard } from '../premium/review/changeset-card';

registerPremiumChatCard('changeset', {
  render: (message) => createElement(PremiumChangesetCard, { message }),
});
