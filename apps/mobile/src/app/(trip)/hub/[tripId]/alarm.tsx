import { useLocalSearchParams } from 'expo-router';

import { alarmSheetKind } from '@/features/trip/alarm/alarm-sheet-action';
import { AlarmSheetPremium } from '@/features/trip/premium/alarm/AlarmSheetPremium';

/** The leave-by alarm's permission sheet over the day page (a native fit sheet). */
export default function TripAlarmSheetRoute() {
  const { kind, guide } = useLocalSearchParams<{ kind?: string; guide?: string }>();
  const sheet = alarmSheetKind(kind);
  if (sheet === null) return null;
  return <AlarmSheetPremium kind={sheet} guideName={typeof guide === 'string' ? guide : ''} />;
}
