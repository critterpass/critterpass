/**
 * Swipe together (4.42), full screen with its ✕: "Swipe together" and how far through the deck you
 * are, the matches so far (♥ n, opening Ideas), the card stack (the place's photo or its kind, its
 * name, the guide's line and who else said yes) that votes on a drag or the ✕ / ✓ buttons, "Why
 * this?" for the guide's reasons, the MATCH stamp when enough of the crew said yes, the deck still
 * being built, and the summary at the end. Who is swiping right now is never shown. Every read and
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
  IconButton,
  LoadingCritter,
  OfflinePill,
  PhotoLayer,
  RectStamp,
  StampMoment,
  SwipeDeck,
  Text,
  TextButton,
  usePremiumTheme,
  type SwipeDeckHandle,
} from '@/ui/premium';

import type { SwipeCardFace } from '../../swipe-view-props';
import { whyWords } from '../../components/why-words';
import { useSwipeScreen, type SwipeScreenProps } from '../../use-swipe-screen';
import { placeIcon } from '../../search/place-icons';
import { Doodle } from '../components/doodle';
import { SwipeSummary } from './swipe-summary';
import { useDeckCards } from './use-deck-cards';

const FLY_MS = 450;
const NO_CARDS: readonly SwipeCardFace[] = [];
const HEART = '♥';

function CardFace({ face }: { readonly face: SwipeCardFace }) {
  const theme = usePremiumTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 36,
        backgroundColor: theme.color.card,
        padding: 8,
        boxShadow: theme.shadow.card,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 29,
          overflow: 'hidden',
          backgroundColor: theme.color.control,
        }}
      >
        {face.photo === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Doodle name={placeIcon(face.category)} size={140} />
          </View>
        ) : (
          <PhotoLayer media={face.photo} creditAt="top" />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.color.inkSurface,
              opacity: 0.55,
            }}
          />
          <View style={{ padding: theme.space.gap16, gap: theme.space.gap4 }}>
            <Text variant="stat" tone="onInk" numberOfLines={2}>
              {face.name}
            </Text>
            <Text variant="rowText" tone="onInk" numberOfLines={2}>
              {face.meta}
            </Text>
            {face.social === null ? null : (
              <Text variant="badge" tone="onInk">
                {face.social}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
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
          <Text variant="captionMuted" tone="muted">
            {t({ id: 'explore.premium.swipe.progress', message: `${view.done} of ${view.total}` })}
          </Text>
        </View>
        <GlassPill
          label={`${HEART} ${String(view.matchCount)}`}
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
          <View style={{ flex: 1, justifyContent: 'center', gap: theme.space.gap16 }}>
            <LoadingCritter
              label={t({ id: 'explore.premium.swipe.building', message: 'Building the deck' })}
            />
            {stage.onRetry === undefined ? null : (
              <TextButton
                label={t({ id: 'explore.premium.swipe.retry', message: 'Start again' })}
                onPress={stage.onRetry}
              />
            )}
          </View>
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
      {stage.kind === 'deck' && view.whyOpen ? (
        <View style={{ paddingHorizontal: theme.space.gap16 }}>
          <GuideNote
            name={view.guide.name}
            critter={view.guide.kind}
            showName={false}
            text={[...whyWords(stage.why, view.guide.name), stage.top.note ?? '']
              .filter(Boolean)
              .join(' ')}
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
          <IconButton
            icon="close"
            size={62}
            tone="white"
            label={t({ id: 'explore.premium.swipe.no', message: 'Not for me' })}
            onPress={() => deck.current?.vote('out')}
            testID="swipe-no"
          />
          <GlassPill
            label={t({ id: 'explore.premium.swipe.why', message: 'Why this?' })}
            onPress={() => view.onWhy(!view.whyOpen)}
            testID="swipe-why-open"
          />
          <IconButton
            icon="check"
            size={62}
            tone="ink"
            label={t({ id: 'explore.premium.swipe.yes', message: 'I’m in' })}
            onPress={() => deck.current?.vote('in')}
            testID="swipe-yes"
          />
        </View>
      ) : null}
    </StampMoment>
  );
}
