import { LocalFirstGate } from '@/features/you/local-first-gate';
import { StampsScreen } from '@/features/you/history/stamps-screen';

/** Every stamp, from the profile's "ALL n ›". */
export default function StampsRoute() {
  return (
    <LocalFirstGate>
      <StampsScreen />
    </LocalFirstGate>
  );
}
