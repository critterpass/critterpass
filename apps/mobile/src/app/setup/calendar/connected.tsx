import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CalendarConnectedScreen } from '@/features/setup/calendar/connected-screen';
import { parseOAuthReturn } from '@/features/setup/calendar/oauth';
import { PremiumCalendarConnectedView } from '@/features/setup/premium/calendar/connected-view';
import { usePremiumUi } from '@/lib/premium-ui';

/** A Google or Outlook calendar sign-in coming back (`critterpass://setup/calendar/connected`). */
export default function CalendarConnectedRoute() {
  const params = useLocalSearchParams();
  const result = useMemo(() => parseOAuthReturn(params), [params]);
  const premium = usePremiumUi();
  return (
    <CalendarConnectedScreen
      result={result}
      {...(premium ? { View: PremiumCalendarConnectedView } : {})}
    />
  );
}
