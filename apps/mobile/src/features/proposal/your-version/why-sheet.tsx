/**
 * Why a pick is on the reader's version: the stop's day, time and the day's theme, the reason in
 * a sentence that is true for this reader, and what the guide wrote about the stop. The body is
 * padded like the sheet's own title.
 */
import { View } from 'react-native';

import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { Pick } from '../data/picks';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
}));

export interface WhySheetProps {
  readonly pick: Pick;
  /** "Day 1 · 14:00". */
  readonly when: string;
  readonly reason: string;
  readonly onDismiss: () => void;
}

export function WhySheet({ pick, when, reason, onDismiss }: WhySheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const line = [when, pick.dayTheme].filter((part) => part !== null && part !== '').join(' · ');
  return (
    <Sheet title={pick.title} detents={['medium']} onDismiss={onDismiss}>
      <View style={styles.body} testID="version-why">
        {line === '' ? null : (
          <Text variant="caption" color={theme.semantic.text.secondary} singleLine={false}>
            {line}
          </Text>
        )}
        <Text variant="body" singleLine={false}>
          {reason}
        </Text>
        {pick.note === null || pick.note === '' ? null : (
          <Text variant="voice" color={theme.semantic.action.primary}>
            {pick.note}
          </Text>
        )}
      </View>
    </Sheet>
  );
}
