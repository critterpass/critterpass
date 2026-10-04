/**
 * Where the phone is, for one GO. Asked only because the person tapped GO: with location already
 * allowed it reads a fresh fix (the last known one when that is slow); when the app may still ask,
 * it goes through the shared when-in-use primer first. The fix lives in screen state only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- permission kinds and states, never copy. */
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getLastKnownPositionAsync,
} from 'expo-location';

import { requestWithPrimer } from '@/lib/permissions';

import type { LocateState } from '../preview-model';

const FIX_TIMEOUT_MS = 8_000;
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

async function fix(): Promise<LocateState> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS));
  const fresh = await Promise.race([
    getCurrentPositionAsync({ accuracy: Accuracy.Balanced }).catch(() => null),
    timeout,
  ]);
  const position =
    fresh ?? (await getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null));
  return position === null
    ? { kind: 'no_fix' }
    : { kind: 'here', at: { lat: position.coords.latitude, lng: position.coords.longitude } };
}

export async function locateForGo(): Promise<LocateState> {
  try {
    const permission = await getForegroundPermissionsAsync();
    if (permission.granted) return await fix();
    if (!permission.canAskAgain) return { kind: 'denied' };
    const outcome = await requestWithPrimer('location', 'trip_start');
    return outcome.result === 'granted' || outcome.result === 'partial'
      ? await fix()
      : { kind: 'denied' };
  } catch {
    return { kind: 'denied' };
  }
}
