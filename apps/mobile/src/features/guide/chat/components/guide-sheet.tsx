/**
 * The guide sheet (3j-1) on the synced thread: the context guide, GROUP (the trip's crew-visible
 * thread) or JUST ME (private), the answer streaming over the turn route, plan cards from the
 * guide's change sets, and the quick actions the server has switched on and whose screens exist.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, config keys and design ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { GuideThreadMode } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { guideColour } from '@/ui/avatar/guides';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { rateGuideAnswerCommand } from '../data/guide-commands';
import { useHandedQuestion } from '../data/handed-question';
import { useLiveQuery } from '../data/live-rows';
import { useGuideContext } from '../data/use-guide-context';
import { useGuideThread } from '../data/use-guide-thread';
import { useGuideTurn, type QuotaSpent } from '../data/use-guide-turn';
import { GuideConversation } from './guide-conversation';
import { guideAvatarId, GuideHeader, useModeLine } from './guide-header';
import { GuidePlanCard } from './guide-plan-card';
import { GuideSheetView, type QuickAction } from './guide-sheet-view';

/** What the meter area adds to the sheet (./../../meter): the chip, the limit footer and bar. */
export interface GuideMeterSlots {
  readonly chip?: ReactNode;
  readonly footer?: ReactNode;
  readonly composer?: ReactNode;
}

export type GuideMeterHook = (input: {
  readonly tripId: string | null;
  readonly crewId: string | null;
  readonly threadId: string;
  readonly guideName: string;
  readonly color: string;
  readonly liveUsage: { used: number; limit: number; resetAt: string } | null;
  readonly spent: { question: string; spent: QuotaSpent } | null;
}) => GuideMeterSlots;

const noMeter: GuideMeterHook = () => ({});

interface NameRow {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly join_index: number;
  readonly me: number;
}

const NAMES_SQL = `SELECT cm.user_id, u.display_name,
    (SELECT count(*) FROM crew_members o WHERE o.crew_id = cm.crew_id AND o.created_at < cm.created_at) AS join_index,
    cm.user_id = ? AS me
  FROM crew_members cm LEFT JOIN users u ON u.id = cm.user_id WHERE cm.crew_id = ?`;

const FLAGS_SQL = `SELECT key, value FROM client_config WHERE key LIKE 'guide.quick_actions.%'`;

const QUICK_TARGETS = [
  { id: 'call_car', screen: '3h-3', guideScreen: false },
  // The menu camera hands its questions back to this sheet, and talks in this sheet's mode.
  { id: 'translate_menu', screen: '3j-3', guideScreen: true },
  { id: 'pharmacy', screen: '3k-6', guideScreen: false },
  { id: 'practise_phrases', screen: 'guide-practice', guideScreen: false },
] as const;

export type QuickActionId = (typeof QUICK_TARGETS)[number]['id'];

export function useQuickLabels(): Record<QuickActionId, string> {
  const { t } = useLingui();
  return {
    call_car: t({ id: 'guide.quick.callCar', message: 'Call a car' }),
    translate_menu: t({ id: 'guide.quick.menu', message: 'Translate a menu' }),
    pharmacy: t({ id: 'guide.quick.pharmacy', message: 'Pharmacy' }),
    practise_phrases: t({ id: 'guide.quick.practise', message: 'Practise phrases' }),
  };
}

function useQuickActions(tripId: string | null, mode: GuideThreadMode): QuickAction[] {
  const flags = useLiveQuery<{ key: string; value: string | null }>(
    FLAGS_SQL,
    [],
    ['client_config'],
  );
  const labels = useQuickLabels();
  const on = new Set(
    (flags ?? [])
      .filter((row) => row.value === 'true' || row.value === '1')
      .map((row) => row.key.replace('guide.quick_actions.', '')),
  );
  return QUICK_TARGETS.flatMap((target) => {
    const href = hrefFor(target.screen, {
      ...(tripId === null ? {} : { tripId }),
      ...(target.guideScreen ? { mode, from: 'guide' } : {}),
    });
    if (!on.has(target.id) || href === undefined) return [];
    return [{ id: target.id, label: labels[target.id], onPress: () => router.push(href) }];
  });
}

export interface GuideSheetProps {
  readonly tripId: string | null;
  readonly initialMode?: GuideThreadMode;
  readonly useMeter?: GuideMeterHook;
  /** Opens Food and access needs: offered as the last quick action. */
  readonly onDietary?: () => void;
}

/**
 * The sheet once the session's local database is open. A cold start can restore the guide route
 * before that; the sheet rises when the session is up instead of failing to load.
 */
export function GuideSheet(props: GuideSheetProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? (
    <SessionWaiting testID="guide-sheet-waiting" />
  ) : (
    <OpenGuideSheet {...props} />
  );
}

