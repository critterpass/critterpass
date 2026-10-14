/**
 * The meter's parts of the premium guide thread: the chip, and once the free answers are spent
 * the limit card (Get Pass+ when the paywall exists, At midnight, the crewmate with Pass+), the
 * question waiting for midnight, and what the composer does then: locked with the time left,
 * queueing a question for midnight, or rewording the waiting one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and design ids, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';

import { hrefFor } from '@/lib/navigation/screen-registry';
import { shortName } from '@/lib/people/member-name';
import { Text } from '@/ui/premium';

import { crewAccent } from '@/features/crew';
import { useLiveQuery } from '../chat/data/live-rows';
import type { QuotaSpent } from '../chat/data/use-guide-turn';
import { isSpent, untilReset } from '../meter/meter-model';
import { useGuideMeter, useMinute } from '../meter/use-guide-meter';
import { useQueuedQuestion } from '../queued/use-queued-question';
import { GuideQuestion } from './guide-bubbles';
import { LimitCard, QuotaChip, WaitingCard } from './guide-limit';

const HOLDER_SQL = `SELECT u.display_name,
    (SELECT count(*) FROM crew_members o WHERE o.crew_id = cm.crew_id AND o.created_at < cm.created_at) AS join_index
  FROM crew_members cm JOIN users u ON u.id = cm.user_id
  WHERE cm.crew_id = ? AND cm.user_id = ?`;

export type MeterComposer =
  | { readonly kind: 'open' }
  | { readonly kind: 'locked'; readonly line: string }
  | {
      readonly kind: 'queue';
      readonly placeholder: string;
      readonly value: string;
      readonly onChange: (text: string) => void;
      readonly onSend: () => void;
    };

export interface PremiumMeter {
  readonly chip: ReactNode;
  readonly footer: ReactNode;
  readonly composer: MeterComposer;
  /** The free allowance line under the starters; null once it does not apply. */
  readonly allowance: string | null;
}

export function usePremiumGuideMeter(input: {
  readonly tripId: string | null;
  readonly crewId: string | null;
  readonly threadId: string;
  readonly guideName: string;
  readonly liveUsage: { used: number; limit: number; resetAt: string } | null;
  readonly spent: { question: string; spent: QuotaSpent } | null;
}): PremiumMeter {
  const now = useMinute();
  const meter = useGuideMeter(input.tripId, {
    live: input.liveUsage,
    spent: input.spent?.spent ?? null,
  });
  const queue = useQueuedQuestion(input.threadId);
  const [writing, setWriting] = useState(false);
  const [rewording, setRewording] = useState(false);
  const [draft, setDraft] = useState('');
  const holderId = input.spent?.spent.crewPassHolders[0] ?? null;
  const holders = useLiveQuery<{ display_name: string | null; join_index: number }>(
    holderId === null || input.crewId === null ? null : HOLDER_SQL,
    [input.crewId, holderId],
    ['crew_members', 'users'],
  );
  const guideName = input.guideName;
  const chip = <QuotaChip meter={meter} guideName={guideName} />;
  const allowance =
    meter.kind === 'free'
      ? t({
          id: 'guide.premium.allowance',
          message: `${meter.limit} answers a day on the free pass · resets at midnight`,
        })
      : null;
  if (!isSpent(meter) || meter.kind !== 'free') {
    return { chip, footer: null, composer: { kind: 'open' }, allowance };
  }

  const paywall = hrefFor('4e-1', {
    entry: 'guide_limit',
    ...(input.tripId === null ? {} : { tripId: input.tripId }),
  });
  const refused = input.spent?.question ?? null;
  const ask = (text: string) =>
    void queue.ask(text).then((queued) => {
      if (!queued) return;
      setWriting(false);
      setDraft('');
    });
  const holder = holders?.[0];
  const queued = queue.queued;
  const footer = (
    <View style={{ gap: 12 }}>
      {refused === null ? null : <GuideQuestion text={refused} author={null} />}
      {queued === null ? (
        <LimitCard
          guideName={guideName}
          used={meter.used}
          limit={meter.limit}
          {...(paywall === undefined ? {} : { onGetPass: () => router.push(paywall) })}
          onAtMidnight={() => (refused === null ? setWriting(true) : ask(refused))}
          asking={queue.asking}
          passHolder={
            holder === undefined
              ? null
              : {
                  name: shortName(holder.display_name),
                  color: crewAccent(null, holder.join_index),
                  ...(holderId === null ? {} : { uid: holderId }),
                }
          }
          {...(input.crewId === null
            ? {}
            : {
                onCrewChat: () =>
                  router.push({
                    pathname: '/crew/[crewId]/chat',
                    params: { crewId: input.crewId ?? '' },
                  }),
              })}
        />
      ) : (
        <WaitingCard
          guideName={guideName}
          question={queued}
          onCancel={queue.cancel}
          onEdit={() => {
            setDraft(queued.text);
            setRewording(true);
          }}
        />
      )}
      {queue.problem === null ? null : (
        <Text variant="captionMuted" tone="muted" testID="guide-queue-problem">
          {queue.problem === 'already_queued'
            ? t({
                id: 'guide.queued.already',
                message: 'You already have a question waiting for midnight.',
              })
            : queue.problem === 'offline'
              ? t({
                  id: 'guide.queued.offline',
                  message: 'That needs a connection. Try again when you’re back online.',
                })
              : t({
                  id: 'guide.queued.refused',
                  message: 'That question couldn’t be saved for later.',
                })}
        </Text>
      )}
    </View>
  );

  if (queued !== null && rewording) {
    return {
      chip,
      footer,
      allowance: null,
      composer: {
        kind: 'queue',
        placeholder: t({ id: 'guide.premium.reword', message: 'Reword your question' }),
        value: draft,
        onChange: setDraft,
        onSend: () => {
          queue.edit(draft);
          setRewording(false);
          setDraft('');
        },
      },
    };
  }
  if (queued === null && writing) {
    return {
      chip,
      footer,
      allowance: null,
      composer: {
        kind: 'queue',
        placeholder: t({
          id: 'guide.limit.queuePlaceholder',
          message: `Ask now, ${guideName} answers at midnight`,
        }),
        value: draft,
        onChange: setDraft,
        onSend: () => ask(draft.trim()),
      },
    };
  }
  const left = meter.resetAt === null ? null : untilReset(meter.resetAt, now);
  const line =
    left === null
      ? t({ id: 'guide.limit.backAtMidnight', message: `${guideName} is back at midnight` })
      : t({
          id: 'guide.limit.backIn',
          message: `${guideName} is back in ${left.hours}h ${left.minutes}m`,
        });
  return { chip, footer, allowance: null, composer: { kind: 'locked', line } };
}
