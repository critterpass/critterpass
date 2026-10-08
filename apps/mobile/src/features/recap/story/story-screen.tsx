/**
 * The recap story over synced rows and the recap's live channel: plays the guide's theme, records
 * the open (which signs the crew's stamps) and the finish, votes for the MVP, sets the got-away
 * reminder, asks once for a signature on the stamp card, and at the end counts the story as
 * watched once and rests on the last card. Closing it (the button or the phone's back) settles into
 * the recap page: the one underneath after a replay, a new one after the first play. Closing early
 * stops the story from playing by itself again, and counts as watched in analytics only at its
 * real end. The sound switch stops and starts the music and the guide's voice together.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useAnalytics } from '@/lib/analytics/use-analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback } from '@/motion/island-toast';
import { music } from '@/motion/music';
import { guideColour, guideIdOr, guidesOfSameCountry, guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import {
  castMvpVoteCommand,
  recordRecapViewCommand,
  saveSignatureCommand,
  setLegendaryReminderCommand,
} from '../commands';
import { useLiveRows } from '../data/live-rows';
import { recapRoutes } from '../routes';
import { SignatureSheet } from '../signature/signature-sheet';
import { MvpSheet } from './mvp-sheet';
import { awardTitle } from '../summary/award-copy';
import { buildStoryCards } from './story-cards';
import { storySubtitle, themeName } from './story-copy';
import { StoryFooter } from './story-footer';
import { storySession } from './story-session';
import { storySummary } from './story-summary';
import { StoryView } from './story-view';
import { useAppActive } from './use-app-active';
import { useRecapChannel } from './use-recap-channel';
import { useStoryData } from './use-story-data';

const SETTINGS_SQL =
  'SELECT distance_unit, talk_out_loud, signature_media_key FROM user_settings WHERE user_id = ?';

function guideOf(slug: string | null | undefined): GuideId {
  return guideIdOr(slug);
}

/** The phone's own back closes the story the way its button does, so the recap page follows. */
function HardwareBack({ onBack }: { readonly onBack: () => void }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);
  return null;
}

