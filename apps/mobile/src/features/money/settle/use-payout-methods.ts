/**
 * Your payout methods, for any editor: read from the api (never stored on the device) and saved
 * with `set_payout_method` (encrypted on the server). Saving is online only: with no signal it says
 * so and nothing is shown as saved.
 */
import { payoutKindsFor, type PayoutKind, type RevealedPayoutMethod } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useCommandFeedback } from '@/motion/island-toast';

import { setPayoutMethodCommand } from '../data/commands';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyServices } from '../data/services';
import { useMoneyContext } from '../data/use-money-context';
import { validDetails } from './payout-details';

export interface PayoutMethodsState {
  readonly kinds: readonly PayoutKind[];
  readonly saved: readonly RevealedPayoutMethod[];
  readonly kind: PayoutKind;
  readonly values: Record<string, string>;
  readonly loading: boolean;
  readonly busy: boolean;
  /** The saved method payers see first, if the member picked one. */
  readonly defaultKind: PayoutKind | null;
  readonly pick: (kind: PayoutKind) => void;
  readonly setValue: (field: string, value: string) => void;
  /** Saves the picked kind; `makeDefault` set to true or false also moves the default. */
  readonly save: (options?: { readonly makeDefault?: boolean }) => Promise<boolean>;
  readonly remove: () => Promise<boolean>;
}

export function usePayoutMethods(): PayoutMethodsState {
  const ctx = useMoneyContext(useSelectedTrip());
  const services = useMoneyServices();
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const command = useCommand(setPayoutMethodCommand);
  const kinds = payoutKindsFor(ctx.homeCountry);
  const [saved, setSaved] = useState<readonly RevealedPayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<PayoutKind>(kinds[0] ?? 'bank');
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void services.myPayoutMethods().then((outcome) => {
      if (!live) return;
      setLoading(false);
      if (outcome.kind === 'ok') setSaved(outcome.value);
    });
    return () => {
      live = false;
    };
  }, [services]);

  const pick = (next: PayoutKind) => {
    setKind(next);
    const existing = saved.find((method) => method.kind === next);
    setValues(existing === undefined ? {} : (existing.details as Record<string, string>));
  };

  async function send(remove: boolean, makeDefault: boolean | undefined): Promise<boolean> {
    const details = remove ? {} : validDetails(kind, values);
    if (details === null || command.pending) return false;
    const result = await command.send({
      kind,
      ...(ctx.homeCountry === null ? {} : { country: ctx.homeCountry }),
      details,
      remove,
      ...(makeDefault === undefined || remove ? {} : { default: makeDefault }),
    });
    const outcome = report(result, {
      id: 'money-payout',
      done: remove
        ? t({ id: 'money.payout.removed', message: 'Removed.' })
        : t({ id: 'money.payout.saved', message: 'Saved. Only the person paying you sees it.' }),
    });
    if (outcome !== 'done') return false;
    const methods = await services.myPayoutMethods();
    if (methods.kind === 'ok') setSaved(methods.value);
    return true;
  }

  return {
    kinds,
    saved,
    kind,
    values,
    loading,
    busy: command.pending,
    defaultKind: saved.find((method) => method.is_default === true)?.kind ?? null,
    pick,
    setValue: (field, value) => setValues((current) => ({ ...current, [field]: value })),
    save: (options) => send(false, options?.makeDefault),
    remove: () => send(true, undefined),
  };
}
