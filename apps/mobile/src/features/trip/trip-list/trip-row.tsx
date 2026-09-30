/**
 * One trip in the switcher: the destination in the guide's colour, where the trip is ("in
 * progress", "voting", "Oct 12–19"), and a chevron into its hub.
 */
/* eslint-disable lingui/no-unlocalized-strings -- trip statuses and Intl option values, never copy. */
import { format, upper } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { guideColour, guideOr } from '../hub/guide';

export interface TripListRow {
  readonly id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly destination_name: string | null;
  readonly guide_slug: string | null;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'in_trip':
      return t({ id: 'trip.list.inProgress', message: 'in progress' });
    case 'voting':
      return t({ id: 'trip.list.voting', message: 'voting' });
    case 'won':
    case 'setup':
      return t({ id: 'trip.list.settingUp', message: 'setting up' });
    case 'drafting':
    case 'draft_review':
    case 'redrafting':
    case 'proposed':
      return t({ id: 'trip.list.planning', message: 'planning' });
    case 'post_trip':
      return t({ id: 'trip.list.home', message: 'home again' });
    default:
      return t({ id: 'trip.list.booked', message: 'coming up' });
  }
}

export function TripRow({
  trip,
  onPress,
}: {
  readonly trip: TripListRow;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const name = trip.destination_name ?? t({ id: 'trip.list.unnamed', message: 'Next trip' });
  const status = statusLabel(trip.status);
  const dates =
    trip.start_date === null
      ? null
      : format.dateInterval(
          locale,
          new Date(`${trip.start_date}T12:00:00Z`),
          new Date(`${trip.end_date ?? trip.start_date}T12:00:00Z`),
          { timeZone: 'UTC', month: 'short', day: 'numeric' },
        );
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[name, status, dates].filter(Boolean).join(', ')}
      testID={`trip-list-row-${trip.id}`}
    >
      <Row gap="12" align="center">
        <Stack gap="4" flex={1}>
          <Text variant="h2" color={guideColour(guideOr(trip.guide_slug))} autoFit>
            {upper(name, locale)}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {[status, dates].filter(Boolean).join(' · ')}
          </Text>
        </Stack>
        <Icon name="arrow" size={20} decorative color={theme.semantic.text.secondary} />
      </Row>
    </Card>
  );
}
