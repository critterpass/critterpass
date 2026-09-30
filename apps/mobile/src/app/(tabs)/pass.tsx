import { PassScreen } from '@/features/critters/dex/pass-screen';
import { LocalFirstGate } from '@/features/critters/local-first-gate';

/** The PASS tab (3l-2): the Critterdex. */
export default function PassRoute() {
  return (
    <LocalFirstGate>
      <PassScreen />
    </LocalFirstGate>
  );
}
