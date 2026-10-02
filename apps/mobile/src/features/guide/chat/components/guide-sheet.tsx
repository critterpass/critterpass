/**
 * The guide sheet (3j-1) on the synced thread: the context guide, GROUP (the trip's crew-visible
 * thread) or JUST ME (private), the answer streaming over the turn route, plan cards from the
 * guide's change sets, and the quick actions the server has switched on and whose screens exist.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, config keys and design ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext, useMemo, useState, type ReactNode } from 'react';

import type { GuideThreadMode } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { useTheme } from '@/ui';

import { rateGuideAnswerCommand } from '../data/guide-commands';
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
  { id: 'call_car', screen: '3h-3' },
  { id: 'translate_menu', screen: '3j-3' },
  { id: 'pharmacy', screen: '3k-6' },
] as const;

export type QuickActionId = (typeof QUICK_TARGETS)[number]['id'];

export function useQuickLabels(): Record<QuickActionId, string> {
  const { t } = useLingui();
  return {
    call_car: t({ id: 'guide.quick.callCar', message: 'Call a car' }),
    translate_menu: t({ id: 'guide.quick.menu', message: 'Translate a menu' }),
    pharmacy: t({ id: 'guide.quick.pharmacy', message: 'Pharmacy' }),
  };
}

function useQuickActions(tripId: string | null): QuickAction[] {
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
    const href = hrefFor(target.screen, tripId === null ? {} : { tripId });
    if (!on.has(target.id) || href === undefined) return [];
    return [{ id: target.id, label: labels[target.id], onPress: () => router.push(href) }];
  });
}

export interface GuideSheetProps {
  readonly tripId: string | null;
  readonly initialMode?: GuideThreadMode;
  readonly useMeter?: GuideMeterHook;
  /** "+" in the composer (the attach menu), when an area provides one. */
  readonly onAttach?: () => void;
}

/**
 * The sheet once the session's local database is open. A cold start can restore the guide route
 * before that; the sheet rises when the session is up instead of failing to load.
 */
export function GuideSheet(props: GuideSheetProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? null : <OpenGuideSheet {...props} />;
}

function OpenGuideSheet({ tripId, initialMode, useMeter = noMeter, onAttach }: GuideSheetProps) {
  const theme = useTheme();
  const context = useGuideContext(tripId);
  const trip = context.trip;
  const shared = trip !== null && trip.crewSize > 1;
  const [chosen, setChosen] = useState<GuideThreadMode | null>(initialMode ?? null);
  const mode: GuideThreadMode = chosen ?? (shared ? 'group' : 'private');
  useTripStreams(trip?.tripId ?? null);
  const thread = useGuideThread(mode, trip?.tripId ?? null, context.uid);
  const sync = useSyncStatus();
  const turn = useGuideTurn({
    threadId: thread.threadId,
    mode,
    tripId: trip?.tripId ?? null,
    online: sync.phase !== 'offline',
  });
  const rate = useCommand(rateGuideAnswerCommand);
  const [draft, setDraft] = useState('');
  const color = theme.guide[guideAvatarId(context.guideSlug)];
  const modeLine = useModeLine(mode, trip);
  const quickActions = useQuickActions(trip?.tripId ?? null);
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
  const voice = hrefFor('3j-2', trip === null ? {} : { tripId: trip.tripId });

  const send = (text: string) => {
    if (turn.busy) return;
    turn.ask(text);
    setDraft('');
  };

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
          messages={thread.messages}
          names={names}
          me={context.uid}
          live={turn.live}
          waiting={turn.queued}
          renderProposal={(id) => (
            <GuidePlanCard tripId={trip?.tripId ?? null} changesetId={id} canPropose={shared} />
          )}
          onPrompt={send}
          onRetry={turn.retry}
          onRate={(messageId, verdict) => void rate.send({ message_id: messageId, verdict })}
          footer={meter.footer}
        />
      }
      quickActions={quickActions}
      {...(meter.composer === undefined ? {} : { composerSlot: meter.composer })}
      draft={draft}
      onDraft={setDraft}
      onSend={() => send(draft)}
      {...(onAttach === undefined ? {} : { onAttach })}
      {...(voice === undefined ? {} : { onMic: () => router.push(voice) })}
    />
  );
}
