/**
 * Applies a downloaded update at a safe moment (./update-applier.ts) for as long as it is
 * mounted. Mounted only on builds that carry Developer tools; production keeps expo-updates'
 * default (the update applies on the next cold start).
 */
import { useSegments } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { devToolsAvailable } from '../dev-tools/variant';
import { isBusy } from '../interaction/busy';
import { createUpdateApplier } from './update-applier';

/** When this JS runtime loaded the app. */
const STARTED_AT = Date.now();
const RELOADED_FOR_KEY = 'cp.updates.reloaded_for';

let storage: ReturnType<typeof createMMKV> | null = null;
const store = () => (storage ??= createMMKV({ id: 'cp-updates' }));

export function UpdateApplier() {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  // A rollback to the embedded bundle has no id: it waits for the next cold start.
  const pendingId = isUpdatePending ? (downloadedUpdate?.updateId ?? null) : null;

  const [applier] = useState(() =>
    createUpdateApplier({
      available: devToolsAvailable(),
      isBusy,
      reloadedFor: {
        read: () => store().getString(RELOADED_FOR_KEY) ?? null,
        write: (updateId) => store().set(RELOADED_FOR_KEY, updateId),
      },
      reload: () => Updates.reloadAsync(),
      now: () => Date.now(),
      startedAt: STARTED_AT,
    }),
  );

  // Any change of screen after the first one means the person (or a restored session) moved on.
  const route = useSegments().join('/');
  const firstRoute = useRef(route);
  useEffect(() => {
    if (route !== firstRoute.current) applier.moved();
  }, [applier, route]);

  useEffect(() => {
    applier.downloaded(pendingId);
  }, [applier, pendingId]);

  useEffect(() => {
    let wasInBackground = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') wasInBackground = true;
      if (state !== 'active' || !wasInBackground) return;
      wasInBackground = false;
      applier.returnedToForeground();
    });
    return () => subscription.remove();
  }, [applier]);

  return null;
}
