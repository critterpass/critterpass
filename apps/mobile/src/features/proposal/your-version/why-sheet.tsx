/**
 * Why a pick is on the reader's version: the stop's day, time and the day's theme, the reason in
 * a sentence that is true for this reader, and what the guide wrote about the stop. Before
 * answering, the reader can look closer from here: the place's own page (hours, photos, where it
 * is) and the stop's day in the plan, where a stop takes a question for the crew. The body is
 * padded like the sheet's own title.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
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
  /** Opens the place's page; absent for a stop with no place on file. */
  readonly onPlace?: (() => void) | undefined;
  /** Opens the stop's day in the plan, where it can be asked about. */
  readonly onDay?: (() => void) | undefined;
  readonly onDismiss: () => void;
}

export function WhySheet({ pick, when, reason, onPlace, onDay, onDismiss }: WhySheetProps) {
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
        {onPlace === undefined ? null : (
          <TextLink
            label={t({ id: 'proposal.why.seePlace', message: 'See the place' })}
            onPress={onPlace}
            testID="version-why-place"
          />
        )}
        {onDay === undefined ? null : (
          <TextLink
            label={t({ id: 'proposal.why.seeDay', message: 'Open its day and ask about it' })}
            onPress={onDay}
            testID="version-why-day"
          />
        )}
      </View>
    </Sheet>
  );
}
