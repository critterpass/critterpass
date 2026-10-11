/**
 * One waiting write (6.18), as the system sheet: a pulsing tangerine dot with since when, what it
 * is, and for a chat message its text as an ink bubble you can still change (the keyboard rides
 * the sheet; return adds a line). "Don't send" takes back everything it changed on this phone;
 * once it is already on its way the sheet says so and changes nothing.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { QueuedItemSheetProps } from '../../offline/queued-item-sheet';
import type { QueueChange } from '../../offline/queue-actions';

export function QueuedSheet(props: QueuedItemSheetProps) {
  const th = usePremiumTheme();
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
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={props.onClose}
      testID="trip-offline-item-sheet"
    >
      <ScrollView
        style={{ backgroundColor: th.color.ground }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { padding: th.space.gutter }]}
      >
        <View style={styles.waiting}>
          <View style={[styles.dot, { backgroundColor: th.accent.tangerine }]} />
          <Text variant="label" color={th.color.status.tangerine.text}>
            {t({ id: 'trip.offline.waitingSince', message: `Waiting for signal since ${props.since}` })}
          </Text>
        </View>
        <Text variant="title" accessibilityRole="header">
          {i18n._(props.summary)}
        </Text>
        {props.body === null ? null : (
          <View style={[styles.bubble, { backgroundColor: th.color.ink }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              accessibilityLabel={t({ id: 'trip.offline.editLabel', message: 'Message' })}
              selectionColor={th.color.caret}
              style={[styles.input, { color: th.color.onInk, fontSize: th.type.field.size }]}
              testID="trip-offline-item-edit"
            />
          </View>
        )}
        <Text variant="captionMuted" tone="muted">
          {t({ id: 'trip.offline.premium.sendsItself', message: "Sends itself when you're back" })}
        </Text>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button
              label={t({ id: 'trip.offline.cancelSend', message: "Don't send it" })}
              variant="destructive"
              onPress={() => void props.onCancel().then(settle)}
              testID="trip-offline-item-cancel"
            />
          </View>
          {props.body === null ? null : (
            <View style={styles.wide}>
              <Button
                label={t({ id: 'trip.offline.premium.saveEdit', message: 'Save edit' })}
                disabled={text.trim() === '' || text === props.body}
                onPress={() => void props.onEdit(text.trim()).then(settle)}
                testID="trip-offline-item-save"
              />
            </View>
          )}
        </View>
        {note === null ? null : (
          <Text variant="rowText" testID="trip-offline-item-note">
            {note}
          </Text>
        )}
        <View style={styles.center}>
          <TextButton label={t({ id: 'trip.offline.premium.close', message: 'Close' })} onPress={props.onClose} testID="trip-offline-item-close" />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bubble: { marginLeft: 30, borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 },
  input: { minHeight: 44, lineHeight: 22 },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  wide: { flex: 1.4 },
  center: { alignItems: 'center' },
});
