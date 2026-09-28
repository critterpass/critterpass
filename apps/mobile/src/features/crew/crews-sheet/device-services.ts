/**
 * The crew screens' services on a device: the session uid, the share sheet, clipboard and
 * messaging apps, and invite links on this build's host (production, staging or development).
 */
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
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
    copy: async (text) => {
      await Clipboard.setStringAsync(text);
    },
    openUrl: async (url) => {
      if (!(await Linking.canOpenURL(url))) return false;
      await Linking.openURL(url);
      return true;
    },
    referralUrl: (code) => buildLink({ kind: 'referral', code }, { host }),
    inviteUrl: (code, seat) =>
      buildLink({ kind: 'invite', code, ...(seat === undefined ? {} : { seat }) }, { host }),
  };
}
