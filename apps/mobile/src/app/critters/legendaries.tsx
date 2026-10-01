import { LegendaryScreen } from '@/features/critters/legendary/legendary-screen';
import { LocalFirstGate } from '@/features/critters/local-first-gate';

/** The legendary calendar (3l-9). */
export default function LegendariesRoute() {
  return (
    <LocalFirstGate>
      <LegendaryScreen />
    </LocalFirstGate>
  );
}
