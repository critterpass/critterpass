/** Signed back in to a closed account, in the premium look: restore it or leave it closed. */
import { deviceAccountServices, type AccountServices } from '../../account/account-services';
import { useRestoreAccount } from '../../account/use-restore-account';
import { ClosedPremiumView } from './closed-premium-view';

export function RestorePremiumScreen({
  services = deviceAccountServices,
}: {
  readonly services?: AccountServices;
}) {
  return <ClosedPremiumView {...useRestoreAccount(services)} />;
}