function OpenGuideSheet({ tripId, initialMode, useMeter = noMeter, onDietary }: GuideSheetProps) {
  const { t } = useLingui();
  const context = useGuideContext(tripId);
  const trip = context.trip;
  const shared = trip !== null && trip.crewSize > 1;
  const [chosen, setChosen] = useState<GuideThreadMode | null>(initialMode ?? null);
  // The mode the sheet opened in holds until the person switches it: a crewmate joining while a
  // JUST ME chat is open must not turn the next question into one the crew reads.
  const [opened, setOpened] = useState<GuideThreadMode | null>(null);
  if (opened === null && context.ready) setOpened(shared ? 'group' : 'private');
  const mode: GuideThreadMode = chosen ?? opened ?? 'private';
  useTripStreams(trip?.tripId ?? null);
  const thread = useGuideThread(mode, trip?.tripId ?? null, context.uid);
  const syncPhase = useSyncPhase();
  const turn = useGuideTurn({
    threadId: thread.threadId,
    mode,
    tripId: trip?.tripId ?? null,
    uid: context.uid,
    online: syncPhase !== 'offline',
  });
  const rate = useCommand(rateGuideAnswerCommand);
  // A question handed over from search (`q`) waits in the composer for the person to send.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState(q ?? '');
  useHandedQuestion(setDraft);
  const color = guideColour(guideAvatarId(context.guideSlug));
  const modeLine = useModeLine(mode, trip);
  const flagged = useQuickActions(trip?.tripId ?? null, mode);
  const quickActions: QuickAction[] =
    onDietary === undefined
      ? flagged
      : [
          ...flagged,
          {
            id: 'dietary',
            label: t({ id: 'guide.quick.dietary', message: 'Food and access needs' }),
            onPress: onDietary,
          },
        ];
  const nameRows = useLiveQuery<NameRow>(
    trip === null ? null : NAMES_SQL,
    [context.uid, trip?.crewId ?? null],
    ['crew_members', 'users'],
  );
  const names = useMemo(() => {
    const map = new Map<string, { name: string; joinIndex: number }>();
    for (const row of nameRows ?? []) {
      const entry = { name: row.display_name ?? '?', joinIndex: row.join_index };
      map.set(row.user_id, entry);
      if (row.me === 1) map.set('me', entry);
    }
    return map;
  }, [nameRows]);
  const meter = useMeter({
    tripId: trip?.tripId ?? null,
    crewId: trip?.crewId ?? null,
    threadId: turn.threadId,
    guideName: context.guideName,
    color,
    liveUsage: turn.live?.state.usage ?? null,
    spent: turn.quota,
  });
  // Voice asks in the mode on screen, never one worked out again from the crew's size.
  const voiceParams = { ...(trip === null ? {} : { tripId: trip.tripId }), mode };
  const voice = hrefFor('3j-2', voiceParams);
  const voiceTalking = hrefFor('3j-2', { ...voiceParams, talk: '1' });

  const [asked, setAsked] = useState(0);
  const send = (text: string) => {
    // Until the trip and its crew are read, the mode on screen is not yet the one to ask in.
    if (turn.busy || !context.ready) return;
    turn.ask(text);
    setAsked((count) => count + 1);
    setDraft('');
  };
  // Stable for the saved messages, which are drawn once.
  const liveTripId = trip?.tripId ?? null;
  const renderProposal = useCallback(
    (id: string) => <GuidePlanCard tripId={liveTripId} changesetId={id} canPropose={shared} />,
    [liveTripId, shared],
  );
  const sendRating = rate.send;
  const onRate = useCallback(
    (messageId: string, verdict: 'up' | 'down') =>
      void sendRating({ message_id: messageId, verdict }),
    [sendRating],
  );

  return (
    <GuideSheetView
      header={
        <GuideHeader
          guideSlug={context.guideSlug}
          guideName={context.guideName}
          modeLine={modeLine}
          mode={mode}
          {...(shared ? { onMode: setChosen } : {})}
          meter={meter.chip}
        />
      }
      conversation={
        <GuideConversation
          guideName={context.guideName}
          color={color}
          hasTrip={trip !== null}
          loading={!context.ready || thread.loading}
          messages={thread.messages}
          {...(thread.showEarlier === undefined ? {} : { onEarlier: thread.showEarlier })}
          names={names}
          me={context.uid}
          live={turn.live}
          waiting={turn.queued}
          renderProposal={renderProposal}
          onPrompt={send}
          onRetry={turn.retry}
          onRate={onRate}
          footer={meter.footer}
        />
      }
      threadKey={`${mode}:${liveTripId ?? ''}`}
      topMessageId={thread.messages[0]?.id ?? null}
      asked={asked}
      quickActions={quickActions}
      {...(meter.composer === undefined ? {} : { composerSlot: meter.composer })}
      draft={draft}
      onDraft={setDraft}
      onSend={() => send(draft)}
      {...(turn.busy
        ? {
            stop: {
              label: t({ id: 'guide.composer.stop', message: 'Stop the answer' }),
              onPress: turn.stop,
            },
          }
        : {})}
      {...(voice === undefined ? {} : { onMic: () => router.push(voice) })}
      {...(voiceTalking === undefined ? {} : { onMicHold: () => router.push(voiceTalking) })}
    />
  );
}
