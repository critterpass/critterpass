import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/**
 * A full-height glass form sheet with a dirty form: type anything, then swipe down or tap Cancel
 * and it asks first; Save keeps it and closes. The footer button rides the keyboard.
 */
export default function DemoSheet() {
  const t = usePremiumTheme();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const field = [
    styles.field,
    { backgroundColor: t.color.card, borderRadius: t.radius.field, color: t.color.ink },
  ];
  return (
    <SheetScreen
      title="New booking"
      cancelLabel="Cancel"
      verb={{
        label: 'Save',
        disabled: name === '',
        onPress: () => true,
        testID: 'premium-shell-sheet-save',
      }}
      dirty={name !== '' || note !== ''}
      discardPrompt={{
        title: 'Discard this booking?',
        message: 'What you typed goes.',
        discard: 'Discard',
        keep: 'Keep editing',
      }}
      footer={<Button label="Save booking" disabled={name === ''} onPress={() => undefined} />}
      testID="premium-shell-sheet"
    >
      <View style={styles.body}>
        <Text variant="label" tone="muted">
          Name
        </Text>
        <TextInput
          testID="premium-shell-sheet-name"
          value={name}
          onChangeText={setName}
          placeholder="Boat to Penida"
          placeholderTextColor={t.color.placeholder}
          style={field}
        />
        <Text variant="label" tone="muted">
          Note
        </Text>
        <TextInput
          testID="premium-shell-sheet-note"
          value={note}
          onChangeText={setNote}
          placeholder="Sanur harbour, 07:00"
          placeholderTextColor={t.color.placeholder}
          multiline
          style={[field, styles.note]}
        />
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8, paddingTop: 8 },
  field: { height: 52, paddingHorizontal: 16, fontSize: 16 },
  note: { height: 120, paddingTop: 14 },
});
