/**
 * What the leave-by alarm sheet's main button does, by the sheet it is: ask for alarms (iOS
 * AlarmKit, else the notification primer), open Android's exact-alarm grant, or open Settings when
 * alarms were turned off. The alarm store reads the answer again afterwards.
 */
/* eslint-disable lingui/no-unlocalized-strings -- permission names and sheet kinds, never copy. */
import { openPermissionSettings, requestWithPrimer } from '@/lib/permissions';

import { alarmPort } from './alarm-port';
import { alarmStore } from './alarm-store';
import type { AlarmSheetKind } from './view-types';

export async function runAlarmSheetPrimary(kind: AlarmSheetKind): Promise<void> {
  const port = alarmPort();
  if (kind === 'ask') {
    if (port !== null) await port.requestAuthorization().catch(() => null);
    else await requestWithPrimer('notifications', 'first_leave_by').catch(() => null);
  } else if (kind === 'exact') {
    await port?.openExactAlarmSettings().catch(() => false);
  } else if (kind === 'denied') {
    await openPermissionSettings(port === null ? 'notifications' : 'alarms').catch(() => false);
  }
  alarmStore.resync();
}

const KINDS: readonly AlarmSheetKind[] = ['ask', 'exact', 'denied', 'notification'];

/** The sheet a route's `kind` names, or null for anything else. */
export function alarmSheetKind(value: unknown): AlarmSheetKind | null {
  return KINDS.find((kind) => kind === value) ?? null;
}
