/** The flight card's words: the status and who else is on board. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import type { FlightChip } from './flight-model';

export function useChipLabel(): (chip: FlightChip, delayMin: number) => string {
  const { t } = useLingui();
  return (chip, delayMin) => {
    switch (chip) {
      case 'on_time':
        return t({ id: 'bookings.flight.onTime', message: 'On time' });
      case 'scheduled':
        return t({ id: 'bookings.flight.scheduled', message: 'Scheduled' });
      case 'delayed':
        return delayMin > 0
          ? t({ id: 'bookings.flight.delayedBy', message: `Delayed ${delayMin}m` })
          : t({ id: 'bookings.flight.delayed', message: 'Delayed' });
      case 'gate_change':
        return t({ id: 'bookings.flight.gateChange', message: 'Gate change' });
      case 'boarding':
        return t({ id: 'bookings.flight.boarding', message: 'Boarding' });
      case 'departed':
        return t({ id: 'bookings.flight.departed', message: 'Departed' });
      case 'landed':
        return t({ id: 'bookings.flight.landed', message: 'Landed' });
      case 'cancelled':
        return t({ id: 'bookings.flight.cancelled', message: 'Cancelled' });
      case 'diverted':
        return t({ id: 'bookings.flight.diverted', message: 'Diverted' });
    }
  };
}

/** "Maya and Alex are on this flight." / "Maya is on this flight." / "" when flying alone. */
export function useCoTravellerLine(): (names: readonly string[]) => string {
  const { t } = useLingui();
  const locale = useLocale();
  return (names) => {
    if (names.length === 0) return '';
    const who = format.list(locale, names);
    return names.length === 1
      ? t({ id: 'bookings.flight.crewOne', message: `${who} is on this flight.` })
      : t({ id: 'bookings.flight.crewMany', message: `${who} are on this flight.` });
  };
}

/** "Updated 09:12": when the status was last reported. The data vendor is never named. */
export function useUpdatedLine(): (at: string) => string {
  const { t } = useLingui();
  return (at) => t({ id: 'bookings.flight.updated', message: `Updated ${at}` });
}
