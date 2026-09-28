import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '../cards/Card';
import { Toggle } from '../inputs/Toggle';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

export interface PrimerCardProps {
  readonly title: string;
  readonly body: string;
  readonly demo: ReactNode;
  readonly value: boolean;
  readonly onValueChange: (next: boolean) => void;
  /** Shown under the card when the OS refused (snap-back + "Open Settings"). */
  readonly footer?: ReactNode;
  readonly busy?: boolean;
  readonly testID?: string;
}

/**
 * One 3a-9 permission card: a live demo of what it does, the plain-words why, and a toggle that
 * starts OFF. Flipping it on is the ask; the OS prompt follows only then.
 */
export function PrimerCard({
  title,
  body,
  demo,
  value,
  onValueChange,
  footer,
  busy = false,
  testID,
}: PrimerCardProps) {
  const theme = useTheme();
  return (
    <Card tone="raised" {...(testID ? { testID } : {})}>
      <View style={styles.row}>
        {demo}
        <View style={styles.copy}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {body}
          </Text>
        </View>
        <Toggle
          value={value}
          onValueChange={onValueChange}
          label={title}
          disabled={busy}
          {...(testID ? { testID: `${testID}-toggle` } : {})}
        />
      </View>
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  copy: { flex: 1, gap: 4 },
});
