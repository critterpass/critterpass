/**
 * The meter's parts of the guide sheet: the chip under the guide's name while answers are left,
 * and once they are spent the 4b-1 trail-off with its limit card (GET PASS+ when the paywall is
 * there, ASK AT MIDNIGHT, the crewmate-with-Pass+ hint) and the countdown in place of the composer.
 * ASK AT MIDNIGHT queues the question that was refused; with none, it opens a composer whose send
 * queues what is typed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, route paths and design ids, never copy. */
import { router, type Href } from 'expo-router';
import { useState } from 'react';

import { hrefFor } from '@/lib/navigation/screen-registry';
import { Stack } from '@/ui';
import { ChatMessage } from '@/ui/chat/ChatMessage';

import type { GuideMeterHook } from '../chat/components/guide-sheet';
import { useLiveQuery } from '../chat/data/live-rows';
import { QueuedQuestionRow, QueueProblemLine } from '../queued/queued-question-row';
import { useQueuedQuestion } from '../queued/use-queued-question';
import { LimitCard, LimitComposer, QueueComposer } from './limit-card';
import { MeterChip } from './meter-chip';
import { isSpent } from './meter-model';
import { useGuideMeter, useMinute } from './use-guide-meter';

const HOLDER_SQL = `SELECT u.display_name,
    (SELECT count(*) FROM crew_members o WHERE o.crew_id = cm.crew_id AND o.created_at < cm.created_at) AS join_index
  FROM crew_members cm JOIN users u ON u.id = cm.user_id
  WHERE cm.crew_id = ?1 AND cm.user_id = ?2`;

const DEST_SQL = `SELECT d.name FROM trips t JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;

export const useGuideMeterSlots: GuideMeterHook = (input) => {
  const now = useMinute();
  const meter = useGuideMeter(input.tripId, {
    live: input.liveUsage,
    spent: input.spent?.spent ?? null,
  });
  const queue = useQueuedQuestion(input.threadId);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const holderId = input.spent?.spent.crewPassHolders[0] ?? null;
  const holders = useLiveQuery<{ display_name: string | null; join_index: number }>(
    holderId === null || input.crewId === null ? null : HOLDER_SQL,
    [input.crewId, holderId],
    ['crew_members', 'users'],
  );
  const destination = useLiveQuery<{ name: string }>(
    input.tripId === null ? null : DEST_SQL,
    [input.tripId],
    ['trips', 'destinations'],
  );
  if (!isSpent(meter) || meter.kind !== 'free') {
    return { chip: <MeterChip meter={meter} guideName={input.guideName} /> };
  }
  const paywall = hrefFor('4a-1', { entry: 'guide_limit' });
  const refused = input.spent?.question ?? null;
  const ask = (text: string) =>
    void queue.ask(text).then((queued) => {
      if (!queued) return;
      setWriting(false);
      setDraft('');
    });
  const holder = holders?.[0];
  return {
    footer: (
      <Stack gap="16">
        {refused === null ? null : <ChatMessage kind="theirs" text={refused} />}
        <LimitCard
          guideName={input.guideName}
          color={input.color}
          used={meter.used}
          limit={meter.limit}
          resetAt={meter.resetAt}
          destination={destination?.[0]?.name ?? null}
          {...(paywall === undefined ? {} : { onGetPass: () => router.push(paywall) })}
          {...(queue.queued === null
            ? { onAskAtMidnight: () => (refused === null ? setWriting(true) : ask(refused)) }
            : {})}
          asking={queue.asking}
          passHolder={
            holder === undefined
              ? null
              : { name: holder.display_name?.split(' ')[0] ?? '?', joinIndex: holder.join_index }
          }
          {...(input.crewId === null
            ? {}
            : { onCrewChat: () => router.push(`/crew/${input.crewId}/chat` as Href) })}
        />
        {queue.queued === null ? null : (
          <QueuedQuestionRow
            question={queue.queued}
            guideName={input.guideName}
            onCancel={queue.cancel}
          />
        )}
        <QueueProblemLine problem={queue.problem} />
      </Stack>
    ),
    composer:
      writing && queue.queued === null ? (
        <QueueComposer
          guideName={input.guideName}
          value={draft}
          onChangeText={setDraft}
          onSend={() => ask(draft.trim())}
        />
      ) : (
        <LimitComposer guideName={input.guideName} resetAt={meter.resetAt} now={now} />
      ),
  };
};
