import type { PermissionKind } from '@/lib/permissions';
import { t } from '@lingui/core/macro';

import {
  openPermissionSettings,
  requestWithPrimer,
  type PermissionReport,
  type PermissionsState,
  usePermissionsState,
} from '@/lib/permissions';

import { SettingsGroup, type SettingsRow } from '../inputs/SettingsGroup';
import { exactAlarmOffLine, liveActivitiesOffLine, primerCopy, statusLine } from './copy';

/** Every kind the Settings section lists; speech rides with the microphone. */
/* eslint-disable lingui/no-unlocalized-strings -- permission kind ids, not copy */
export const SETTINGS_PERMISSION_KINDS = [
  'notifications',
  'alarms',
  'location',
  'calendar',
  'camera',
  'microphone',
  'photos_add',
  'photos_read',
  'live_activities',
] as const satisfies readonly PermissionKind[];
/* eslint-enable lingui/no-unlocalized-strings */

function shortValue(report: PermissionReport | undefined): string {
  switch (report?.status) {
    case 'granted':
      return t({ id: 'permissions.value.on', message: 'On' });
    case 'provisional':
      return t({ id: 'permissions.value.quiet', message: 'Quiet' });
    case 'limited':
      return t({ id: 'permissions.value.limited', message: 'Limited' });
    case 'denied':
    case 'restricted':
      return t({ id: 'permissions.value.off', message: 'Off' });
    case 'not_determined':
    case undefined:
      return t({ id: 'permissions.value.ask', message: 'Ask' });
  }
}

function detail(kind: PermissionKind, state: PermissionsState): string {
  const report = state.reports[kind];
  if (kind === 'alarms' && state.alarms !== null && !state.alarms.exactAlarm)
    return exactAlarmOffLine();
  if (kind === 'live_activities' && report?.status !== 'granted') return liveActivitiesOffLine();
  if (report === undefined) return primerCopy(kind).body;
  if (kind === 'location' && report.status === 'granted') {
    const approximate = report.precise === false;
    const wiuOnly = report.level === 'wiu';
    // Fully on: the row's value already says "On", so the line says what it is for.
    if (!approximate && !wiuOnly) return primerCopy(kind).body;
    return statusLine('granted', { approximate, wiuOnly });
  }
  return report.status === 'granted' ? primerCopy(kind).body : statusLine(report.status);
}

/** The fix for one row: ask (with the primer) while the OS still can, otherwise Settings. */
async function fix(kind: PermissionKind, report: PermissionReport | undefined): Promise<void> {
  if (report !== undefined && (!report.canAskAgain || report.status === 'restricted')) {
    await openPermissionSettings(kind);
    return;
  }
  const level = kind === 'location' && report?.level === 'wiu' ? 'always' : undefined;
  await requestWithPrimer(kind, 'settings', level ? { level } : {});
}

export interface PermissionsSectionProps {
  /** Kinds a screen already shows elsewhere (Settings has Location under PRIVACY). */
  readonly exclude?: readonly PermissionKind[];
  readonly testID?: string;
}

/**
 * Settings (3n-2 / 3n-6) "Permissions": every kind with its state and the one action that
 * improves it — ask again while the OS will still prompt, else open Settings.
 */
export function PermissionsSection({
  exclude = [],
  testID = 'permissions-section',
}: PermissionsSectionProps) {
  const state = usePermissionsState();
  const kinds = SETTINGS_PERMISSION_KINDS.filter((kind) => !exclude.includes(kind));
  const rows: SettingsRow[] = kinds.map((kind) => ({
    key: kind,
    kind: 'value',
    title: primerCopy(kind).title,
    subtitle: detail(kind, state),
    value: shortValue(state.reports[kind]),
    onPress: () => void fix(kind, state.reports[kind]),
  }));
  return (
    <SettingsGroup
      title={t({ id: 'permissions.section.title', message: 'Permissions' })}
      rows={rows}
      testID={testID}
    />
  );
}
