/** The words of a driver card's lines (6c-2): each line's label and what it says. */
import type { DriverCard, DriverField, IncludeKey } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { money } from '../../shared/format';
import { usePriceWords } from '../../shared/price-text';

export function useCardCopy(current: DriverCard) {
  const { t } = useLingui();
  const locale = useLocale();
  const words = usePriceWords();
  const seats = current.seats;
  const lineText = (field: DriverField): string | null => {
    switch (field) {
      case 'phone':
        return current.phone;
      case 'languages':
        return current.languages.length === 0 ? null : current.languages.join(', ');
      case 'car':
        return current.car === null && current.seats === null
          ? null
          : [
              current.car,
              seats === null ? null : t({ id: 'drivers.check.seats', message: `${seats} seats` }),
            ]
              .filter((part): part is string => part !== null)
              .join(' · ');
      case 'price': {
        const amount = words.price(current);
        if (amount === null) return null;
        const hours = current.included_hours;
        if (hours === null) return amount;
        return current.price_per === 'hour'
          ? t({
              id: 'drivers.check.priceLeastHours',
              message: `${amount} · ${hours} hours or more`,
            })
          : t({ id: 'drivers.check.priceHours', message: `${amount} · ${hours} hours` });
      }
      case 'overtime':
        return money(current.overtime_minor, current.currency, locale);
      case 'name':
      case 'includes':
        return null;
    }
  };
  const label: Readonly<Record<DriverField, string>> = {
    name: t({ id: 'drivers.line.name', message: 'Name' }),
    phone: t({ id: 'drivers.line.phone', message: 'WhatsApp' }),
    languages: t({ id: 'drivers.line.languages', message: 'Speaks' }),
    car: t({ id: 'drivers.line.car', message: 'Car' }),
    price: t({ id: 'drivers.line.price', message: 'Price' }),
    includes: t({ id: 'drivers.line.includes', message: 'What the price includes' }),
    overtime: t({ id: 'drivers.line.overtime', message: 'Overtime an hour' }),
  };
  const includeLabel: Readonly<Record<IncludeKey, string>> = {
    fuel: t({ id: 'drivers.include.fuel', message: 'Fuel' }),
    parking: t({ id: 'drivers.include.parking', message: 'Parking' }),
    tolls: t({ id: 'drivers.include.tolls', message: 'Tolls' }),
    entry: t({ id: 'drivers.include.entry', message: 'Entry' }),
  };
  return { lineText, label, includeLabel };
}
