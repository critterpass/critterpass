/**
 * The premium story's other parts: the playing card's one action (vote for the MVP, remind me when
 * the one that got away is back, sign the stamp), the MVP vote sheet with live tallies, and the
 * story not ready yet. Plus the premium look the story screen draws with.
 */
import { plural, t } from '@lingui/core/macro';

import { View } from 'react-native';

import { PremiumPostcardCard, PremiumSheet } from '@/features/album';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import {
  Button,
  EmptyState,
  GlassIconButton,
  LoadingCritter,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import type { MvpSheetProps } from '../../story/mvp-sheet';
import type { StoryFooterProps } from '../../story/story-footer';
import type { StoryAbsentProps, StoryLook } from '../../story/story-look';
import { PremiumAwardsCard, PremiumReceiptCard } from './cards/story-awards-receipt';
import { PremiumCoverCard } from './cards/story-cover';
import { PremiumGotAwayCard, PremiumStampCard } from './cards/story-got-away-stamp';
import { PremiumCrittersCard, PremiumRouteCard } from './cards/story-route-friends';
import { PremiumSignatureSheet } from './signature-sheet';
import { PremiumStoryScene } from './story-scene';

const useStyles = makePremiumStyles((th) => ({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

export function PremiumStoryFooter(props: StoryFooterProps) {
  const locale = useLocale();
  if (props.card === 'awards' && props.canVote) {
    return (
      <Button
        label={t({ id: 'recap.story.voteMvp', message: 'Vote for the MVP' })}
        onPress={props.onVote}
        testID="recap-story-vote"
      />
    );
  }
  if (props.card === 'got_away' && props.canRemind) {
    const month =
      props.nextWindow === null
        ? null
        : new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
            // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix.
            new Date(`${props.nextWindow}T12:00:00Z`),
          );
    return (
      <Button
        variant={props.reminded ? 'secondary' : 'primary'}
        label={
          props.reminded
            ? t({ id: 'recap.story.reminded', message: "I'll remind you" })
            : month === null
              ? t({ id: 'recap.story.remind', message: 'Remind me' })
              : t({ id: 'recap.story.remindIn', message: `Remind me in ${month}` })
        }
        onPress={props.onRemind}
        testID="recap-story-remind"
      />
    );
  }
  if (props.card === 'stamp' && props.canSign) {
    return (
      <Button
        label={t({ id: 'recap.story.sign', message: 'Sign it' })}
        onPress={props.onSign}
        testID="recap-story-sign"
      />
    );
  }
  return null;
}

export function PremiumMvpSheet({ choices, myVote, closed, onVote, onClose }: MvpSheetProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <PremiumSheet
      title={t({ id: 'recap.mvp.title', message: 'Vote for the MVP' })}
      onClose={onClose}
      testID="recap-mvp"
    >
      <Text variant="body" tone="muted">
        {closed
          ? t({ id: 'recap.mvp.closed', message: 'The vote is closed. The gold edge is the MVP.' })
          : t({
              id: 'recap.mvp.open',
              message: 'One tap. You can change it until everyone has voted.',
            })}
      </Text>
      {choices.map((choice) => {
        const votes = choice.votes;
        const line = choice.mvp
          ? t({
              id: 'recap.mvp.winner',
              message: plural(votes, { one: 'MVP · # vote', other: 'MVP · # votes' }),
            })
          : choice.awardId === myVote
            ? t({
                id: 'recap.mvp.yours',
                message: plural(votes, { one: 'Your vote · # vote', other: 'Your vote · # votes' }),
              })
            : t({
                id: 'recap.mvp.votes',
                message: plural(votes, { one: '# vote', other: '# votes' }),
              });
        return (
          <PressableScale
            key={choice.awardId}
            style={[
              styles.choice,
              choice.mvp ? { borderWidth: 2, borderColor: th.accent.sun } : null,
              choice.awardId === myVote ? { borderWidth: 2, borderColor: th.color.ink } : null,
            ]}
            disabled={closed}
            onPress={() => onVote(choice.awardId)}
            accessibilityRole="button"
            testID={`recap-mvp-${choice.awardId}`}
          >
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle">{`${choice.name} · ${choice.title}`}</Text>
              <Text variant="captionMuted" tone="muted">
                {line}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </PremiumSheet>
  );
}

export function PremiumStoryAbsent({ loaded, summaryHref, onOpenRecap }: StoryAbsentProps) {
  const th = usePremiumTheme();
  if (!loaded) {
    return (
      <LoadingCritter
        label={t({ id: 'recap.story.loading', message: 'Loading the story' })}
        testID="recap-story-waiting"
      />
    );
  }
  return (
    <View
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: th.color.ground }}
      testID="recap-story-missing"
    >
      <View style={{ position: 'absolute', top: 60, left: 20 }}>
        <GlassIconButton
          icon="back"
          label={t({ id: 'recap.story.back', message: 'Recap' })}
          onPress={() => goBackOr(summaryHref)}
        />
      </View>
      <EmptyState
        title={t({ id: 'recap.story.notReady.title', message: 'The story isn’t ready yet' })}
        line={t({
          id: 'recap.story.notReady.line',
          message: 'The recap is still being put together. Its page shows where it is.',
        })}
        action={
          <Button
            size="medium"
            label={t({ id: 'recap.story.notReady.action', message: 'Open the recap' })}
            onPress={onOpenRecap}
          />
        }
      />
    </View>
  );
}

export const PREMIUM_STORY_LOOK: StoryLook = {
  View: PremiumStoryScene,
  Footer: PremiumStoryFooter,
  Mvp: PremiumMvpSheet,
  Absent: PremiumStoryAbsent,
  Signature: PremiumSignatureSheet,
  cards: {
    Cover: PremiumCoverCard,
    Critters: PremiumCrittersCard,
    Route: PremiumRouteCard,
    Awards: PremiumAwardsCard,
    Receipt: PremiumReceiptCard,
    GotAway: PremiumGotAwayCard,
    Stamp: PremiumStampCard,
    Postcard: PremiumPostcardCard,
  },
};
