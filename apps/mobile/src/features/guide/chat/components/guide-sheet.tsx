/**
 * The guide sheet (3j-1) on the synced thread: the context guide, GROUP (the trip's crew-visible
 * thread) or JUST ME (private), the answer streaming over the turn route, plan cards from the
 * guide's change sets, and the quick actions the server has switched on and whose screens exist.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useContext, type ReactNode } from 'react';

import type { GuideThreadMode } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import type { QuotaSpent } from '../data/use-guide-turn';
import { useGuideSheet } from '../data/use-guide-sheet';
import { GuideConversation } from './guide-conversation';
import { GuideHeader } from './guide-header';
import { GuidePlanCard } from './guide-plan-card';
import { GuideSheetView } from './guide-sheet-view';

export { useQuickLabels, type QuickActionId } from '../data/use-guide-sheet';

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
  const sheet = useGuideSheet({
    tripId,
    ...(initialMode === undefined ? {} : { initialMode }),
    ...(onDietary === undefined ? {} : { onDietary }),
  });
  const { context, trip, shared, mode, thread, turn, draft, setDraft, voice, voiceTalking } = sheet;
  const meter = useMeter({
    tripId: trip?.tripId ?? null,
    crewId: trip?.crewId ?? null,
    threadId: turn.threadId,
    guideName: context.guideName,
    color: sheet.color,
    liveUsage: turn.live?.state.usage ?? null,
    spent: turn.quota,
  });
  const { proposalOf } = sheet;
  // Stable for the saved messages, which are drawn once.
  const renderProposal = useCallback(
    (id: string) => {
      const proposal = proposalOf(id);
      return (
        <GuidePlanCard
          tripId={proposal.tripId}
          changesetId={proposal.changesetId}
          canPropose={proposal.canPropose}
        />
      );
    },
    [proposalOf],
  );
  const send = sheet.send;
  const color = sheet.color;
  const liveTripId = sheet.liveTripId;

  return (
    <GuideSheetView
      header={
        <GuideHeader
          guideSlug={context.guideSlug}
          guideName={context.guideName}
          modeLine={sheet.modeLine}
          mode={mode}
          {...(shared ? { onMode: sheet.setMode } : {})}
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
          names={sheet.names}
          me={context.uid}
          live={turn.live}
          waiting={turn.queued}
          renderProposal={renderProposal}
          onPrompt={send}
          onRetry={turn.retry}
          onRate={sheet.onRate}
          footer={meter.footer}
        />
      }
      threadKey={`${mode}:${liveTripId ?? ''}`}
      topMessageId={thread.messages[0]?.id ?? null}
      asked={sheet.asked}
      quickActions={sheet.quickActions}
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
