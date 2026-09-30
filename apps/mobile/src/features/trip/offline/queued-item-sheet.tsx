/**
 * One waiting write, opened from SENDS WHEN YOU'RE BACK: what it is and since when, "Don't send
 * it" (everything it changed on this phone goes back), and for a chat message its text to change.
 * Once it is already on its way the sheet says so and changes nothing.
 */
import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { QueueChange } from './queue-actions';

export interface QueuedItemSheetProps {
  readonly summary: MessageDescriptor;
  readonly since: string;
  /** A chat message's text when the write is one (it can be changed). */
  readonly body: string | null;
  readonly onCancel: () => Promise<QueueChange>;
  readonly onEdit: (body: string) => Promise<QueueChange>;
  readonly onClose: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['16'], paddingBottom: th.space['8'] },
  input: {
    minHeight: th.space['32'] * 2,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.semantic.border.control,
    padding: th.space['12'],
    color: th.semantic.text.primary,
  },
}));

export function QueuedItemSheet(props: QueuedItemSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n, t } = useLingui();
  const [text, setText] = useState(props.body ?? '');
  const [note, setNote] = useState<string | null>(null);
  const settle = (change: QueueChange) => {
    if (change === 'done') props.onClose();
    else
      setNote(
        change === 'sending'
          ? t({ id: 'trip.offline.alreadySending', message: "It's already on its way." })
          : t({ id: 'trip.offline.alreadySent', message: 'It was sent a moment ago.' }),
      );
  };
  const { since } = props;
  return (
    <Sheet
      detents={['fit']}
      title={i18n._(props.summary)}
      onDismiss={props.onClose}
      testID="trip-offline-item-sheet"
    >
      <View style={styles.body}>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'trip.offline.waitingSince', message: `Waiting for signal since ${since}` })}
        </Text>
        {props.body === null ? null : (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              accessibilityLabel={t({ id: 'trip.offline.editLabel', message: 'Message' })}
              style={styles.input}
              testID="trip-offline-item-edit"
            />
            <PillButton
              label={t({ id: 'trip.offline.saveEdit', message: 'Send this instead' })}
              block
              disabled={text.trim() === '' || text === props.body}
              onPress={() => void props.onEdit(text.trim()).then(settle)}
              testID="trip-offline-item-save"
            />
          </>
        )}
        <PillButton
          label={t({ id: 'trip.offline.cancelSend', message: "Don't send it" })}
          variant="destructive"
          block
          onPress={() => void props.onCancel().then(settle)}
          testID="trip-offline-item-cancel"
        />
        {note === null ? null : (
          <Text variant="bodySm" testID="trip-offline-item-note">
            {note}
          </Text>
        )}
      </View>
    </Sheet>
  );
}
