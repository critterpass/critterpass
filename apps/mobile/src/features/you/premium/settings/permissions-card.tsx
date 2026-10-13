/**
 * Settings' "Permissions" (undesigned in the premium set; drawn as a section of the 9.04 grammar):
 * every permission the app asks for with what it is for or how it stands, its short state on the
 * right, and the one action that improves it: ask again (with the primer) while the OS still will,
 * otherwise the system settings. Location stays in Privacy, where the design draws it.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import {
  openPermissionSettings,
  requestWithPrimer,
  usePermissionsState,
  type PermissionKind,
  type PermissionReport,
  type PermissionsState,
} from '@/lib/permissions';
import {
  exactAlarmOffLine,
  liveActivitiesOffLine,
  primerCopy,
  statusLine,
} from '@/lib/permissions/primer-copy';
import { Icon, ListCard, Row, Text, usePremiumTheme } from '@/ui/premium';

/** Every kind the section lists; speech rides with the microphone. */
/* eslint-disable lingui/no-unlocalized-strings -- permission kind ids, not copy */
export const SETTINGS_PERMISSION_KINDS = [
  'notifications',
  'alarms',
  'calendar',
  'camera',
  'microphone',
  'photos_add',
  'photos_read',
  'live_activities',
] as const satisfies readonly PermissionKind[];
/* eslint-enable lingui/no-unlocalized-strings */

/** The row's short state: On, Quiet, Limited, Off, or Ask before the OS has asked. */
export function permissionValue(report: PermissionReport | undefined): string {
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

/** The row's line: what a kind is for while it is fully on, otherwise how it stands. */
export function permissionDetail(kind: PermissionKind, state: PermissionsState): string {
  const report = state.reports[kind];
  if (kind === 'alarms' && state.alarms !== null && !state.alarms.exactAlarm) {
    return exactAlarmOffLine();
  }
  if (kind === 'live_activities' && report?.status !== 'granted') return liveActivitiesOffLine();
  if (report === undefined) return primerCopy(kind).body;
  return report.status === 'granted' ? primerCopy(kind).body : statusLine(report.status);
}

/** Where a tap goes: the system settings once the OS will not ask again, else the primer. */
export function permissionFix(report: PermissionReport | undefined): 'settings' | 'ask' {
  return report !== undefined && (!report.canAskAgain || report.status === 'restricted')
    ? 'settings'
    : 'ask';
}

async function fix(kind: PermissionKind, report: PermissionReport | undefined): Promise<void> {
  if (permissionFix(report) === 'settings') {
    await openPermissionSettings(kind);
    return;
  }
  await requestWithPrimer(kind, 'settings');
}

export function PermissionsCard() {
  const th = usePremiumTheme();
  const state = usePermissionsState();
  return (
    <View style={{ gap: th.space.gap4, marginTop: th.space.gap10 }}>
      <Text
        variant="caption"
        tone="muted"
        style={{ paddingHorizontal: 6 }}
        accessibilityRole="header"
      >
        {t({ id: 'permissions.section.title', message: 'Permissions' })}
      </Text>
      <ListCard radius={20} testID="you-settings-permissions">
        {SETTINGS_PERMISSION_KINDS.map((kind) => {
          const report = state.reports[kind];
          return (
            <Row
              key={kind}
              title={primerCopy(kind).title}
              subtitle={permissionDetail(kind, state)}
              trailingText={permissionValue(report)}
              trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
              onPress={() => void fix(kind, report)}
              testID={`you-settings-permission-${kind}`}
            />
          );
        })}
      </ListCard>
    </View>
  );
}
