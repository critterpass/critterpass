/**
 * The premium guide thread (5.13–5.20) over the same state as the current sheet: the header with
 * Group / Me, the thread pinned to its newest line, the starters on an empty thread, the offline
 * tools card with no signal, the meter's limit and midnight cards, and the composer foot.
 */
import type { GuideThreadMode } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useContext, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { shortName } from '@/lib/people/member-name';
import { LoadingCritter, usePremiumTheme, useToast } from '@/ui/premium';

import { crewAccent } from '@/features/crew';
import { pingGuideAnswerCommand } from '../chat/data/guide-commands';
import { useGuideSheet } from '../chat/data/use-guide-sheet';
import { guideRoutes } from '../chat/register';
import { GuideComposer } from './guide-composer';
import { GuideEmpty } from './guide-empty';
import { PremiumGuidePlanCard } from './guide-plan-card';
import { cameraHref, guideStarters, offlineTools } from './guide-starters';
import { GuideThread } from './guide-thread';
import { GuideTopBar } from './guide-top-bar';
import { OfflineToolsCard } from './guide-offline';
import { usePremiumGuideMeter } from './use-premium-guide-meter';
import { useFollowBottom } from './use-follow-bottom';

export interface PremiumGuideProps {
  readonly tripId: string | null;
  readonly initialMode?: GuideThreadMode;
}

export function PremiumGuideScreen(props: PremiumGuideProps) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) {
    return (
      <LoadingCritter
        label={t({ id: 'guide.premium.opening', message: 'Opening the guide…' })}
        testID="guide-sheet-waiting"
      />
    );
  }
  return <OpenGuide {...props} />;
}

function OpenGuide({ tripId, initialMode }: PremiumGuideProps) {
  const th = usePremiumTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const sheet = useGuideSheet({
    tripId,
    ...(initialMode === undefined ? {} : { initialMode }),
    onDietary: () => router.push(guideRoutes.dietary()),
  });
  const { context, trip, turn, thread } = sheet;
  const offline = useSyncPhase() === 'offline';
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const pingCommand = useCommand(pingGuideAnswerCommand);
  const toast = useToast();
  const [pinged, setPinged] = useState<number | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const meter = usePremiumGuideMeter({
    tripId: trip?.tripId ?? null,
    crewId: trip?.crewId ?? null,
    threadId: turn.threadId,
    guideName: context.guideName,
    liveUsage: turn.live?.state.usage ?? null,
    spent: turn.quota,
  });
  const { proposalOf } = sheet;
  const renderProposal = useCallback(
    (id: string) => {
      const proposal = proposalOf(id);
      return (
        <PremiumGuidePlanCard
          tripId={proposal.tripId}
          changesetId={proposal.changesetId}
          canPropose={proposal.canPropose}
        />
      );
    },
    [proposalOf],
  );
  const { names } = sheet;
  // One author object per person, so the saved questions (memoised rows) keep their props while
  // the live answer streams.
  const authors = useMemo(() => {
    const map = new Map<string, { readonly name: string; readonly color: string }>();
    for (const [id, entry] of names) {
      if (id === 'me' || id === context.uid) continue;
      map.set(id, { name: shortName(entry.name), color: crewAccent(null, entry.joinIndex) });
    }
    return map;
  }, [names, context.uid]);
  const meName = names.get('me')?.name;
  const follow = useFollowBottom(scroll);
  const { showEarlier } = thread;
  const onEarlier = useMemo(
    () => (showEarlier === undefined ? undefined : follow.keepPlace(showEarlier)),
    [showEarlier, follow],
  );
  const camera = cameraHref(trip?.tripId ?? null, sheet.mode);
  const ask = (text: string) => sheet.send(text);
  const starters = guideStarters(th, {
    hasTrip: trip !== null,
    ask,
    ...(camera === undefined ? {} : { camera: () => router.push(camera) }),
  });
  const { voice, voiceTalking } = sheet;

  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="guide-sheet">
      <Stack.Screen options={{ headerShown: false }} />
      <GuideTopBar
        slug={context.guideSlug}
        guideName={context.guideName}
        modeLine={sheet.modeLine}
        mode={sheet.mode}
        {...(sheet.shared ? { onMode: sheet.setMode } : {})}
        chip={meter.chip}
        asSheet={from === 'circle'}
        onClose={() => router.back()}
      />
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: th.space.gap16, paddingBottom: th.space.gap8 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={follow.onScroll}
        scrollEventThrottle={32}
        onLayout={follow.onLayout}
        onContentSizeChange={follow.onContentSizeChange}
      >
        <GuideThread
          slug={context.guideSlug}
          guideName={context.guideName}
          loading={!context.ready || thread.loading}
          messages={thread.messages}
          {...(onEarlier === undefined ? {} : { onEarlier })}
          authors={authors}
          live={turn.live}
          waiting={turn.queued}
          renderProposal={renderProposal}
          onRetry={turn.retry}
          onRephrase={(question) => {
            sheet.setDraft(question);
            input.current?.focus();
          }}
          onStop={turn.stop}
          {...(offline || turn.live === null
            ? {}
            : {
                ping: {
                  asked: pinged === turn.live.key,
                  busy: pingCommand.pending,
                  onPress: () => {
                    const key = turn.live?.key ?? null;
                    void pingCommand.send({ thread_id: turn.threadId }).then((result) => {
                      if (result.kind !== 'applied') return;
                      setPinged(key);
                      toast.show({
                        kind: 'done',
                        message: t({
                          id: 'guide.premium.pingToast',
                          message: 'Close the guide if you like. I’ll ping you when it’s ready.',
                        }),
                      });
                    });
                  },
                },
              })}
          empty={
            <GuideEmpty
              slug={context.guideSlug}
              guideName={context.guideName}
              firstName={meName === undefined ? null : shortName(meName)}
              hasTrip={trip !== null}
              starters={starters}
              allowance={meter.allowance}
            />
          }
          footer={
            <>
              {offline ? (
                <OfflineToolsCard
                  destination={trip?.destination ?? null}
                  tools={offlineTools(trip?.tripId ?? null)}
                />
              ) : null}
              {meter.footer}
            </>
          }
        />
      </ScrollView>
      <GuideComposer
        ref={input}
        guideName={context.guideName}
        quickActions={sheet.quickActions}
        meter={meter.composer}
        draft={sheet.draft}
        onDraft={sheet.setDraft}
        onSend={() => sheet.send(sheet.draft)}
        busy={turn.busy}
        offline={offline}
        {...(camera === undefined ? {} : { onCamera: () => router.push(camera) })}
        {...(voice === undefined ? {} : { onMic: () => router.push(voice) })}
        {...(voiceTalking === undefined ? {} : { onMicHold: () => router.push(voiceTalking) })}
      />
    </View>
  );
}
