/**
 * Your payout methods: read from the api (never stored on the device) and saved with
 * `set_payout_method` (encrypted on the server).
 */
import { PayoutMethodsEditor } from './PayoutMethodsEditor';
import { usePayoutMethods } from './use-payout-methods';

export function PayoutMethodsScreen() {
  const methods = usePayoutMethods();
  return (
    <PayoutMethodsEditor
      kinds={methods.kinds}
      saved={methods.saved}
      kind={methods.kind}
      values={methods.values}
      loading={methods.loading}
      busy={methods.busy}
      onKind={methods.pick}
      onValue={methods.setValue}
      onSave={() => void methods.save()}
      onRemove={() => void methods.remove()}
    />
  );
}
