/** `usePartnerLink()`: records a partner click and opens its bridge link on this build's host. */
import { getRandomBytes } from 'expo-crypto';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import { currentAppEnvironment } from '@/data/app-session/endpoints';
import { useCommand } from '@/data/commands/use-command';

import { recordClickOnline, recordClickQueued } from './commands';
import { openPartnerLink, type PartnerLinkOutcome, type PartnerLinkRequest } from './partner-link';

export function usePartnerLink(): (request: PartnerLinkRequest) => Promise<PartnerLinkOutcome> {
  const online = useCommand(recordClickOnline);
  const queued = useCommand(recordClickQueued);
  const sendOnline = online.send;
  const sendQueued = queued.send;
  return useCallback(
    (request: PartnerLinkRequest) =>
      openPartnerLink(
        {
          env: currentAppEnvironment(),
          randomBytes: getRandomBytes,
          sendOnline: (payload) => sendOnline(payload),
          sendQueued: (payload) => sendQueued(payload),
          openUrl: (url) => Linking.openURL(url),
        },
        request,
      ),
    [sendOnline, sendQueued],
  );
}
