/**
 * WHEN IT FITS (7e-1): the guide, the best day and time in big type, "Other days ›", why in two
 * clauses, and the hour bars over the open span with the slot lit, drawn left to right. Worked out
 * from opening hours, crowds and the crew's days by the fit engine; the card names its own source.
 * For a place already in the plan it leads with where it is and whether it fits there.
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
  /**
   * The place is already a stop: the card leads with where it is ("In the plan · Mon 5 at 14:00")
   * and whether it fits there, and the best slot, when it is another, is a second line.
   */
  readonly planned?: {
    readonly date: string;
    readonly time: string | null;
    readonly grade: FitDayView['grade'] | null;
  } | null;
  /** Opens the day picker; absent while Add to plan is not in the app. */
  readonly onOtherDays?: (() => void) | undefined;
}

export function WhenItFits({
  guide,
  best,
  sentence,
  bars,
  onOtherDays,
  planned = null,
}: WhenItFitsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const day = dayTitle(best.date, i18n.locale);
  const time = best.start;
  const where = planned === null ? null : dayTitle(planned.date, i18n.locale);
  const at = planned?.time ?? null;
  const elsewhere =
    planned !== null && (planned.date !== best.date || (at !== null && at !== time));
  const fitsThere =
    planned?.grade === 'good'
      ? t({ id: 'explore.detail.fits.there', message: 'It fits there.' })
      : planned?.grade === 'possible'
        ? t({ id: 'explore.detail.fits.thereCatch', message: 'It fits there, with a catch.' })
        : planned?.grade === 'no'
          ? t({ id: 'explore.detail.fits.thereNot', message: 'It doesn’t fit well there.' })
          : null;
  return (
    <View style={[styles.card, { borderColor: guide.colour }]} testID="place-detail-fits">
      <View style={styles.head}>
        <Sticker kind={guide.kind} name={guide.name} size={STICKER} />
        <View style={styles.title}>
          <Text variant="label" color={guide.colour}>
            {upper(
              where === null
                ? t({ id: 'explore.detail.fits.eyebrow', message: 'When it fits' })
                : t({ id: 'explore.detail.fits.inPlan', message: 'In the plan' }),
              i18n.locale,
            )}
          </Text>
          <Text variant="h3" testID="place-detail-fits-when">
            {upper(
              where === null
                ? t({ id: 'explore.detail.fits.when', message: `${day} at ${time}` })
                : at === null
                  ? where
                  : t({ id: 'explore.detail.fits.when', message: `${where} at ${at}` }),
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
      {where === null ? null : (
        <Text variant="body" color={theme.semantic.text.primary} singleLine={false}>
          {[
            fitsThere,
            elsewhere
              ? t({ id: 'explore.detail.fits.better', message: `${day} at ${time} works too.` })
              : null,
          ]
            .filter((part) => part !== null)
            .join(' ')}
        </Text>
      )}
      {sentence === null || where !== null ? null : (
        <Text variant="body" color={theme.semantic.text.primary} singleLine={false}>
          {sentence}
        </Text>
      )}
      {bars === null || where !== null ? null : (
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
