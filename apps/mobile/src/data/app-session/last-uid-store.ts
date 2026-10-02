/**
 * The uid the app last started for, on the device (MMKV): a returning start opens that uid's
 * local data at once. Kept apart from ./device-session.ts so a sign-in screen can record the
 * account it is about to restart on without loading the whole session graph.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a storage id and key, never copy. */
import { createMMKV } from 'react-native-mmkv';

import type { LastUidStore } from './start-app-session';

const storage = createMMKV({ id: 'cp-app-session' });
const LAST_UID_KEY = 'cp.session.last_uid';

export const deviceLastUid: LastUidStore = {
  read: () => storage.getString(LAST_UID_KEY) ?? null,
  write: (uid) => storage.set(LAST_UID_KEY, uid),
  clear: () => {
    storage.remove(LAST_UID_KEY);
  },
};
