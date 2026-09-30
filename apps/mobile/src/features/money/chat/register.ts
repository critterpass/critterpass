/**
 * Money's registration in crew chat, imported once by the root layout: logging an expense posts
 * an `expense` message, drawn as the expense card.
 */
import { t } from '@lingui/core/macro';
import { createElement } from 'react';

import { registerChatCard } from '@/features/crew';

import { ExpenseChatCard } from './expense-chat-card';

registerChatCard('expense', {
  Component: (props) => createElement(ExpenseChatCard, props),
  estimateHeight: () => 76,
  a11yLabel: (message) =>
    message.body === ''
      ? t({ id: 'money.chat.label', message: 'Expense' })
      : t({ id: 'money.chat.labelFor', message: `Expense: ${message.body}` }),
});
