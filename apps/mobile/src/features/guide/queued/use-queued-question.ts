/**
 * The question waiting for the meter's reset (4b-1 ASK AT MIDNIGHT): queued through
 * `queue_guide_question` (online only: the server checks the meter is spent), shown until it is
 * answered at the device's midnight, and cancellable before then. One per day: a second ask is
 * refused as `already_queued`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire codes, never copy. */
import { useCallback, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import {
  cancelQueuedQuestionCommand,
  queueGuideQuestionCommand,
} from '../chat/data/guide-commands';
import { useLiveQuery } from '../chat/data/live-rows';

export interface QueuedQuestion {
  readonly id: string;
  readonly text: string;
  readonly answerAfter: string;
}

export type QueueProblem = 'already_queued' | 'offline' | 'refused' | null;

const SQL = `SELECT q.id, q.text, q.answer_after FROM queued_guide_questions q
  WHERE q.user_id = (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}')
    AND q.status = 'queued'
  ORDER BY q.queued_at DESC LIMIT 1`;

export function useQueuedQuestion(threadId: string) {
  const rows = useLiveQuery<{ id: string; text: string; answer_after: string }>(
    SQL,
    [],
    ['queued_guide_questions', 'local_state'],
  );
  const queue = useCommand(queueGuideQuestionCommand);
  const cancelCommand = useCommand(cancelQueuedQuestionCommand);
  const [sent, setSent] = useState<QueuedQuestion | null>(null);
  const [cancelled, setCancelled] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<QueueProblem>(null);

  const row = rows?.[0];
  const synced: QueuedQuestion | null =
    row === undefined ? null : { id: row.id, text: row.text, answerAfter: row.answer_after };
  const candidate = synced ?? sent;
  const queued = candidate !== null && !cancelled.has(candidate.id) ? candidate : null;

  const ask = useCallback(
    async (text: string): Promise<boolean> => {
      setProblem(null);
      const result = await queue.send({ thread_id: threadId, text });
      if (result.kind === 'applied') {
        const value = result.result as { question_id?: string; answer_after?: string } | null;
        if (typeof value?.question_id === 'string' && typeof value.answer_after === 'string') {
          setSent({ id: value.question_id, text, answerAfter: value.answer_after });
        }
        return true;
      }
      if (result.kind === 'unavailable') setProblem('offline');
      else if (result.kind === 'rejected') {
        const state = (result.detail as { state?: unknown } | undefined)?.state;
        setProblem(state === 'already_queued' ? 'already_queued' : 'refused');
      }
      return false;
    },
    [queue, threadId],
  );

  const cancel = useCallback(() => {
    if (queued === null) return;
    setCancelled((current) => new Set([...current, queued.id]));
    void cancelCommand.send({ question_id: queued.id });
  }, [cancelCommand, queued]);

  return { queued, problem, asking: queue.pending, ask, cancel };
}
