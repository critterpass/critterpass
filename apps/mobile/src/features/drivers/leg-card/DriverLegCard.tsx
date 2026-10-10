/**
 * A day that needs a driver (6a-1), under the day on the trip plan: why (read from the day itself:
 * a long day far from the stay, a late return from far out, or no ride app here), FIND A DRIVER
 * and NOT NOW. NOT NOW folds the card to a NO RIDE flag, for me only. A day with a driver set says
 * who drives instead.
 */
import type { GapStop } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { driversRoute } from '../shared/routes';
import { useDriverLeg } from './use-driver-leg';

export interface DriverLegCardProps {
  readonly tripId: string;
  readonly date: string | null;
  readonly stops: readonly GapStop[];
  readonly stay: { readonly lat: number; readonly lng: number } | null;
  readonly guide: string;
}

export function DriverLegCard({ tripId, date, stops, stay, guide }: DriverLegCardProps) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const leg = useDriverLeg(tripId, date, stops, stay);
  if (leg.kind === 'none' || date === null) return null;
  if (leg.kind === 'assigned') {
    return (
      <Text variant="label" color={theme.color.green.base} testID="driver-leg-assigned">
        {upper(t({ id: 'drivers.leg.assigned', message: `${leg.name} drives this day` }), locale)}
      </Text>
    );
  }
  if (leg.kind === 'no_ride') {
    return (
      <Text variant="label" color={theme.color.orange} testID="driver-leg-no-ride">
        {upper(t({ id: 'drivers.leg.noRide', message: 'No ride' }), locale)}
      </Text>
    );
  }
  const { gap } = leg;
  const place = gap.place;
  const why =
    gap.reason === 'late_return'
      ? t({
          id: 'drivers.leg.why.late',
          message: `You come back late from ${place}, and ride apps rarely pick up out there at night. A driver for the evening is the safe way back.`,
        })
      : gap.reason === 'no_ride_app'
        ? t({
            id: 'drivers.leg.why.noApp',
            message: `There's no ride app here, and this day has real distances between stops. Most crews hire a driver for the day.`,
          })
        : t({
            id: 'drivers.leg.why.dayOut',
            message: `${place} is about ${gap.km} km out and the day is long. Ride apps rarely wait or pick up out there. Most crews hire a driver for the day.`,
          });
  const sticker = guideSticker(guide);
  return (
    <View
      testID="driver-leg-card"
      style={{
        borderRadius: theme.radius.lg,
        borderWidth: 2,
        borderColor: theme.color.yellow,
        backgroundColor: theme.semantic.bg.control,
        padding: theme.space['16'],
      }}
    >
      <Stack gap="12">
        <Row gap="12" align="flex-start">
          <Sticker kind={sticker.kind} name={sticker.name} pose="wave" size={44} />
          <Stack gap="4" style={{ flex: 1 }}>
            <Text variant="title">
              {upper(t({ id: 'drivers.leg.title', message: 'Need a driver here?' }), locale)}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {why}
            </Text>
          </Stack>
        </Row>
        <Row gap="8">
          <View style={{ flex: 1 }}>
            <PillButton
              label={t({ id: 'drivers.leg.find', message: 'Find a driver' })}
              tone="yellow"
              size="sm"
              block
              onPress={() => router.push(driversRoute(tripId, 'index', { days: date }))}
              testID="driver-leg-find"
            />
          </View>
          <View style={{ flex: 1 }}>
            <PillButton
              label={t({ id: 'drivers.leg.notNow', message: 'Not now' })}
              variant="secondary"
              size="sm"
              block
              onPress={leg.notNow}
              testID="driver-leg-not-now"
            />
          </View>
        </Row>
      </Stack>
    </View>
  );
}
