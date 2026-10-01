import {
  buildFlightLaAttributes,
  buildFlightLaState,
  buildLeaveByLaAttributes,
  buildLeaveByLaState,
  generateUuidV7,
  LA_KIND_SPECS,
  type FlightLaInput,
  type LeaveByLaInput,
} from '@cp/domain';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { getLiveActivityPort } from '../../../modules/cp-live-activity';
import { Scaffold, Text } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Starts real local Live Activities from the domain builders with the 5a-1 (Batur leave-by, Tokek,
 * four of six up) and 5a-3 (SQ 938 SIN → DPS) inputs, so a device run can capture the lock screen
 * and the Dynamic Island beside their renders. Nothing here reaches the server.
 */
function leaveByInput(now: Date): LeaveByLaInput {
  const crew = ['Maya', 'Rin', 'Dev', 'Alex', 'Sam', 'Jo'];
  return {
    leaveById: generateUuidV7(),
    tripId: generateUuidV7(),
    title: 'Summit',
    placeName: 'Trailhead',
    pickupPlace: 'villa gate',
    hasPickup: true,
    leaveAt: new Date(now.getTime() + 21 * 60_000),
    state: 'window',
    legMinutes: [20, 40, 120],
    participants: crew.map((name, i) => ({ uid: name, readiness: i < 4 ? 'up' : 'not_up' })),
    guideLine: "Headlamp's by the door.",
    labels: { stay: 'Villa', pickup: 'Pickup' },
    guide: 'tokek',
  };
}

function flightInput(now: Date): FlightLaInput {
  const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
  return {
    bookingId: generateUuidV7(),
    segmentId: generateUuidV7(),
    carrier: 'SQ',
    flightNo: '938',
    depAirport: 'SIN',
    arrAirport: 'DPS',
    source: 'mailbox',
    status: 'on_time',
    schedDepAt: minutes(80),
    estDepAt: null,
    actDepAt: null,
    schedArrAt: minutes(320),
    estArrAt: null,
    actArrAt: null,
    boardingAt: minutes(42),
    gate: 'B7',
    terminal: '3',
    seat: '14A',
    delayMin: null,
    pickup: null,
  };
}

export default function LiveActivitiesDevScreen() {
  const port = getLiveActivityPort();
  const [status, setStatus] = useState(
    port === null ? 'No Live Activity module in this build' : '',
  );

  const run = useCallback(async (label: string, start: () => Promise<string>) => {
    try {
      await start();
      setStatus(`${label} started`);
    } catch (error) {
      setStatus(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const startLeaveBy = useCallback(() => {
    if (port === null) return;
    const now = new Date();
    const input = leaveByInput(now);
    void run('Leave-by', () =>
      port.start({
        kind: 'leave_by',
        attributes: buildLeaveByLaAttributes(input),
        state: buildLeaveByLaState(input, now, 1),
        staleDate: Math.floor(now.getTime() / 1000) + LA_KIND_SPECS.leave_by.staleAfterMs / 1000,
      }),
    );
  }, [port, run]);

  const startFlight = useCallback(() => {
    if (port === null) return;
    const now = new Date();
    const input = flightInput(now);
    void run('Flight', () =>
      port.start({
        kind: 'flight',
        attributes: buildFlightLaAttributes(input),
        state: buildFlightLaState(input, 'check_in', now, 1),
      }),
    );
  }, [port, run]);

  const endAll = useCallback(async () => {
    if (port === null) return;
    const live = port.list();
    await Promise.all(live.map((a) => port.end({ kind: a.kind, id: a.id, dismissAt: 0 })));
    setStatus(`Ended ${live.length}`);
  }, [port]);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} testID="dev-live-activities">
        <Text accessibilityRole="header" variant="h3">
          Live Activities
        </Text>
        <PillButton
          label="Start leave-by (5a-1)"
          onPress={startLeaveBy}
          testID="dev-la-start-leave-by"
        />
        <PillButton
          label="Start flight (5a-3)"
          onPress={startFlight}
          testID="dev-la-start-flight"
        />
        <PillButton label="End all" onPress={() => void endAll()} testID="dev-la-end-all" />
        <Text testID="dev-la-status">{status}</Text>
      </ScrollView>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 20 },
});
