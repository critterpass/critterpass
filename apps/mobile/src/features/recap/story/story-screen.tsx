/**
 * The recap story over synced rows and the recap's live channel: plays the guide's theme, records
 * the open (which signs the crew's stamps) and the finish, votes for the MVP, sets the got-away
 * reminder, asks once for a signature on the stamp card, and at the end counts the story as
 * watched once and settles into the recap page.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useAnalytics } from '@/lib/analytics/use-analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion';
import { music } from '@/motion/music';
import { GUIDE_STICKERS, isGuideStickerId } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
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
import { buildStoryCards } from './story-cards';
import { storySubtitle, themeName } from './story-copy';
import { StoryFooter } from './story-footer';
import { storySession } from './story-session';
import { storySummary } from './story-summary';
import { StoryView } from './story-view';
import { useRecapChannel } from './use-recap-channel';
import { useStoryData } from './use-story-data';

const SETTINGS_SQL =
  'SELECT distance_unit, talk_out_loud, signature_media_key FROM user_settings WHERE user_id = ?';

function guideOf(slug: string | null | undefined): GuideId {
  return slug != null && isGuideStickerId(slug) ? slug : 'tokek';
}

function RecapStory({ tripId }: { readonly tripId: string }) {
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
  const [voice, setVoice] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<'mvp' | 'signature' | null>(null);
  const guide = guideOf(data.trip?.guide_slug);
  const guideName = data.trip?.guide_name ?? GUIDE_STICKERS[guide].name;
  const opened = useRef(false);

  // The guide's theme under the story, while it plays.
  useEffect(() => {
    if (music.themeFor(guide)?.available !== true) return undefined;
    music.crossfadeTo(guide);
    return () => music.stop();
  }, [guide]);

  // The first open signs the crew's stamps; a repeat open changes nothing on the server.
  useEffect(() => {
    if (data.recapId === null || opened.current) return;
    opened.current = true;
    storySession.markPlayed(data.recapId);
    void recordView.send({ recap_id: data.recapId, kind: 'open' });
  }, [data.recapId, recordView]);

  const summary = useMemo(() => storySummary(data), [data]);
  const unit = settings?.distance_unit === 'imperial' ? 'imperial' : 'metric';
  const cards = useMemo(
    () =>
      buildStoryCards({ data, summary, live, guide, ground: tokens.guide[guide], locale, unit }),
    [data, summary, live, guide, locale, unit],
  );

  if (data.recapId === null || cards.length === 0)
    return <SessionWaiting testID="recap-story-waiting" />;
  const recapId = data.recapId;

  const finish = () => {
    if (storySession.complete(recapId)) {
      analytics.capture('recap_story_completed', {});
      void recordView.send({ recap_id: recapId, kind: 'complete' });
    }
    router.replace(recapRoutes.summary(tripId, true));
  };

  const voiceOn = voice ?? settings?.talk_out_loud === 1;
  const theme = music.themeFor(guide)?.available === true ? themeName(guide) : null;
  const choices = data.awards
    .filter((award) => !award.optedOut)
    .map((award) => ({
      awardId: award.id,
      name: award.name,
      title: award.title ?? award.kind,
      votes: live.tallies.get(award.id) ?? award.votes,
      mvp: live.mvp === null ? award.mvp : live.mvp.includes(award.id),
    }));
  const closed = (data.recap?.mvpClosed ?? false) || live.mvp !== null;

  return (
    <>
      <StoryView
        guide={guide}
        guideName={guideName}
        subtitle={storySubtitle(data.trip?.place ?? null, theme)}
        cards={cards}
        voiceOn={voiceOn}
        onToggleVoice={() => setVoice(!voiceOn)}
        onClose={finish}
        onFinished={finish}
        held={sheet !== null}
        footerFor={(card) => (
          <StoryFooter
            card={card}
            canVote={choices.length > 1}
            canRemind={data.gotAwayWindow !== null}
            reminded={data.reminderSet}
            nextWindow={data.recap?.gotAway?.next_window?.from ?? null}
            canSign={settings !== undefined && settings.signature_media_key === null}
            onVote={() => setSheet('mvp')}
            onRemind={() => {
              if (data.gotAwayWindow === null) return;
              feedback.emit('success');
              void remind.send({ window_id: data.gotAwayWindow, on: !data.reminderSet });
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
            feedback.emit('success');
            void vote.send({ recap_id: recapId, award_id: awardId });
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
          onSaved={(mediaId) => sign.send({ media_id: mediaId })}
        />
      ) : null}
    </>
  );
}

export function RecapStoryScreen({ tripId }: { readonly tripId: string }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="recap-story-waiting" />;
  return <RecapStory tripId={tripId} />;
}
