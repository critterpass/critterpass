import { PassScreen } from '@/features/critters/dex/pass-screen';
import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { PremiumDexScene } from '@/features/critters/premium/dex/dex-scene';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentPassRoute() {
  return (
    <LocalFirstGate>
      <PassScreen />
    </LocalFirstGate>
  );
}

function PremiumPassRoute() {
  return (
    <LocalFirstGate>
      <PassScreen View={PremiumDexScene} />
    </LocalFirstGate>
  );
}

/** The PASS tab (3l-2): the Critterdex. */
export default premiumRoute({ premium: PremiumPassRoute, legacy: CurrentPassRoute });
