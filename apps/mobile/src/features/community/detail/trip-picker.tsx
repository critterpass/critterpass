/**
 * Which trip a shared plan goes into, for a plan opened outside a trip (Explore, a link): the
 * person's trips still being planned, and a new trip to the plan's destination. Built from the
 * sheet and settings rows; no render shows it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and test ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLiveRows } from '@/data/powersync/live-rows';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { PillButton } from '@/ui/buttons/PillButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import type { TakeTarget } from './use-take-plan';

/** Trips whose plan is still open, the plan's own destination first, then the newest. */
const DRAFT_TRIPS_SQL = `
  SELECT t.id, d.name AS destination, p.role
    FROM trips t
    JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
    LEFT JOIN destinations d ON d.id = t.destination_id
   WHERE t.status IN ('setup', 'drafting', 'draft_review', 'redrafting', 'proposed')
   ORDER BY (t.destination_id = ?) DESC, t.id DESC
   LIMIT 8`;
const DRAFT_TRIPS_TABLES = ['trips', 'trip_participants', 'destinations'];

interface DraftTripRow {
  readonly id: string;
  readonly destination: string | null;
  readonly role: string | null;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['20'], gap: th.space['16'] },
}));

export interface TripPickerProps {
  readonly destinationId: string;
  readonly destinationName: string;
  readonly onPick: (target: TakeTarget) => void;
  readonly onStart: () => void;
  readonly onClose: () => void;
}

export function TripPicker(props: TripPickerProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const uid = useSessionUid();
  const trips = useLiveRows<DraftTripRow>(
    DRAFT_TRIPS_SQL,
    uid === null ? null : [uid, props.destinationId],
    DRAFT_TRIPS_TABLES,
  );
  const place = props.destinationName;
  const title = t({ id: 'community.picker.title', message: 'Which trip?' });
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="shared-plan-trip-picker"
    >
      <View style={styles.body}>
        {trips.rows.length === 0 ? (
          <SecondaryText>
            {t({
              id: 'community.picker.none',
              message: `You have no trip being planned. Start one to ${place} and this plan goes straight in.`,
            })}
          </SecondaryText>
        ) : (
          <SettingsGroup
            rows={trips.rows.map((trip) => {
              const organiser = trip.role === 'organiser';
              return {
                key: trip.id,
                kind: 'value' as const,
                title: trip.destination ?? t({ id: 'community.picker.unnamed', message: 'A trip' }),
                subtitle: organiser
                  ? t({ id: 'community.picker.copy', message: 'Copy the plan into its draft' })
                  : t({ id: 'community.picker.suggest', message: 'Suggest it to the organiser' }),
                value: '',
                onPress: () => {
                  props.onClose();
                  props.onPick({ tripId: trip.id, organiser });
                },
              };
            })}
            testID="shared-plan-trip-picker-trips"
          />
        )}
        <PillButton
          block
          tone="yellow"
          label={t({ id: 'community.picker.start', message: 'Start a trip with this plan' })}
          onPress={() => {
            props.onClose();
            props.onStart();
          }}
          testID="shared-plan-trip-picker-start"
        />
      </View>
    </Sheet>
  );
}
