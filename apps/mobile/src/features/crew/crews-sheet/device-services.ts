/**
 * The crew screens' services on a device: the session uid, React Native's share sheet and invite
 * links on this build's host (production, staging or development).
 */
import Constants from 'expo-constants';
import { Share } from 'react-native';

import { buildLink, linkHostsFor, type LinkEnvironment } from '@cp/domain';

import { deviceSessionUid } from '@/data/app-session/device-session';
import { appEnvironment } from '@/data/app-session/endpoints';

import type { CrewServices } from './crew-services';

export function deviceCrewServices(): CrewServices {
  const env: LinkEnvironment = appEnvironment(Constants.expoConfig?.extra?.appVariant);
  const [host] = linkHostsFor(env);
  return {
    uid: deviceSessionUid,
    share: async (message) => {
      await Share.share({ message });
    },
    inviteUrl: (code, seat) =>
      buildLink({ kind: 'invite', code, ...(seat === undefined ? {} : { seat }) }, { host }),
  };
}
