/**
 * The long-press menu's actions for one message, wired to the chat: reply and edit focus the
 * composer, pin toasts, delete asks first, report and "who reacted" open their overlays.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { ComponentRef, RefObject } from 'react';
import type { TextInput } from 'react-native';

import { useToast } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { whereRoute } from '@/features/critters';
import type { ChatMessage } from '../../chat/data/rows';
import { chatMenuActions } from './chat-menu-actions';
import type { ChatOverlay } from './chat-overlays';

export interface ChatMenuDeps {
  readonly me: string | null;
  readonly input: RefObject<ComponentRef<typeof TextInput> | null>;
  readonly isPinned: (messageId: string) => boolean;
  readonly setPinned: (messageId: string, pinned: boolean) => Promise<unknown>;
  readonly metForm: (formId: string | null) => boolean;
  readonly hasReactions: (messageId: string) => boolean;
  readonly remove: (message: ChatMessage) => Promise<unknown>;
  readonly setReplyTo: (message: ChatMessage) => void;
  readonly setEditing: (message: ChatMessage) => void;
  readonly setDraft: (text: string) => void;
  readonly openTray: () => void;
  readonly setOverlay: (overlay: ChatOverlay) => void;
}

export function useChatMenu(deps: ChatMenuDeps) {
  const toast = useToast();
  return (message: ChatMessage) =>
    chatMenuActions(message, {
      me: deps.me ?? '',
      pinned: deps.isPinned(message.id),
      stickerMet: deps.metForm(message.refId),
      hasReactions: deps.hasReactions(message.id),
      reply: () => {
        deps.setReplyTo(message);
        deps.input.current?.focus();
      },
      setPinned: (pinned) => {
        void deps.setPinned(message.id, pinned);
        toast.show({
          kind: 'done',
          message: pinned
            ? t({ id: 'chat.premium.pinned', message: 'Pinned to the trip' })
            : t({ id: 'chat.premium.unpinned', message: 'Unpinned' }),
        });
      },
      replyWithSticker: () => {
        deps.setReplyTo(message);
        deps.openTray();
      },
      whereToFind: () => {
        if (message.refId !== null) router.push(whereRoute(message.refId));
      },
      showWho: () => deps.setOverlay({ kind: 'who', message }),
      copy: () => void Clipboard.setStringAsync(message.body),
      edit: () => {
        deps.setEditing(message);
        deps.setDraft(message.body);
        deps.input.current?.focus();
      },
      remove: () =>
        void confirmAlert({
          title: t({ id: 'chat.premium.delete.title', message: 'Delete this message?' }),
          message: t({
            id: 'chat.premium.delete.line',
            message: 'It goes for everyone in the crew.',
          }),
          confirm: t({ id: 'chat.premium.menu.delete', message: 'Delete' }),
          cancel: t({ id: 'chat.premium.cancel', message: 'Cancel' }),
        }).then((yes) => {
          if (yes) void deps.remove(message);
        }),
      report: () => deps.setOverlay({ kind: 'report', message }),
    });
}
