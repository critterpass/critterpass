/**
 * Which trip a shared plan goes into, premium: for a plan opened outside a trip (Explore, a link),
 * the person's trips still being planned and a new trip to the plan's destination, on a sheet over
 * the plan. No render shows it; built from the kit's sheet, rows and button.
 */
import { useLingui } from '@lingui/react/macro';

import { PremiumSheet } from '@/features/album';
import { Button, Icon, ListCard, Row, Text, usePremiumTheme } from '@/ui/premium';

import { useDraftTrips, type TripPickerProps } from '../detail/draft-trips';

export function TripPickerPremium(props: TripPickerProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const rows = useDraftTrips(props.destinationId);
  const place = props.destinationName;
  const chevron = <Icon name="forward" size={16} color={th.color.placeholder} />;
  return (
    <PremiumSheet
      title={t({ id: 'community.picker.title', message: 'Which trip?' })}
      onClose={props.onClose}
      testID="shared-plan-trip-picker"
    >
      {rows.length === 0 ? (
        <Text variant="body" tone="muted">
          {t({
            id: 'community.picker.none',
            message: `You have no trip being planned. Start one to ${place} and this plan goes straight in.`,
          })}
        </Text>
      ) : (
        <ListCard testID="shared-plan-trip-picker-trips">
          {rows.map((trip) => {
            const organiser = trip.role === 'organiser';
            return (
              <Row
                key={trip.id}
                title={trip.destination ?? t({ id: 'community.picker.unnamed', message: 'A trip' })}
                subtitle={
                  organiser
                    ? t({ id: 'community.picker.copy', message: 'Copy the plan into its draft' })
                    : t({ id: 'community.picker.suggest', message: 'Suggest it to the organiser' })
                }
                trailing={chevron}
                onPress={() => {
                  props.onClose();
                  props.onPick({ tripId: trip.id, organiser });
                }}
              />
            );
          })}
        </ListCard>
      )}
      <Button
        label={t({ id: 'community.picker.start', message: 'Start a trip with this plan' })}
        onPress={() => {
          props.onClose();
          props.onStart();
        }}
        testID="shared-plan-trip-picker-start"
      />
    </PremiumSheet>
  );
}
