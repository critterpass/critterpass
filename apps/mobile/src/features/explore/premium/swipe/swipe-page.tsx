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

import { MediaLayer } from '@/ui/media/MediaLayer';
import {
  Button,
  Card,
  GlassIconButton,
  GlassPill,
  GuideNote,
  IconButton,
  LoadingCritter,
  OfflinePill,
  RectStamp,
  StampMoment,
  SwipeDeck,
  Text,
  TextButton,
  usePremiumTheme,
  type SwipeDeckHandle,
} from '@/ui/premium';

import type { SwipeCardFace } from '../../components/swipe-card';
import { whyWords } from '../../components/why-this-sheet';
import { useSwipeScreen, type SwipeScreenProps } from '../../use-swipe-screen';
import { placeIcon } from '../../search/place-icons';
import { Doodle } from '../components/doodle';

const FLY_MS = 450;
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
          <MediaLayer
            media={face.photo}
            surface="dark"
            accent={theme.accent.sun}
            dots={false}
            creditAt="top"
          />
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
  const ideas = stage.kind === 'summary' ? stage.onIdeas : undefined;
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
          onPress={ideas ?? (() => router.back())}
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
            key={stage.top.poiId}
            ref={deck}
            items={stage.under === null ? [stage.top] : [stage.top, stage.under]}
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
          <Card padded style={{ marginTop: theme.space.gap16 }} testID="swipe-summary">
            <Text variant="title">
              {stage.ended
                ? t({ id: 'explore.swipe.endedTitle', message: 'This session is over' })
                : t({ id: 'explore.swipe.doneTitle', message: "That's the deck" })}
            </Text>
            {stage.matches.map((entry) => (
              <Text key={entry.id} variant="rowText">
                {`${HEART} ${entry.name}`}
              </Text>
            ))}
            {stage.onIdeas === undefined ? null : (
              <Button
                label={t({ id: 'explore.swipe.seeIdeas', message: 'See them in Ideas' })}
                onPress={stage.onIdeas}
                testID="swipe-see-ideas"
              />
            )}
          </Card>
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
