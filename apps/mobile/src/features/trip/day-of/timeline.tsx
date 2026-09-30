/**
 * The day's timeline under the pack list (3k-2): mono time, title, and a subline ("Tickets in
 * Bookings" opens the wallet). Items only part of the crew goes to are dimmed for everyone else,
 * with who is going as the subline.
 */
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
  /** Not mine: someone else's subgroup. */
  readonly dimmed: boolean;
  readonly onPress?: () => void;
}

const useStyles = makeStyles((th) => ({
  row: {
    paddingVertical: th.space['14'],
    borderTopWidth: 1,
    borderTopColor: th.semantic.bg.control,
  },
  time: { width: th.space['32'] * 2 - th.space['8'] },
}));

function Entry({ entry }: { readonly entry: DayTimelineEntry }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const body = (
    <Row style={[styles.row, { opacity: entry.dimmed ? 0.5 : 1 }]} gap="12">
      <Text variant="monoData" color={theme.semantic.text.secondary} style={styles.time}>
        {entry.time}
      </Text>
      <Stack gap="2" flex={1}>
        <Text variant="title">{upper(entry.title, locale)}</Text>
        {entry.detail === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {entry.detail}
          </Text>
        )}
      </Stack>
    </Row>
  );
  const label = [entry.time, entry.title, entry.detail].filter(Boolean).join(', ');
  if (entry.onPress === undefined) {
    return (
      <Stack accessible accessibilityRole="text" accessibilityLabel={label}>
        {body}
      </Stack>
    );
  }
  return (
    <PressScale
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={entry.onPress}
      testID={`trip-day-item-${entry.id}`}
    >
      {body}
    </PressScale>
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
