/**
 * The day's timeline under the pack list (3k-2): mono time over how long the stop takes, title,
 * and a subline ("Tickets in Bookings" opens the wallet; any other stop opens in the day plan),
 * with the travel to the next stop between two rows. Items only part of the crew goes to, and a
 * stop I skip for myself, are dimmed, with who is going (or that I am skipping it) as the subline.
 * Today, a stop already over carries a tick, and the one on now and the next one say so.
 */
import { useLingui } from '@lingui/react/macro';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface DayTimelineEntry {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly detail: string | null;
  /** Not mine: someone else's subgroup, or a stop I skip. */
  readonly dimmed: boolean;
  readonly onPress?: () => void;
  /** "1h30": how long the stop takes. */
  readonly length?: string | null | undefined;
  /** "Car · 20 min": the travel to the next stop. */
  readonly legAfter?: string | null | undefined;
  /** Today only: over, on now, or next. */
  readonly moment?: 'done' | 'now' | 'next' | null | undefined;
}

const useStyles = makeStyles((th) => ({
  row: {
    paddingVertical: th.space['14'],
    borderTopWidth: 1,
    borderTopColor: th.semantic.bg.control,
  },
  time: { width: th.space['32'] * 2 - th.space['8'], gap: th.space['2'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  title: { flex: 1, minWidth: 0 },
  leg: { paddingStart: th.space['32'] * 2 + th.space['4'], paddingBottom: th.space['10'] },
}));

function Entry({ entry }: { readonly entry: DayTimelineEntry }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const done = entry.moment === 'done';
  const mark =
    entry.moment === 'now'
      ? t({ id: 'trip.dayOf.now', message: 'Now' })
      : entry.moment === 'next'
        ? t({ id: 'trip.dayOf.next', message: 'Next' })
        : null;
  const body = (
    <Row style={[styles.row, { opacity: entry.dimmed || done ? 0.5 : 1 }]} gap="12">
      <Stack style={styles.time}>
        <Text variant="monoData" color={theme.semantic.text.secondary}>
          {done ? `✓ ${entry.time}` : entry.time}
        </Text>
        {entry.length == null ? null : (
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {entry.length}
          </Text>
        )}
      </Stack>
      <Stack gap="2" flex={1}>
        <Row style={styles.titleRow}>
          <Text variant="title" style={styles.title}>
            {upper(entry.title, locale)}
          </Text>
          {mark === null ? null : (
            <Text variant="label" color={theme.semantic.action.primary}>
              {upper(mark, locale)}
            </Text>
          )}
        </Row>
        {entry.detail === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {entry.detail}
          </Text>
        )}
      </Stack>
    </Row>
  );
  const label = [mark, entry.time, entry.length, entry.title, entry.detail]
    .filter(Boolean)
    .join(', ');
  const leg =
    entry.legAfter == null ? null : (
      <Text variant="label" color={theme.semantic.text.secondary} style={styles.leg}>
        {upper(entry.legAfter, locale)}
      </Text>
    );
  if (entry.onPress === undefined) {
    return (
      <Stack>
        <Stack accessible accessibilityRole="text" accessibilityLabel={label}>
          {body}
        </Stack>
        {leg}
      </Stack>
    );
  }
  return (
    <Stack>
      <PressScale
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={entry.onPress}
        testID={`trip-day-item-${entry.id}`}
      >
        {body}
      </PressScale>
      {leg}
    </Stack>
  );
}

export function DayTimeline({ entries }: { readonly entries: readonly DayTimelineEntry[] }) {
  return (
    <Stack testID="trip-day-timeline">
      {entries.map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </Stack>
  );
}
