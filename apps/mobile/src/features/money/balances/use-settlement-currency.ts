/**
 * Switching the crew currency, for any sheet: re-rates the whole ledger on the server, so it goes
 * online; on success it says so and closes, otherwise it keeps the sheet open with an error.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion/island-toast';

import { setSettlementCurrencyCommand } from '../data/commands';

export function useSettlementCurrency(crewId: string, current: string, onDone: () => void) {
  const { t } = useLingui();
  const { send, pending } = useCommand(setSettlementCurrencyCommand);
  const [error, setError] = useState(false);

  async function pick(currency: string) {
    if (currency === current || pending) return;
    setError(false);
    const result = await send({ crew_id: crewId, currency });
    if (result.kind === 'applied') {
      toast.show({
        id: 'money-currency',
        title: t({ id: 'money.currency.done', message: `Balances now in ${currency}` }),
        subtitle: t({
          id: 'money.currency.doneLine',
          message: 'Every expense re-counts at the rate on the day it was spent.',
        }),
      });
      onDone();
    } else {
      setError(true);
    }
  }

  return { pending, error, pick: (currency: string) => void pick(currency) };
}
