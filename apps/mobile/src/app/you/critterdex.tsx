import { PassScreen } from '@/features/critters/dex/pass-screen';
import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { PremiumDexScene } from '@/features/critters/premium/dex/dex-scene';

/** The Critterdex (8.01), pushed from the premium pass: the Pass tab is the passport page there. */
export default function CritterdexRoute() {
  return (
    <LocalFirstGate>
      <PassScreen View={PremiumDexScene} />
    </LocalFirstGate>
  );
}
