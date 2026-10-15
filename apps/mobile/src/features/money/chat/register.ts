/**
 * Money's registration in crew chat, imported once by the root layout: logging an expense posts
 * an `expense` message, drawn as the expense card.
 */
import { createElement } from 'react';

import { registerPremiumChatCard } from '@/features/crew';

import { ExpenseChatCardPremium } from '../premium/ExpenseChatCardPremium';

registerPremiumChatCard('expense', {
  render: (message, mine) => createElement(ExpenseChatCardPremium, { message, mine }),
});
