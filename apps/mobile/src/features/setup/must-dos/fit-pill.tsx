/**
 * The pill at the end of a must-do or a search result: FITS (FITS DAY n once there is a draft)
 * in green, TIGHT in yellow, CLASH in pink, BOOK AHEAD and the lottery in orange. Always a word,
 * never colour alone.
 */
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme, type Theme } from '@/ui/theme';

import { pillLabel } from './lines';
import type { FitPill as Pill } from './model';

const useStyles = makeStyles((th) => ({
  pill: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
    flexShrink: 0,
  },
}));

function fill(theme: Theme, pill: Pill): string {
  switch (pill.kind) {
    case 'fits':
      return theme.semantic.state.success;
    case 'tight':
      return theme.color.yellow;
    case 'clash':
      return theme.semantic.state.urgent;
    case 'book_ahead':
    case 'lottery':
      return theme.color.orange;
  }
}

export function FitPill({ pill, testID }: { readonly pill: Pill; readonly testID?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  return (
    <View style={[styles.pill, { backgroundColor: fill(theme, pill) }]} testID={testID}>
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {pillLabel(pill, locale)}
      </Text>
    </View>
  );
}
