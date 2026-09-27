/**
 * What the communication-notifications config plugin writes into the app's entitlements and
 * Info.plist, run through the plugin's own mods on a bare config.
 */
import { describe, expect, it } from '@jest/globals';
import type { ExpoConfig } from 'expo/config';

import withCommunicationNotifications, {
  COMMUNICATION_ENTITLEMENT,
  SEND_MESSAGE_ACTIVITY_TYPE,
} from './with-communication-notifications';

type ModFn = (mod: { modResults: Record<string, unknown> }) => Promise<{
  modResults: Record<string, unknown>;
}>;

async function runIosMod(
  config: ExpoConfig,
  name: 'entitlements' | 'infoPlist',
  modResults: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const mods = (config as { mods?: { ios?: Record<string, ModFn> } }).mods;
  const mod = mods?.ios?.[name];
  if (mod === undefined) throw new Error(`plugin registered no ios.${name} mod`);
  const result = await mod({
    modResults,
    modRequest: { platform: 'ios', modName: name, projectRoot: '/tmp', introspect: true },
  } as never);
  return result.modResults;
}

describe('communication notifications config plugin', () => {
  const config = withCommunicationNotifications({ name: 'CritterPass', slug: 'critterpass' });

  it('turns on the communication notifications entitlement, keeping the others', async () => {
    const entitlements = await runIosMod(config, 'entitlements', {
      'com.apple.security.application-groups': ['group.app.critterpass'],
    });
    expect(entitlements[COMMUNICATION_ENTITLEMENT]).toBe(true);
    expect(entitlements['com.apple.security.application-groups']).toEqual([
      'group.app.critterpass',
    ]);
  });

  it('declares INSendMessageIntent once, next to existing activity types', async () => {
    const infoPlist = await runIosMod(config, 'infoPlist', {
      NSUserActivityTypes: ['app.critterpass.view-trip', SEND_MESSAGE_ACTIVITY_TYPE],
    });
    expect(infoPlist.NSUserActivityTypes).toEqual([
      'app.critterpass.view-trip',
      SEND_MESSAGE_ACTIVITY_TYPE,
    ]);
    const fresh = await runIosMod(config, 'infoPlist', {});
    expect(fresh.NSUserActivityTypes).toEqual([SEND_MESSAGE_ACTIVITY_TYPE]);
  });
});
