import { LocalFirstGate } from '@/features/you/local-first-gate';
import { SettingsScreen } from '@/features/you/settings/settings-screen';

/** Settings (3n-2, 3n-6), over this phone's synced settings. */
export default function SettingsRoute() {
  return (
    <LocalFirstGate>
      <SettingsScreen />
    </LocalFirstGate>
  );
}
