import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/** What the guide circle opens instead of a tab: a sheet with a composer that rides the keyboard. */
export default function DemoGuide() {
  const t = usePremiumTheme();
  const [text, setText] = useState('');
  return (
    <SheetScreen
      title="Ask Tokek"
      cancelLabel="Close"
      testID="premium-shell-guide"
      footer={
        <View
          style={[
            styles.composer,
            { backgroundColor: t.color.card, borderRadius: t.radius.composer },
          ]}
        >
          <TextInput
            testID="premium-shell-guide-input"
            value={text}
            onChangeText={setText}
            placeholder="Ask about today"
            placeholderTextColor={t.color.placeholder}
            style={[styles.input, { color: t.color.ink }]}
          />
          <IconButton icon="send" label="Send" tone="ink" size={44} onPress={() => setText('')} />
        </View>
      }
    >
      <Text variant="body" tone="muted">
        The guide's chat sheet opens here from the tab bar's search-role circle.
      </Text>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  composer: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15 },
});
