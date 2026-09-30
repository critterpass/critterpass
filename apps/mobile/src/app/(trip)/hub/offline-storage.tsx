import { StorageSettingsScreen } from '@/features/trip/bundle/storage-settings';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';

/** Settings > Offline (3n-2): the trips saved on this phone and auto-download. */
export default function OfflineStorageRoute() {
  return (
    <LocalFirstGate>
      <StorageSettingsScreen />
    </LocalFirstGate>
  );
}
