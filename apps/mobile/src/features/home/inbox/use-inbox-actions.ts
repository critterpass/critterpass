/**
 * The inbox's writes. An answer queues `act_inbox_item` (offline too) and the card leaves at once:
 * it is kept here, handled, until its slide-off ends, while the queued op already hides it from the
 * list. If the server refuses the answer, a toast says so and the item is simply back (the op left
 * the queue and the item is still open). Mark all read never resolves anything.
 */
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { InboxAction } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { useRejectedCommands } from '@/data/status/use-rejected-commands';
import { toast } from '@/motion/island-toast';

import { actInboxItemCommand, markInboxReadCommand } from '../home-commands';
import type { InboxItem } from './inbox-data';

export interface InboxActions {
  /** Cards answered on this screen and still sliding away. */
  readonly leaving: ReadonlyMap<string, InboxItem>;
  readonly act: (item: InboxItem, action: InboxAction) => Promise<void>;
  readonly settle: (item: InboxItem) => void;
  readonly markAllRead: (stillNeedYou: number) => Promise<void>;
  readonly markRead: (item: InboxItem) => void;
}

export function useInboxActions(): InboxActions {
  const { t } = useLingui();
  const act = useCommand(actInboxItemCommand);
  const read = useCommand(markInboxReadCommand);
  const rejected = useRejectedCommands();
  const sent = useRef(new Set<string>());
  const [leaving, setLeaving] = useState<ReadonlyMap<string, InboxItem>>(new Map());

  useEffect(() => {
    for (const refusal of rejected.items) {
      if (!sent.current.has(refusal.opId)) continue;
      sent.current.delete(refusal.opId);
      toast.show({
        id: refusal.opId,
        title: t({ id: 'home.inbox.refused', message: "That didn't go through" }),
        subtitle: t({ id: 'home.inbox.refusedBody', message: "It's back on your list." }),
      });
    }
  }, [rejected.items, t]);

  const settle = useCallback((item: InboxItem) => {
    setLeaving((current) => {
      if (!current.has(item.id)) return current;
      const next = new Map(current);
      next.delete(item.id);
      return next;
    });
  }, []);

  const answer = useCallback(
    async (item: InboxItem, action: InboxAction) => {
      if (action.style !== 'undo') {
        setLeaving((current) => new Map(current).set(item.id, item));
      }
      const result = await act.send({ item_id: item.id, action: action.id });
      if (result.kind === 'queued') sent.current.add(result.opId);
      if (action.style === 'undo') {
        toast.show({
          id: item.id,
          title: t({ id: 'home.inbox.undone', message: 'Undone. The plan is back how it was.' }),
        });
      }
    },
    [act, t],
  );

  const markAllRead = useCallback(
    async (stillNeedYou: number) => {
      await read.send({ all: true });
      toast.show({
        id: 'inbox-marked-read',
        title:
          stillNeedYou > 0
            ? t({
                id: 'home.inbox.markedRead',
                message: `Marked read. The ${stillNeedYou} on top still need you.`,
              })
            : t({ id: 'home.inbox.markedReadAll', message: 'Marked read.' }),
      });
    },
    [read, t],
  );

  const markRead = useCallback(
    (item: InboxItem) => {
      if (!item.read) void read.send({ item_ids: [item.id] });
    },
    [read],
  );

  return { leaving, act: answer, settle, markAllRead, markRead };
}
