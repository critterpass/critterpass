/**
 * Swipe together (4.42), full screen with its ✕: "Swipe together" and how far through the deck you
 * are, the matches so far (♥ n, opening Ideas), the card stack (the place's photo or its kind, its
 * name, the guide's line and who else said yes) that votes on a drag or the ✕ / ✓ buttons, "Why
 * this?" for the guide's reasons (offered only when she gave some), the MATCH stamp when enough of
 * the crew said yes, the deck still being built (or stuck), and the summary at the end. Who is swiping right now is never shown. Every read and
 * vote is `useSwipeScreen`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassPill,
  GuideNote,
  OfflinePill,
  RectStamp,
  StampMoment,
  SwipeDeck,
  Text,
  usePremiumTheme,
  type SwipeDeckHandle,
} from '@/ui/premium';

import type { SwipeCardFace } from '../../swipe-view-props';
import { whyWords } from '../../components/why-words';
import { useSwipeScreen, type SwipeScreenProps } from '../../use-swipe-screen';
import { CardFace, VoteButton } from './swipe-parts';
import { SwipeSummary } from './swipe-summary';
import { SwipeWaiting } from './swipe-waiting';
import { useDeckCards } from './use-deck-cards';

const FLY_MS = 450;
const NO_CARDS: readonly SwipeCardFace[] = [];
/**
 * Where the reader is in the deck ("12 of 30" while the twelfth card is up): the card on top
 * counts, so the first card reads "1 of 30"; the summary after the last card reads the total.
 */
export function deckPosition(stage: string, done: number, total: number): number {
  return stage === 'deck' ? Math.min(done + 1, total) : Math.min(done, total);
}

export function SwipePage(props: SwipeScreenProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const view = useSwipeScreen(props);
  const deck = useRef<SwipeDeckHandle | null>(null);
  const stage = view.stage;
  const match = view.match;
  useEffect(() => {
    if (match === null) return undefined;
    const timer = setTimeout(match.onDone, 2200);
    return () => clearTimeout(timer);
  }, [match]);
  const vote = (face: SwipeCardFace, verdict: 'yes' | 'no') =>
    setTimeout(() => view.onSwipe(face.poiId, verdict), FLY_MS);
  const cards = useDeckCards(stage.kind === 'deck' ? stage.ahead : NO_CARDS);
  // The guide's reasons for the top card; a card she gave none for offers no "Why this?".
  const whyText =
    stage.kind === 'deck'
      ? [...whyWords(stage.why, view.guide.name), stage.top.note ?? ''].filter(Boolean).join(' ')
      : '';
  return (
    <StampMoment
      landed={match !== null}
      ink="green"
      stamp={
        <RectStamp
          word={t({ id: 'explore.swipe.match', message: 'Match' }).toLocaleUpperCase()}
          ink="green"
        />
      }
      style={{ flex: 1, backgroundColor: theme.color.ground }}
      testID="swipe"
    >
      <View
        style={{
          paddingTop: insets.top + theme.space.gap4,
          paddingHorizontal: theme.space.gutter,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap12,
        }}
      >
        <GlassIconButton
          icon="close"
          label={t({ id: 'explore.premium.swipe.leave', message: 'Leave' })}
          onPress={view.onBack}
          testID="swipe-close"
        />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="headline">
            {t({ id: 'explore.trip.swipeTitle', message: 'Swipe together' })}
          </Text>
          {view.total === 0 ? null : (
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'explore.premium.swipe.progress',
                message: `${deckPosition(stage.kind, view.done, view.total)} of ${view.total}`,
              })}
            </Text>
          )}
        </View>
        <GlassPill
          icon="heart"
          label={String(view.matchCount)}
          onPress={view.onIdeas ?? (() => router.back())}
          testID="swipe-matches"
        />
      </View>
      {view.offline ? (
        <View style={{ paddingHorizontal: theme.space.gap12, paddingTop: theme.space.gap8 }}>
          <OfflinePill />
        </View>
      ) : null}
      <View style={{ flex: 1, padding: theme.space.titleGutter }}>
        {stage.kind === 'building' ? (
          <SwipeWaiting wait={stage.wait} guide={view.guide} onRetry={stage.onRetry} />
        ) : stage.kind === 'deck' ? (
          <SwipeDeck
            ref={deck}
            items={cards}
            keyOf={(face) => face.poiId}
            renderCard={(face) => <CardFace face={face} />}
            inStamp={
              <RectStamp
                word={t({ id: 'explore.premium.swipe.in', message: 'I’m in' }).toLocaleUpperCase()}
                ink="green"
              />
            }
            onVote={(face, verdict) => vote(face, verdict === 'in' ? 'yes' : 'no')}
            style={{ flex: 1 }}
            testID="swipe-deck"
          />
        ) : (
          <SwipeSummary
            ended={stage.ended}
            matches={stage.matches}
            {...(stage.onIdeas === undefined ? {} : { onIdeas: stage.onIdeas })}
          />
        )}
      </View>
      {whyText !== '' && view.whyOpen ? (
        <View style={{ paddingHorizontal: theme.space.gap16, paddingTop: theme.space.gap8 }}>
          <GuideNote
            name={view.guide.name}
            critter={view.guide.kind}
            showName={false}
            text={whyText}
            testID="swipe-why"
          />
        </View>
      ) : null}
      {stage.kind === 'deck' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            paddingBottom: insets.bottom + theme.space.gap16,
            paddingTop: theme.space.gap12,
          }}
        >
          <VoteButton
            icon="close"
            paper
            label={t({ id: 'explore.premium.swipe.no', message: 'Not for me' })}
            onPress={() => deck.current?.vote('out')}
            testID="swipe-no"
          />
          {whyText === '' ? null : (
            <GlassPill
              label={t({ id: 'explore.premium.swipe.why', message: 'Why this?' })}
              onPress={() => view.onWhy(!view.whyOpen)}
              testID="swipe-why-open"
            />
          )}
          <VoteButton
            icon="check"
            paper={false}
            label={t({ id: 'explore.premium.swipe.yes', message: 'I’m in' })}
            onPress={() => deck.current?.vote('in')}
            testID="swipe-yes"
          />
        </View>
      ) : null}
    </StampMoment>
  );
}
