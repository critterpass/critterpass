import { describe, expect, it } from '@jest/globals';

import {
  configurePermissions,
  getPermissionStore,
  registerPrimerPresenter,
  type PermissionReport,
} from '../../permissions';
import { configureAlwaysUpgrade, offerAlwaysUpgrade } from '../always-upgrade';

const wiu: PermissionReport = {
  kind: 'location',
  status: 'granted',
  canAskAgain: true,
  available: true,
  level: 'wiu',
  precise: true,
};

describe('contextual Always upgrade', () => {
  it('is offered only on While-In-Use, only while the switch allows, and asks Always', async () => {
    const asked: string[] = [];
    configurePermissions({
      port: {
        getStatus: () => Promise.resolve(getPermissionStore().getState().reports.location ?? wiu),
        request: (kind, level) => {
          asked.push(`${kind}:${String(level)}`);
          return Promise.resolve({ ...wiu, level: 'always' });
        },
        openSettings: () => Promise.resolve(true),
        settingsTargetFor: () => 'location',
      },
      sendMirror: () => Promise.resolve(),
      storage: { getString: () => undefined, set: () => undefined, remove: () => undefined },
    });
    const stop = registerPrimerPresenter(() => Promise.resolve('accept'));
    let allowed = false;
    configureAlwaysUpgrade({ allowed: () => allowed });

    expect(await offerAlwaysUpgrade('first_encounter')).toEqual({ result: 'not_offered' });
    getPermissionStore().setReport(wiu);
    expect(await offerAlwaysUpgrade('crew_map')).toEqual({ result: 'not_offered' });
    allowed = true;
    expect((await offerAlwaysUpgrade('crew_map')).result).toBe('granted');
    expect(asked).toEqual(['location:always']);
    expect(await offerAlwaysUpgrade('first_encounter')).toEqual({ result: 'not_offered' });
    stop();
  });
});
