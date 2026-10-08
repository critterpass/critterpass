/**
 * The recap's link for the share sheet: how many live links this traveller can switch off, sharing
 * a link through the phone's share sheet, and switching the links off. Also the landing read for a
 * recap link opened in the app.
 */
import { createRecapLinkResultSchema, type RecapLinks } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import type { SendResult } from '@/data/commands/client';
import { useTravelDataReader } from '@/data/travel-data/client';
import { feedback, toast } from '@/motion';

import { createRecapLinkCommand, revokeRecapLinkCommand } from '../commands';
import {
  deviceRememberedLinks,
  readRecapLinks,
  resolveRecapLink,
  reusableLink,
  stoppableLinks,
  type RecapLinkLanding,
} from './recap-link';

export interface RecapLinkActions {
  /** Live links "Stop sharing" would switch off. */
  readonly stoppable: number;
  readonly busy: boolean;
  share(): Promise<void>;
  stop(): Promise<void>;
}

const TOAST_ID = 'recap-link';

function tooMany(result: SendResult): boolean {
  return (
    result.kind === 'rejected' &&
    (result.detail as { reason?: unknown } | undefined)?.reason === 'too_many_links'
  );
}

export function useRecapLinkActions(recapId: string | null): RecapLinkActions {
  const { t } = useLingui();
  const reader = useTravelDataReader();
  const create = useCommand(createRecapLinkCommand);
  const revoke = useCommand(revokeRecapLinkCommand);
  const [links, setLinks] = useState<RecapLinks | null>(null);

  useEffect(() => {
    if (recapId === null || reader === null) return undefined;
    const controller = new AbortController();
    void readRecapLinks(reader, recapId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setLinks(next);
    });
    return () => controller.abort();
  }, [reader, recapId]);

  // One share at a time, from the first tap: reading the links comes before the command is pending.
  const sharing = useRef(false);
  const [sharingNow, setSharingNow] = useState(false);

  /** Asks again after a change, or before deciding which link to share. */
  async function refresh(): Promise<RecapLinks | null> {
    if (recapId === null) return null;
    const next = await readRecapLinks(reader, recapId);
    setLinks(next);
    return next;
  }

  const fail = (title: string) => {
    feedback.emit('error');
    toast.show({ id: TOAST_ID, title });
  };

  async function share() {
    if (recapId === null || create.pending || sharing.current) return;
    sharing.current = true;
    setSharingNow(true);
    try {
      await shareLink(recapId);
    } finally {
      sharing.current = false;
      setSharingNow(false);
    }
  }

  async function shareLink(recapId: string) {
    const remembered = deviceRememberedLinks();
    let link = reusableLink(remembered.get(recapId), await refresh());
    if (link === null) {
      const result = await create.send({ recap_id: recapId });
      const made =
        result.kind === 'applied' ? createRecapLinkResultSchema.safeParse(result.result) : null;
      if (made?.success !== true) {
        fail(
          result.kind === 'unavailable'
            ? t({ id: 'recap.link.offline', message: 'Needs signal to make a link' })
            : tooMany(result)
              ? t({
                  id: 'recap.link.tooMany',
                  message: 'Too many links. Stop sharing, then make a new one.',
                })
              : t({ id: 'recap.link.failed', message: "Couldn't make a link" }),
        );
        return;
      }
      link = { linkId: made.data.link_id, url: made.data.url };
      remembered.set(recapId, link);
      void refresh();
    }
    try {
      await Share.share({ message: link.url });
    } catch {
      // The traveller backed out of the share sheet: the link stays, ready to share again.
    }
  }

  async function stop() {
    if (recapId === null || revoke.pending) return;
    const result = await revoke.send({ recap_id: recapId });
    if (result.kind !== 'applied') {
      fail(
        result.kind === 'unavailable'
          ? t({ id: 'recap.link.stopOffline', message: 'Needs signal to stop sharing' })
          : t({ id: 'recap.link.stopFailed', message: "Couldn't stop sharing" }),
      );
      return;
    }
    deviceRememberedLinks().forget(recapId);
    feedback.emit('success');
    toast.show({
      id: TOAST_ID,
      title: t({ id: 'recap.link.stopped', message: 'The link is off. It opens nothing now.' }),
    });
    void refresh();
  }

  return {
    stoppable: stoppableLinks(links),
    busy: create.pending || revoke.pending || sharingNow,
    share,
    stop,
  };
}

export function useRecapLinkLanding(token: string) {
  const reader = useTravelDataReader();
  const [answer, setAnswer] = useState<{ key: string; state: RecapLinkLanding } | null>(null);
  const [round, setRound] = useState(0);
  const key = `${token}\u0000${String(round)}`;
  useEffect(() => {
    const controller = new AbortController();
    void resolveRecapLink(reader, token, controller.signal).then((state) => {
      if (!controller.signal.aborted) setAnswer({ key, state });
    });
    return () => controller.abort();
  }, [reader, token, key]);
  const retry = useCallback(() => setRound((value) => value + 1), []);
  const state: RecapLinkLanding = answer?.key === key ? answer.state : { kind: 'loading' };
  return { state, retry };
}
