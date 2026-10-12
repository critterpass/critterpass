/**
 * This person's own calendar on the dates step (4.10): whether their free days are in, how fresh,
 * and the one thing to do about it (connect, sync again, mark by hand).
 */
import { View } from 'react-native';

import { Button, Card, Text, usePremiumTheme } from '@/ui/premium';

import type { ownCalendarWords } from '../../when/own-calendar-row';

export function OwnCalendarCard({
  own,
  status,
}: {
  readonly own: ReturnType<typeof ownCalendarWords>;
  readonly status: string;
}) {
  const theme = usePremiumTheme();
  return (
    <Card
      testID={`own-calendar-${own.stale ? 'stale' : status}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        padding: theme.space.rowPadH,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{own.title}</Text>
        <Text variant="captionMuted" tone="muted">
          {own.line}
        </Text>
      </View>
      <Button
        label={own.action.label}
        size="small"
        variant="control"
        onPress={own.action.onPress}
        testID="own-calendar-action"
      />
    </Card>
  );
}
