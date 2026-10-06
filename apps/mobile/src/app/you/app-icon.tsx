import { AppIconScreen } from '@/features/you/app-icon/app-icon-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

/** Settings › App icon (3n-5). */
export default function AppIconRoute() {
  return (
    <LocalFirstGate>
      <AppIconScreen />
    </LocalFirstGate>
  );
}
