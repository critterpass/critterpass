import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { AllDaysScreen } from '@/features/plan/all-days/all-days-screen';
import { PremiumAllDaysView } from '@/features/plan/premium/all-days/all-days-view';
import {
  PremiumMovePreview,
  PremiumMoveStopSheet,
} from '@/features/plan/premium/all-days/move-sheets';
import { usePremiumUi } from '@/lib/premium-ui';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);
const PREMIUM_MOVE_SHEETS = { Move: PremiumMoveStopSheet, Preview: PremiumMovePreview };

/** All days (7b-3): `/{tripId}/plan/days?from={n}`, the day it was opened from. */
export default function AllDaysRoute() {
  const { tripId, from } = useLocalSearchParams<{ tripId: string; from?: string }>();
  const premium = usePremiumUi();
  return (
    <CalendarWriterProvider value={writer}>
      <AllDaysScreen
        tripId={tripId ?? ''}
        from={from === undefined ? null : Number(from)}
        {...(premium ? { View: PremiumAllDaysView, sheets: PREMIUM_MOVE_SHEETS } : {})}
      />
    </CalendarWriterProvider>
  );
}
