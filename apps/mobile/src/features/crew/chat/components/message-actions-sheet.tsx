/**
 * A message's actions (long press): the reaction bar, then Reply, Copy, Edit, Delete (own), and
 * Report or Mute {name} (someone else's). Delete and mute confirm first.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Stack } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { MessageAction } from '../data/use-message-actions';
import type { ChatMessage } from '../data/rows';
import { firstName } from '../data/use-typing';
import { ReactionBar } from './reaction-bar';

export interface MessageActionsSheetProps {
  readonly message: ChatMessage;
  readonly actions: readonly MessageAction[];
  /** The member's own reactions on this message. */
  readonly myReactions: ReadonlySet<string>;
  readonly onReact: (emoji: string) => void;
  readonly onAction: (action: MessageAction) => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((th) => ({ body: { padding: th.space['16'], gap: th.space['16'] } }));

export function MessageActionsSheet(props: MessageActionsSheetProps) {
  const { message, actions, onAction, onClose } = props;
  const styles = useStyles();
  const [confirm, setConfirm] = useState<'delete' | 'mute' | null>(null);
  const name = firstName(message.senderName) ?? '';
  const label = (action: MessageAction): string => {
    switch (action) {
      case 'reply':
        return t({ id: 'chat.action.reply', message: 'Reply' });
      case 'copy':
        return t({ id: 'chat.action.copy', message: 'Copy text' });
      case 'edit':
        return t({ id: 'chat.action.edit', message: 'Edit' });
      case 'delete':
        return t({ id: 'chat.action.delete', message: 'Delete for everyone' });
      case 'report':
        return t({ id: 'chat.action.report', message: 'Report' });
      case 'mute':
        return t({ id: 'chat.action.mute', message: `Mute ${name}` });
    }
  };
  const rows: SettingsRow[] = actions.map((action) =>
    action === 'delete' || action === 'mute'
      ? {
          key: action,
          kind: 'destructive',
          title: label(action),
          onPress: () => setConfirm(action),
        }
      : {
          key: action,
          kind: 'value',
          title: label(action),
          value: '',
          onPress: () => onAction(action),
        },
  );

  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={t({ id: 'chat.message.actions', message: 'Message actions' })}
      testID="chat-actions"
    >
      <View style={styles.body}>
        {confirm === 'delete' ? (
          <ConfirmSheet
            title={t({ id: 'chat.delete.title', message: 'Delete this message?' })}
            consequences={[
              t({
                id: 'chat.delete.line',
                message: 'Everyone sees "Message deleted" in its place.',
              }),
            ]}
            confirmLabel={t({ id: 'chat.delete.confirm', message: 'Delete' })}
            onConfirm={() => onAction('delete')}
            onCancel={() => setConfirm(null)}
          />
        ) : confirm === 'mute' ? (
          <ConfirmSheet
            title={t({ id: 'chat.mute.title', message: `Mute ${name}?` })}
            consequences={[
              t({
                id: 'chat.mute.line',
                message: `You won't see ${name}'s messages in this chat.`,
              }),
              t({ id: 'chat.mute.private', message: `${name} isn't told.` }),
            ]}
            confirmLabel={t({ id: 'chat.mute.confirm', message: 'Mute' })}
            onConfirm={() => onAction('mute')}
            onCancel={() => setConfirm(null)}
          />
        ) : (
          <Stack gap="16">
            {message.status === 'sent' && !message.deleted ? (
              <ReactionBar mine={props.myReactions} onPick={props.onReact} />
            ) : null}
            <SettingsGroup rows={rows} testID="chat-actions-list" />
          </Stack>
        )}
      </View>
    </Sheet>
  );
}
