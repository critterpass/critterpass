/**
 * Your payout methods: read from the api (never stored on the device) and saved with
 * `set_payout_method` (encrypted on the server).
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
import { PayoutMethodsEditor, validDetails } from './PayoutMethodsEditor';

export function PayoutMethodsScreen() {
  const ctx = useMoneyContext(useSelectedTrip());
  const services = useMoneyServices();
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const save = useCommand(setPayoutMethodCommand);
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

  async function send(remove: boolean) {
    const details = remove ? {} : validDetails(kind, values);
    if (details === null || save.pending) return;
    const result = await save.send({
      kind,
      ...(ctx.homeCountry === null ? {} : { country: ctx.homeCountry }),
      details,
      remove,
    });
    // Online only: with no signal it says so, and nothing is shown as saved.
    const outcome = report(result, {
      id: 'money-payout',
      done: remove
        ? t({ id: 'money.payout.removed', message: 'Removed.' })
        : t({ id: 'money.payout.saved', message: 'Saved. Only the person paying you sees it.' }),
    });
    if (outcome !== 'done') return;
    const methods = await services.myPayoutMethods();
    if (methods.kind === 'ok') setSaved(methods.value);
  }

  return (
    <PayoutMethodsEditor
      kinds={kinds}
      saved={saved}
      kind={kind}
      values={values}
      loading={loading}
      busy={save.pending}
      onKind={pick}
      onValue={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      onSave={() => void send(false)}
      onRemove={() => void send(true)}
    />
  );
}