function RecapStory({ tripId, replay }: { readonly tripId: string; readonly replay: boolean }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const locale = useLocale();
  const analytics = useAnalytics();
  const data = useStoryData(tripId);
  const live = useRecapChannel(data.recapId);
  const settings = useLiveRows<{
    distance_unit: string | null;
    talk_out_loud: number | null;
    signature_media_key: string | null;
  }>(SETTINGS_SQL, data.viewerId === null ? null : [data.viewerId], ['user_settings']).rows[0];
  const recordView = useCommand(recordRecapViewCommand);
  const vote = useCommand(castMvpVoteCommand);
  const remind = useCommand(setLegendaryReminderCommand);
  const sign = useCommand(saveSignatureCommand);
  const { report } = useCommandFeedback();
  const [soundOn, setSoundOn] = useState(true);
  const [sheet, setSheet] = useState<'mvp' | 'signature' | null>(null);
  const guide = guideOf(data.trip?.guide_slug);
  const guideName = data.trip?.guide_name ?? guideSticker(guide).name;
  const opened = useRef(false);

  // The guide's theme under the story, while it plays.
  const themed = music.themedGuideFor(guide, guidesOfSameCountry(guide)) ?? null;
  const active = useAppActive();
  useEffect(() => {
    if (themed === null || !active || !soundOn) return undefined;
    music.crossfadeTo(themed);
    return () => music.stop();
  }, [themed, active, soundOn]);

  // The first open signs the crew's stamps; a repeat open changes nothing on the server.
  useEffect(() => {
    if (data.recapId === null || opened.current) return;
    opened.current = true;
    storySession.markPlayed(data.recapId);
    void recordView.send({ recap_id: data.recapId, kind: 'open' });
  }, [data.recapId, recordView]);

  const summary = useMemo(() => storySummary(data), [data]);
  const unit = settings?.distance_unit === 'imperial' ? 'imperial' : 'metric';
  const canSign = settings !== undefined && settings.signature_media_key === null;
  const cards = useMemo(
    () =>
      buildStoryCards({
        data,
        summary,
        live,
        guide,
        ground: guideColour(guide),
        locale,
        unit,
        canSign,
      }),
    [data, summary, live, guide, locale, unit, canSign],
  );

  const summaryHref = recapRoutes.summary(tripId);
  const backLabel = t({ id: 'recap.story.back', message: 'Recap' });
  if (data.recapId === null || cards.length === 0) {
    return data.loaded ? (
      <ScreenMissing
        backLabel={backLabel}
        fallback={summaryHref}
        title={t({ id: 'recap.story.notReady.title', message: 'The story isn’t ready yet' })}
        line={t({
          id: 'recap.story.notReady.line',
          message: 'The recap is still being put together. Its page shows where it is.',
        })}
        action={{
          label: t({ id: 'recap.story.notReady.action', message: 'Open the recap' }),
          onPress: () => (replay ? goBackOr(summaryHref) : router.replace(summaryHref)),
        }}
        testID="recap-story-missing"
      />
    ) : (
      <ScreenLoading
        backLabel={backLabel}
        fallback={summaryHref}
        label={t({ id: 'recap.story.loading', message: 'Loading the story' })}
        testID="recap-story-waiting"
      />
    );
  }
  const recapId = data.recapId;

  // Seen once: the story does not play by itself again, on this phone or another.
  const markSeen = () => {
    if (storySession.seen(recapId)) void recordView.send({ recap_id: recapId, kind: 'complete' });
  };
  // The story's end counts once; it then rests on its last card until the traveller closes it.
  const complete = () => {
    markSeen();
    if (storySession.complete(recapId)) analytics.capture('recap_story_completed', {});
  };
  const close = () => {
    markSeen();
    // A replay sits over the recap page; the first play took its place, so a new page follows.
    if (replay) goBackOr(summaryHref);
    else router.replace(recapRoutes.summary(tripId, true));
  };

  const voiceOn = soundOn && settings?.talk_out_loud === 1;
  const theme = themed === null ? null : themeName(themed);
  const choices = data.awards
    .filter((award) => !award.optedOut)
    .map((award) => ({
      awardId: award.id,
      name: award.name,
      title: award.title ?? awardTitle(award.kind),
      votes: live.tallies.get(award.id) ?? award.votes,
      mvp: live.mvp === null ? award.mvp : live.mvp.includes(award.id),
    }));
  const closed = (data.recap?.mvpClosed ?? false) || live.mvp !== null;

  return (
    <>
      <HardwareBack onBack={close} />
      <StoryView
        guide={guide}
        guideName={guideName}
        subtitle={storySubtitle(data.trip?.place ?? null, theme)}
        cards={cards}
        voiceOn={voiceOn}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((on) => !on)}
        onClose={close}
        onFinished={complete}
        held={sheet !== null}
        footerFor={(card) => (
          <StoryFooter
            card={card}
            canVote={choices.length > 1}
            canRemind={data.gotAwayWindow !== null}
            reminded={data.reminderSet}
            nextWindow={data.recap?.gotAway?.next_window?.from ?? null}
            canSign={canSign}
            onVote={() => setSheet('mvp')}
            onRemind={() => {
              if (data.gotAwayWindow === null) return;
              void remind
                .send({ window_id: data.gotAwayWindow, on: !data.reminderSet })
                .then((result) => report(result, { offlineCapable: true, id: 'recap-remind' }));
            }}
            onSign={() => setSheet('signature')}
          />
        )}
      />
      {sheet === 'mvp' ? (
        <MvpSheet
          choices={choices}
          myVote={data.myVote}
          closed={closed}
          onVote={(awardId) => {
            void vote
              .send({ recap_id: recapId, award_id: awardId })
              .then((result) => report(result, { offlineCapable: true, id: 'recap-mvp' }));
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'signature' ? (
        <SignatureSheet
          name={
            data.travellers.find((person) => person.userId === data.viewerId)?.name ??
            t({ id: 'recap.signature.me', message: 'Me' })
          }
          onClose={() => setSheet(null)}
          onSaved={async (mediaId) => {
            const outcome = report(await sign.send({ media_id: mediaId }), {
              offlineCapable: true,
              id: 'recap-signature',
            });
            return outcome === 'done' || outcome === 'queued';
          }}
        />
      ) : null}
    </>
  );
}

export function RecapStoryScreen({
  tripId,
  replay = false,
}: {
  readonly tripId: string;
  /** Opened from the recap page, which is still underneath. */
  readonly replay?: boolean;
}) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="recap-story-waiting" />;
  return <RecapStory tripId={tripId} replay={replay} />;
}
