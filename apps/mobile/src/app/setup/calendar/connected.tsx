import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CalendarConnectedScreen } from '@/features/setup/calendar/connected-screen';
import { parseOAuthReturn } from '@/features/setup/calendar/oauth';
import { PremiumCalendarConnectedView } from '@/features/setup/premium/calendar/connected-view';

/** A Google or Outlook calendar sign-in coming back (`critterpass://setup/calendar/connected`). */
export default function CalendarConnectedRoute() {
  const params = useLocalSearchParams();
  const result = useMemo(() => parseOAuthReturn(params), [params]);
  return <CalendarConnectedScreen result={result} View={PremiumCalendarConnectedView} />;
}
