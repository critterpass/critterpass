/**
 * What opens over the premium chat: the long-press menu with its lifted preview, who reacted, the
 * report sheet, the "+" sheet and the microphone-off sheet. One at a time; each closes back to the
 * chat with nothing lost.
 */
import type { ReportReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import type { ChatMessage } from '../../chat/data/rows';
import type { ReactionGroup } from '../../chat/data/use-reactions';
import { attachEntries } from '../../chat/media/attach-entries';
import type { ChatMediaActions } from '../../chat/media/use-chat-media-actions';
import { AttachSheet, MicOffSheet } from './chat-sheets';
import { MessageMenu, type MenuAction } from './message-menu';
import type { MessageAnchor } from './message-row';
import { ReportSheet, WhoReactedSheet } from './who-reacted-sheet';

export type ChatOverlay =
  | {
      readonly kind: 'menu';
      readonly message: ChatMessage;
      readonly anchor: MessageAnchor;
      /** The held message as its row draws it, lifted over the chat. */
      readonly preview: ReactNode;
    }
  | { readonly kind: 'who'; readonly message: ChatMessage }
  | { readonly kind: 'report'; readonly message: ChatMessage }
  | null;

export interface ChatOverlaysProps {
  readonly crewId: string;
  readonly overlay: ChatOverlay;
  readonly close: () => void;
  readonly isMine: (message: ChatMessage) => boolean;
  readonly groupsOf: (messageId: string) => readonly ReactionGroup[];
  readonly colourOf: (uid: string) => string;
  readonly menuFor: (message: ChatMessage) => {
    readonly main: MenuAction[];
    readonly danger: MenuAction[];
  };
  readonly onReact: (messageId: string, reaction: string) => void;
  readonly onReport: (message: ChatMessage, reason: ReportReason, mute: boolean) => void;
  readonly media: ChatMediaActions;
  readonly onTypeInstead: () => void;
}

export function ChatOverlays(props: ChatOverlaysProps) {
  const { overlay, media } = props;
  return (
    <>
      {overlay?.kind === 'menu' ? (
        <MessageMenu
          anchor={overlay.anchor}
          sticker={overlay.message.type === 'sticker'}
          mine={props.isMine(overlay.message)}
          reactions={props.groupsOf(overlay.message.id)}
          actions={props.menuFor(overlay.message).main}
          destructive={props.menuFor(overlay.message).danger}
          preview={overlay.preview}
          onReact={(reaction) => props.onReact(overlay.message.id, reaction)}
          onClose={props.close}
        />
      ) : null}
      {overlay?.kind === 'who' ? (
        <WhoReactedSheet
          groups={props.groupsOf(overlay.message.id)}
          colourOf={props.colourOf}
          onClose={props.close}
        />
      ) : null}
      {overlay?.kind === 'report' ? (
        <ReportSheet
          senderName={overlay.message.senderName ?? ''}
          onReport={(reason, mute) => props.onReport(overlay.message, reason, mute)}
          onClose={props.close}
        />
      ) : null}
      {media.menu.open ? (
        <AttachSheet
          problem={media.menu.denied !== null ? 'denied' : media.menu.failed ? 'failed' : null}
          onOpenSettings={media.openSettings}
          onClose={media.menu.close}
          options={[
            {
              key: 'library',
              label: t({ id: 'chat.premium.attach.library', message: 'Photos' }),
              icon: 'camera',
              onPress: () => media.menu.choose('library'),
            },
            {
              key: 'camera',
              label: t({ id: 'chat.premium.attach.camera', message: 'Camera' }),
              icon: 'camera',
              onPress: () => media.menu.choose('camera'),
            },
            {
              key: 'voice',
              label: t({ id: 'chat.premium.attach.voice', message: 'Voice note' }),
              icon: 'mic',
              onPress: () => media.menu.choose('voice'),
            },
            ...attachEntries().map((entry) => ({
              key: entry.id,
              label: entry.title(),
              icon: 'plus' as const,
              onPress: () => {
                media.menu.close();
                entry.onPress(props.crewId);
              },
            })),
          ]}
        />
      ) : null}
      {media.recorder.state === 'denied' ? (
        <MicOffSheet
          onOpenSettings={media.openSettings}
          onTypeInstead={() => {
            media.recorder.dismissDenied();
            props.onTypeInstead();
          }}
          onClose={media.recorder.dismissDenied}
        />
      ) : null}
    </>
  );
}
