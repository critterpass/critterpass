/* eslint-disable lingui/no-unlocalized-strings -- SQL. */
/** `usePartnerLink()`: records a partner click and opens its bridge link on this build's host. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { getRandomBytes } from 'expo-crypto';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import { currentAppEnvironment } from '@/data/app-session/endpoints';
import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { recordClickOnline, recordClickQueued } from './commands';
import { openPartnerLink, type PartnerLinkOutcome, type PartnerLinkRequest } from './partner-link';

const UPLOAD_WAIT_MS = 8000;

/** Polls the synced `cmd_results` for the op until it lands or the wait runs out. */
async function waitForResult(
  db: AbstractPowerSyncDatabase,
  opId: string,
  ms: number,
): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const row = await db
      .getOptional('SELECT 1 FROM cmd_results WHERE id = ?', [opId])
      .catch(() => null);
    if (row) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export function usePartnerLink(): (request: PartnerLinkRequest) => Promise<PartnerLinkOutcome> {
  const online = useCommand(recordClickOnline);
  const queued = useCommand(recordClickQueued);
  const sendOnline = online.send;
  const sendQueued = queued.send;
  const { db } = useLocalFirst();
  return useCallback(
    (request: PartnerLinkRequest) =>
      openPartnerLink(
        {
          env: currentAppEnvironment(),
          randomBytes: getRandomBytes,
          sendOnline: (payload) => sendOnline(payload),
          sendQueued: (payload) => sendQueued(payload),
          openUrl: (url) => Linking.openURL(url),
          waitForUpload: (opId) => waitForResult(db, opId, UPLOAD_WAIT_MS),
        },
        request,
      ),
    [sendOnline, sendQueued, db],
  );
}
