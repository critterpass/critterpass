/**
 * What a chat or guide push says to someone who hides message text on the lock screen
 * (`notification_prefs.hide_message_text`): only that something new is waiting, never the words.
 * A crew chat push becomes "New message in {crew}"; a push the guide writes becomes a line naming
 * the guide. Who sent it stays in the title. Pushes that always get through (a reply-by deadline, a
 * hold running out) keep their words, since they say what to do next.
 */
import type { NotificationClass, SenderKind } from '@cp/domain';

import type { Copy } from './render';

export const CHAT_NOTIFICATION = 'crew_chat';

const CHAT_BODY: Copy = /*i18n*/ {
  id: 'notifications.private.chat_body',
  message: 'New message in {crew}',
};

const GUIDE_BODY: Copy = /*i18n*/ {
  id: 'notifications.private.guide_body',
  message: '{guide} has something for you. Open CritterPass to read it.',
};

/** The generic body to render instead, or null when the push keeps its own. */
export function messageTextCopy(input: {
  readonly hide: boolean;
  readonly key: string;
  readonly class: NotificationClass;
  readonly sender: SenderKind;
}): Copy | null {
  if (!input.hide) return null;
  if (input.key === CHAT_NOTIFICATION) return CHAT_BODY;
  if (input.sender === 'guide' && input.class !== 'always') return GUIDE_BODY;
  return null;
}
