import { useLocalSearchParams } from 'expo-router';

import { alarmSheetKind } from '@/features/trip/alarm/alarm-sheet-action';
import { AlarmSheetPremium } from '@/features/trip/premium/alarm/AlarmSheetPremium';
import { PresentedState } from '@/ui/premium/shell';

/** The leave-by alarm's permission sheet over the day page (a native fit sheet). */
export default function TripAlarmSheetRoute() {
  const { kind, guide } = useLocalSearchParams<{ kind?: string; guide?: string }>();
  const sheet = alarmSheetKind(kind);
  // A link with a kind this build doesn't know: the sheet says so, never opens blank.
  if (sheet === null)
    return <PresentedState state={{ kind: 'missing' }} testID="alarm-sheet-missing" />;
  return <AlarmSheetPremium kind={sheet} guideName={typeof guide === 'string' ? guide : ''} />;
}
