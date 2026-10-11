/**
 * Export the trip's books (CSV) through the phone's share sheet, from the synced rows, so it works
 * offline. The file is written to the cache and handed to the share sheet; nothing is uploaded.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- a MIME type, a UTI and a file name, never copy. */
import { useLingui } from '@lingui/react/macro';
import type * as ExpoFileSystemModule from 'expo-file-system';
import type * as SharingModule from 'expo-sharing';
import { useState } from 'react';

import { useCategoryLabel } from '../components/category';
import { expenseItems } from '../data/expense-items';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { expensesCsv } from './expenses-csv';

export type ExportOutcome = 'shared' | 'empty' | 'unavailable' | 'failed';

async function shareCsv(csv: string, name: string): Promise<'shared' | 'unavailable'> {
  const { File, Paths } = require('expo-file-system') as typeof ExpoFileSystemModule;
  const sharing = require('expo-sharing') as typeof SharingModule;
  if (!(await sharing.isAvailableAsync())) return 'unavailable';
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(csv);
  try {
    await sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  } finally {
    if (file.exists) file.delete();
  }
  return 'shared';
}

export function useExportExpenses() {
  const { t } = useLingui();
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const categoryName = useCategoryLabel();
  const [busy, setBusy] = useState(false);
  const crewCurrency = ctx.crew?.settlementCurrency ?? 'USD';

  const exportCsv = async (): Promise<ExportOutcome> => {
    if (ctx.trip === null || busy) return 'failed';
    const items = expenseItems({
      expenses: rows.expenses,
      shares: rows.shares,
      pending: rows.pending,
      members: ctx.members,
      tripId: ctx.trip.id,
      tz: ctx.trip.tz,
      crewCurrency,
    });
    if (items.length === 0) return 'empty';
    const csv = expensesCsv({
      items,
      shares: rows.shares,
      members: ctx.members.map((member) => ({ userId: member.userId, name: member.name })),
      crewCurrency,
      categoryName,
      headings: {
        date: t({ id: 'money.export.date', message: 'Date' }),
        what: t({ id: 'money.export.what', message: 'What' }),
        category: t({ id: 'money.export.category', message: 'Category' }),
        paidBy: t({ id: 'money.export.paidBy', message: 'Paid by' }),
        amount: t({ id: 'money.export.amount', message: 'Amount' }),
        currency: t({ id: 'money.export.currency', message: 'Currency' }),
        crewAmount: t({ id: 'money.export.crewAmount', message: `In ${crewCurrency}` }),
      },
    });
    setBusy(true);
    try {
      return await shareCsv(csv, `critterpass-expenses-${ctx.trip.id.slice(0, 8)}.csv`);
    } catch {
      return 'failed';
    } finally {
      setBusy(false);
    }
  };

  return { busy, ready: rows.loaded && ctx.trip !== null, exportCsv };
}
