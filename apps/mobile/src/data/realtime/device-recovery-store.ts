/**
 * The device's persisted realtime positions: the recovery store over its own MMKV instance, so
 * `(offset, epoch)` per channel survives the app being killed.
 */
import { createMMKV } from 'react-native-mmkv';

import { createRecoveryStore, type RecoveryStore } from './recovery-store';

const STORAGE_ID = 'cp-realtime';

export function createDeviceRecoveryStore(): RecoveryStore {
  return createRecoveryStore(createMMKV({ id: STORAGE_ID }));
}
