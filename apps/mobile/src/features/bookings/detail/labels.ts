/** The wallet's word for each kind of booking. */
import type { BookingKind } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

export function useKindLabel(): (kind: BookingKind) => string {
  const { t } = useLingui();
  return (kind) => {
    switch (kind) {
      case 'flight':
        return t({ id: 'bookings.kind.flight', message: 'Flight' });
      case 'stay':
        return t({ id: 'bookings.kind.stay', message: 'Stay' });
      case 'activity':
        return t({ id: 'bookings.kind.activity', message: 'Activity' });
      case 'boat':
        return t({ id: 'bookings.kind.boat', message: 'Boat' });
      case 'transfer':
        return t({ id: 'bookings.kind.transfer', message: 'Transfer' });
      case 'rail':
        return t({ id: 'bookings.kind.rail', message: 'Train' });
      case 'car':
        return t({ id: 'bookings.kind.car', message: 'Car hire' });
      case 'other':
        return t({ id: 'bookings.kind.other', message: 'Other' });
    }
  };
}
