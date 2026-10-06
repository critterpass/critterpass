/**
 * "Shake to report" on this phone: on unless switched off in Settings. Where the app carries
 * Developer tools the shake opens those instead, so the report shake is not offered there.
 */
import { createMMKV, useMMKVBoolean } from 'react-native-mmkv';

import { devToolsAvailable } from '@/lib/dev-tools/variant';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a storage key, never copy
const KEY = 'cp.help.shakeToReport';
const storage = createMMKV();

/** Whether a shake can open a problem report in this app at all. */
export function shakeToReportAvailable(): boolean {
  return !devToolsAvailable();
}

export function shakeToReportEnabled(): boolean {
  return storage.getBoolean(KEY) ?? true;
}

export function useShakeToReport(): readonly [boolean, (next: boolean) => void] {
  const [stored, setStored] = useMMKVBoolean(KEY);
  return [stored ?? true, setStored];
}
