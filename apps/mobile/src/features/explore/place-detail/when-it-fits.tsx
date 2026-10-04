/**
 * WHEN IT FITS (7e-1): the guide, the best day and time in big type, "Other days ›", why in two
 * clauses, and the hour bars over the open span with the slot lit, drawn left to right. Worked out
 * from opening hours, crowds and the crew's days by the fit engine; the card names its own source.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { HourBars } from '@/ui/planning';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import type { FitBars, FitDayView } from './context';
import { barsLabel, dayTitle, hourLevels } from './model';

const STICKER = 40;

const useStyles = makeStyles((t) => ({
  card: {
    gap: t.space['10'],
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    borderWidth: 2,
    backgroundColor: t.semantic.bg.raised,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space['10'] },
  title: { flex: 1, minWidth: 0, gap: t.space['2'] },
  other: { minHeight: 44, justifyContent: 'center' },
}));

export interface WhenItFitsProps {
  readonly guide: GuideFacts;
  readonly best: FitDayView;
  readonly sentence: string | null;
  readonly bars: FitBars | null;
  /** Opens the day picker; absent while Add to plan is not in the app. */
  readonly onOtherDays?: (() => void) | undefined;
}

export function WhenItFits({ guide, best, sentence, bars, onOtherDays }: WhenItFitsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const day = dayTitle(best.date, i18n.locale);
  const time = best.start;
  return (
    <View style={[styles.card, { borderColor: guide.colour }]} testID="place-detail-fits">
      <View style={styles.head}>
        <Sticker kind={guide.kind} name={guide.name} size={STICKER} />
        <View style={styles.title}>
          <Text variant="label" color={guide.colour}>
            {upper(t({ id: 'explore.detail.fits.eyebrow', message: 'When it fits' }), i18n.locale)}
          </Text>
          <Text variant="h3" testID="place-detail-fits-when">
            {upper(
              t({ id: 'explore.detail.fits.when', message: `${day} at ${time}` }),
              i18n.locale,
            )}
          </Text>
        </View>
        {onOtherDays === undefined ? null : (
          <Pressable
            onPress={onOtherDays}
            accessibilityRole="button"
            style={styles.other}
            testID="place-detail-other-days"
          >
            <Text variant="bodySm" color={guide.colour}>
              {t({ id: 'explore.detail.fits.other', message: 'Other days ›' })}
            </Text>
          </Pressable>
        )}
      </View>
      {sentence === null ? null : (
        <Text variant="body" color={theme.semantic.text.primary} singleLine={false}>
          {sentence}
        </Text>
      )}
      {bars === null ? null : (
        <HourBars
          hours={hourLevels(bars)}
          lit={bars.lit ?? undefined}
          accessibilityLabel={barsLabel(bars)}
          testID="place-detail-bars"
        />
      )}
    </View>
  );
}
