/** Expense categories: the doodle each shows and its label (stays / food / transit / fun / other). */
import type { ExpenseCategory } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';

import type { DoodleName } from '@/ui/icons/generated';

export const CATEGORY_ORDER: readonly ExpenseCategory[] = [
  'stays',
  'food',
  'transit',
  'fun',
  'other',
];

export const CATEGORY_ICON: Readonly<Record<ExpenseCategory, DoodleName>> = {
  stays: 'bed',
  food: 'food',
  transit: 'car',
  fun: 'ticket',
  other: 'wallet',
};

export function useCategoryLabel(): (category: ExpenseCategory) => string {
  const { t } = useLingui();
  return useCallback(
    (category: ExpenseCategory) => {
      switch (category) {
        case 'stays':
          return t({ id: 'money.category.stays', message: 'Stays' });
        case 'food':
          return t({ id: 'money.category.food', message: 'Food' });
        case 'transit':
          return t({ id: 'money.category.transit', message: 'Transit' });
        case 'fun':
          return t({ id: 'money.category.fun', message: 'Fun' });
        case 'other':
          return t({ id: 'money.category.other', message: 'Other' });
      }
    },
    [t],
  );
}
