import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { PassScreen } from '@/features/critters/dex/pass-screen';

/** The Critterdex pushed from the premium pass (the Pass tab is the passport page there). */
export default function CritterdexRoute() {
  return (
    <LocalFirstGate>
      <PassScreen />
    </LocalFirstGate>
  );
}
