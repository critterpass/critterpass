/**
 * The guide thread's state for any view of it (3j-1): the context guide and trip, GROUP or JUST ME
 * (the mode it opened in holds until the person switches it), the saved thread, the turn streaming
 * now, the draft (a question handed over from search waits in it), the crew's names, the quick
 * actions the server has switched on and whose screens exist, and the voice routes in this mode.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, config keys and design ids, never copy. */
import type { GuideThreadMode } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { guideColour } from '@/ui/premium/stickers/guides';

import { guideAvatarId } from './guide-avatar';

import { rateGuideAnswerCommand } from './guide-commands';
import { useHandedQuestion } from './handed-question';
import { useLiveQuery } from './live-rows';
import { useGuideContext } from './use-guide-context';
import { useGuideThread } from './use-guide-thread';
import { useGuideTurn } from './use-guide-turn';
import type { GuideTripContext } from './use-guide-context';
import { unbroken } from '../components/mode-line';

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

export interface GuideSheetInput {
  readonly tripId: string | null;
  readonly initialMode?: GuideThreadMode;
  /** Opens Food and access needs: offered as the last quick action. */
  readonly onDietary?: () => void;
}

export function useGuideSheet({ tripId, initialMode, onDietary }: GuideSheetInput) {
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
  const liveTripId = trip?.tripId ?? null;
  // Stable, so a view that draws saved messages once keeps them drawn.
  const proposalOf = useCallback(
    (id: string) => ({ tripId: liveTripId, changesetId: id, canPropose: shared }),
    [liveTripId, shared],
  );
  const sendRating = rate.send;
  const onRate = useCallback(
    (messageId: string, verdict: 'up' | 'down') =>
      void sendRating({ message_id: messageId, verdict }),
    [sendRating],
  );

  return {
    context,
    trip,
    shared,
    mode,
    setMode: setChosen,
    thread,
    turn,
    draft,
    setDraft,
    color,
    modeLine,
    quickActions,
    names,
    voice,
    voiceTalking,
    asked,
    send,
    liveTripId,
    proposalOf,
    onRate,
  };
}

export type GuideSheetState = ReturnType<typeof useGuideSheet>;

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
}

function dateRange(start: string | null, end: string | null, locale: string): string | null {
  if (start === null) return null;
  const fmt = (iso: string, withMonth: boolean) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  if (end === null || end === start) return fmt(start, true);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start, true)}–${sameMonth ? fmt(end, false) : fmt(end, true)}`;
}

export function useModeLine(mode: GuideThreadMode, trip: GuideTripContext | null): string {
  const { t, i18n } = useLingui();
  if (mode === 'group' && trip !== null) {
    const count = trip.crewSize;
    return t({
      id: 'guide.header.group',
      message: `Group mode · all ${count} can see this`,
    });
  }
  const range = trip === null ? null : dateRange(trip.startDate, trip.endDate, i18n.locale);
  const dates = range === null ? null : unbroken(range);
  const place = [trip?.destination ?? null, dates].filter(Boolean).join(', ');
  return place === ''
    ? t({ id: 'guide.header.private', message: 'Just me · only you can see this' })
    : t({ id: 'guide.header.privateTrip', message: `Just me · ${place}` });
}
