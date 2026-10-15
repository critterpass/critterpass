import { useLocalSearchParams } from 'expo-router';

import { ChangeDaySheet } from '@/features/plan/draft';
import {
  PremiumBoostOffer,
  PremiumDraftSheetWaiting,
} from '@/features/plan/premium/draft/change-day-parts';
import { PremiumChangeDayView } from '@/features/plan/premium/draft/change-day-view';

const PREMIUM_LOOK = {
  View: PremiumChangeDayView,
  Waiting: PremiumDraftSheetWaiting,
  Boost: PremiumBoostOffer,
};

/** The change-a-day sheet over the draft (`/{tripId}/draft/change-day?day=&free=`). */
export default function ChangeDayRoute() {
  const { tripId, day, free } = useLocalSearchParams<{
    tripId: string;
    day?: string;
    free?: string;
  }>();
  const initialDay = day === undefined ? null : Number(day) || null;
  return (
    <ChangeDaySheet
      tripId={tripId}
      initialDay={initialDay}
      free={free === '1'}
      look={PREMIUM_LOOK}
    />
  );
}
