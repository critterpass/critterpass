import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import { LineIcon } from '../components/LineIcon';

/** A line where cards would be (no days forecast yet, nothing at risk), set on a card like them. */
export function NoteCard({
  icon,
  children,
  testID,
}: {
  readonly icon: 'calendar' | 'shield';
  readonly children: string;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <View
      style={[
        styles.note,
        {
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID={testID}
    >
      <LineIcon name={icon} size={22} color={th.color.muted} />
      <Text variant="rowText" tone="inkSecondary" style={styles.line}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  line: { flex: 1, minWidth: 0 },
});
