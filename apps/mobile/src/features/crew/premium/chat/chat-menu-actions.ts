/**
 * What the long-press menu offers for one message (5.04, 5.09), in order: Reply, Pin to the trip
 * (or Unpin), for a sticker Reply with a sticker or Where to find it, Who reacted, Copy, Edit; then
 * the destructive band: Delete for your own, Report for a crewmate's. The rules of which actions a
 * message allows are the chat's own (`actionsFor`).
 */
import { CHAT_EDIT_WINDOW_MINUTES } from '@cp/domain';
import { t } from '@lingui/core/macro';

import type { ChatMessage } from '../../chat/data/rows';
import { actionsFor } from '../../chat/data/use-message-actions';
import type { MenuAction } from './message-menu';

export interface MenuDeps {
  readonly me: string;
  readonly pinned: boolean;
  /** The member has met this sticker's form (it is in their tray). */
  readonly stickerMet: boolean;
  readonly hasReactions: boolean;
  readonly reply: () => void;
  readonly setPinned: (pinned: boolean) => void;
  readonly replyWithSticker: () => void;
  readonly whereToFind: () => void;
  readonly showWho: () => void;
  readonly copy: () => void;
  readonly edit: () => void;
  readonly remove: () => void;
  readonly report: () => void;
}

export function chatMenuActions(
  message: ChatMessage,
  deps: MenuDeps,
  now: number = Date.now(),
): { readonly main: MenuAction[]; readonly danger: MenuAction[] } {
  const allowed = actionsFor(message, deps.me, now, CHAT_EDIT_WINDOW_MINUTES);
  const main: MenuAction[] = [];
  const danger: MenuAction[] = [];
  if (allowed.includes('reply')) {
    main.push({
      key: 'reply',
      label: t({ id: 'chat.premium.menu.reply', message: 'Reply' }),
      icon: 'reply',
      onPress: deps.reply,
    });
  }
  if (message.type === 'sticker') {
    main.push(
      deps.stickerMet
        ? {
            key: 'replySticker',
            label: t({ id: 'chat.premium.menu.replySticker', message: 'Reply with a sticker' }),
            icon: 'forward',
            onPress: deps.replyWithSticker,
          }
        : {
            key: 'where',
            label: t({ id: 'chat.premium.menu.whereToFind', message: 'Where to find it' }),
            icon: 'pin',
            onPress: deps.whereToFind,
          },
    );
  } else if (allowed.length > 0) {
    main.push({
      key: deps.pinned ? 'unpin' : 'pin',
      label: deps.pinned
        ? t({ id: 'chat.premium.menu.unpin', message: 'Unpin from the trip' })
        : t({ id: 'chat.premium.menu.pin', message: 'Pin to the trip' }),
      icon: 'pushpin',
      onPress: () => deps.setPinned(!deps.pinned),
    });
  }
  if (deps.hasReactions) {
    main.push({
      key: 'who',
      label: t({ id: 'chat.premium.menu.who', message: 'Who reacted' }),
      icon: 'people',
      onPress: deps.showWho,
    });
  }
  if (allowed.includes('copy')) {
    main.push({
      key: 'copy',
      label: t({ id: 'chat.premium.menu.copy', message: 'Copy' }),
      icon: 'copy',
      onPress: deps.copy,
    });
  }
  if (allowed.includes('edit')) {
    main.push({
      key: 'edit',
      label: t({ id: 'chat.premium.menu.edit', message: 'Edit' }),
      icon: 'edit',
      onPress: deps.edit,
    });
  }
  if (allowed.includes('delete')) {
    danger.push({
      key: 'delete',
      destructive: true,
      label: t({ id: 'chat.premium.menu.delete', message: 'Delete' }),
      icon: 'trash',
      onPress: deps.remove,
    });
  }
  if (allowed.includes('report')) {
    danger.push({
      key: 'report',
      destructive: true,
      label: t({ id: 'chat.premium.menu.report', message: 'Report' }),
      icon: 'flag',
      onPress: deps.report,
    });
  }
  return { main, danger };
}
