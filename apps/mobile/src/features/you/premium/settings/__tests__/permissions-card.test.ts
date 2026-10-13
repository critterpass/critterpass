/**
 * Settings' permission rows: a tap asks again while the OS still will and opens the system settings
 * once it won't; each line says what a permission is for while it is on, and how it stands if not.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import type { PermissionKind, PermissionReport, PermissionsState } from '@/lib/permissions';
import {
  exactAlarmOffLine,
  liveActivitiesOffLine,
  primerCopy,
  statusLine,
} from '@/lib/permissions/primer-copy';

import { permissionDetail, permissionFix, permissionValue } from '../permissions-card';

function report(
  kind: PermissionKind,
  status: PermissionReport['status'],
  canAskAgain = true,
): PermissionReport {
  return { kind, status, canAskAgain, available: true };
}

function state(
  reports: PermissionsState['reports'],
  alarms: PermissionsState['alarms'] = null,
): PermissionsState {
  return { reports, alarms, liveActivities: null };
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('permissionFix', () => {
  it('asks again while the OS will still prompt', () => {
    expect(permissionFix(undefined)).toBe('ask');
    expect(permissionFix(report('camera', 'not_determined'))).toBe('ask');
    expect(permissionFix(report('camera', 'denied', true))).toBe('ask');
  });

  it('opens the system settings once the OS will not ask again', () => {
    expect(permissionFix(report('camera', 'denied', false))).toBe('settings');
    expect(permissionFix(report('camera', 'restricted', true))).toBe('settings');
  });
});

describe('permissionDetail', () => {
  it('says what a permission is for while it is on, and how it stands when it is not', () => {
    expect(permissionDetail('camera', state({ camera: report('camera', 'granted') }))).toBe(
      primerCopy('camera').body,
    );
    expect(permissionDetail('camera', state({}))).toBe(primerCopy('camera').body);
    expect(permissionDetail('camera', state({ camera: report('camera', 'denied') }))).toBe(
      statusLine('denied'),
    );
  });

  it('names exact alarms and Live Activities being off', () => {
    const alarms = { exactAlarm: false, fullScreenIntent: true };
    expect(permissionDetail('alarms', state({ alarms: report('alarms', 'granted') }, alarms))).toBe(
      exactAlarmOffLine(),
    );
    expect(permissionDetail('live_activities', state({}))).toBe(liveActivitiesOffLine());
  });
});

describe('permissionValue', () => {
  it('reads Ask before the OS has asked and Off after a refusal', () => {
    expect(permissionValue(undefined)).toBe('Ask');
    expect(permissionValue(report('camera', 'denied'))).toBe('Off');
    expect(permissionValue(report('camera', 'granted'))).toBe('On');
  });
});
