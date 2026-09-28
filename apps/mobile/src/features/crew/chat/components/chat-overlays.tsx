/**
 * The chat's sheets and what they do: a message's actions (react, reply, copy, edit, delete,
 * report, mute), who reacted, and the report form. The screen owns which one is open.
 */
import * as Clipboard from 'expo-clipboard';
import { t } from '@lingui/core/macro';

import { toast } from '@/motion/island-toast';

import type { ChatMessage } from '../data/rows';
import { actionsFor, useMessageActions, type MessageAction } from '../data/use-message-actions';
import type { ReactionGroup } from '../data/use-reactions';
import { firstName } from '../data/use-typing';
import { MessageActionsSheet } from './message-actions-sheet';
import { ReactionsSheet } from './reactions-sheet';
import { ReportSheet } from './report-sheet';

export type ChatOverlay =
  | { readonly kind: 'actions'; readonly message: ChatMessage }
  | { readonly kind: 'reactions'; readonly message: ChatMessage }
  | { readonly kind: 'report'; readonly message: ChatMessage }
  | null;

export interface ChatOverlaysProps {
  readonly crewId: string;
  readonly me: string;
  readonly overlay: ChatOverlay;
  readonly setOverlay: (next: ChatOverlay) => void;
  readonly reactions: ReadonlyMap<string, readonly ReactionGroup[]>;
  readonly joinIndex: ReadonlyMap<string, number>;
  readonly onReact: (messageId: string, emoji: string) => void;
  readonly onReply: (message: ChatMessage) => void;
  readonly onEdit: (message: ChatMessage) => void;
}

export function ChatOverlays(props: ChatOverlaysProps) {
  const { crewId, me, overlay, setOverlay } = props;
  const { remove, report, mute } = useMessageActions(crewId);
  if (overlay === null) return null;
  const { message } = overlay;
  const close = () => setOverlay(null);
  const groups = props.reactions.get(message.id) ?? [];

  if (overlay.kind === 'reactions') {
    return <ReactionsSheet groups={groups} joinIndex={props.joinIndex} onClose={close} />;
  }
  if (overlay.kind === 'report') {
    return (
      <ReportSheet
        senderName={firstName(message.senderName) ?? ''}
        onReport={(reason, alsoMute) => {
          void report(message, reason);
          if (alsoMute && message.senderId !== null) void mute(message.senderId, true);
          toast.show({
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a de-dupe key, never copy.
            id: `chat-report-${message.id}`,
            title: t({ id: 'chat.report.sent', message: 'Thanks. Our team will take a look.' }),
          });
          close();
        }}
        onClose={close}
      />
    );
  }

  const act = (action: MessageAction) => {
    close();
    switch (action) {
      case 'reply':
        props.onReply(message);
        return;
      case 'copy':
        void Clipboard.setStringAsync(message.body);
        toast.show({
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a de-dupe key, never copy.
          id: `chat-copy-${message.id}`,
          title: t({ id: 'chat.action.copied', message: 'Copied' }),
        });
        return;
      case 'edit':
        props.onEdit(message);
        return;
      case 'delete':
        void remove(message);
        return;
      case 'report':
        setOverlay({ kind: 'report', message });
        return;
      case 'mute':
        if (message.senderId !== null) void mute(message.senderId, true);
        return;
    }
  };

  return (
    <MessageActionsSheet
      message={message}
      actions={actionsFor(message, me)}
      myReactions={new Set(groups.filter((group) => group.mine).map((group) => group.emoji))}
      onReact={(emoji) => {
        props.onReact(message.id, emoji);
        close();
      }}
      onAction={act}
      onClose={close}
    />
  );
}
