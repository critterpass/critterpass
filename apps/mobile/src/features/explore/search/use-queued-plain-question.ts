/**
 * A plain-words question asked with no signal (7i-2): kept in the phone's question queue, sent to
 * the guide at the first bar (as a guide question, metered as today), and pinged when the answer
 * lands. Sent once even if the guide sheet is open too, and kept through an app kill.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useLiveRows } from '@/data/plan/live-rows';
import { questionQueue, useQueuedQuestions } from '@/data/places/question-queue';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useSearchServices } from './data/search-services';

const THREAD_SQL = `SELECT t.id,
    (SELECT count(*) FROM trip_participants p WHERE p.trip_id = ?) AS crew
  FROM (SELECT 1) one
  LEFT JOIN guide_threads t ON t.trip_id = ?
    AND (t.mode = 'group' OR t.user_id = (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}'))
  ORDER BY t.mode = 'group' DESC, t.created_at LIMIT 1`;

async function ping(guideName: string, question: string): Promise<void> {
  if (AppState.currentState === 'active') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t({ id: 'search.queued.pingTitle', message: `${guideName} answered` }),
        body: question,
      },
      trigger: null,
    });
  } catch {
    // No notification permission: the banner says it when the app is opened.
  }
}

export function useQueuedPlainQuestion(input: {
  readonly tripId: string;
  readonly online: boolean;
  readonly guideName: string;
}) {
  const { tripId, online, guideName } = input;
  const services = useSearchServices();
  const queued = useQueuedQuestions().filter((entry) => entry.tripId === tripId);
  const thread = useLiveRows<{ id: string | null; crew: number }>(
    THREAD_SQL,
    [tripId, tripId],
    ['guide_threads', 'trip_participants', 'local_state'],
  ).rows[0];
  const [fresh] = useState(() => generateUuidV7());
  const threadId = thread?.id ?? fresh;
  const mode = (thread?.crew ?? 1) > 1 ? 'group' : 'private';

  const ask = useCallback(
    (text: string) => {
      questionQueue().enqueue({ id: generateUuidV7(), tripId, threadId: null, text });
    },
    [tripId],
  );

  const waiting = queued.filter((entry) => entry.state === 'queued').length;
  const sending = useRef(false);
  // A send that failed waits for the next time the signal comes back, never a tight retry loop.
  const blocked = useRef(false);
  useEffect(() => {
    if (!online) blocked.current = false;
  }, [online]);
  const leaving = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    leaving.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const signal = leaving.current?.signal;
    if (!online || waiting === 0 || sending.current || blocked.current || signal === undefined) {
      return;
    }
    const next = questionQueue().take({ tripId });
    if (next === null) return;
    sending.current = true;
    void (async () => {
      let target = threadId;
      let result: Awaited<ReturnType<typeof services.askGuide>> = { kind: 'failed' };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const body = { text: next.text, thread_mode: mode, context: { trip_id: tripId } } as const;
        result = await services.askGuide(target, body, signal);
        if (result.kind !== 'thread') break;
        target = result.threadId;
      }
      if (result.kind === 'answered') {
        questionQueue().answered(next.id);
        await ping(guideName, next.text);
      } else {
        blocked.current = true;
        questionQueue().release(next.id);
      }
      sending.current = false;
    })();
  }, [online, waiting, tripId, threadId, mode, services, guideName]);

  return {
    ask,
    queued: queued.filter((entry) => entry.state !== 'answered').length,
    answered: queued.some((entry) => entry.state === 'answered'),
  };
}
