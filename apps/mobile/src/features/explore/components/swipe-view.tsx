/**
 * Swipe together, drawn from plain values: the trip and its dates, who is swiping live, how far
 * through the deck this phone is and how many matches there are, the card on top with the next
 * one under it, and the controls. While the deck is being built, when it is finished or the
 * session has ended, and offline, the page says so in the deck's place.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearBar } from '@/ui/data/LinearBar';
import { Row } from '@/ui/layout/Row';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { PillButton } from '@/ui/buttons/PillButton';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DECK_MINUTES, type DeckWait } from '../deck-wait';
import type { GuideFacts } from '../format';
import type { Verdict, WhyLine } from '../swipe-model';
import { DeckSummary, type DeckSummaryProps } from './deck-summary';
import { MatchStamp, type MatchStampProps } from './match-stamp';
import { SwipeCard, SwipeCardUnder, type SwipeCardFace } from './swipe-card';
import { SwipeControls } from './swipe-controls';
import { WhyThisSheet } from './why-this-sheet';

export type SwipeStage =
  | {
      readonly kind: 'building';
      readonly wait: DeckWait;
      readonly onRetry?: (() => void) | undefined;
    }
  | {
      readonly kind: 'deck';
      readonly top: SwipeCardFace;
      readonly under: SwipeCardFace | null;
      readonly why: readonly WhyLine[];
    }
  | ({ readonly kind: 'summary' } & Omit<DeckSummaryProps, 'guideName' | 'onDone'>);

export interface SwipeViewProps {
  /** Already worded: "Bali · Oct 12–19". */
  readonly eyebrow: string;
  readonly guide: GuideFacts;
  readonly live: readonly StackMember[];
  readonly done: number;
  readonly total: number;
  readonly matchCount: number;
  readonly offline: boolean;
  readonly stage: SwipeStage;
  readonly whyOpen: boolean;
  readonly onWhy: (open: boolean) => void;
  readonly onSwipe: (poiId: string, verdict: Verdict) => void;
  readonly onUndo?: (() => void) | undefined;
  /** The match to stamp now. */
  readonly match: MatchStampProps | null;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, paddingHorizontal: t.size.gutter, gap: t.space['12'] },
  deck: { flex: 1 },
  layer: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
}));

export function SwipeView(props: SwipeViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const { stage, guide } = props;
  const liveCount = props.live.length;
  const { done, total } = props;
  const matches = t({
    id: 'explore.swipe.matches',
    message: plural(props.matchCount, { one: '# match', other: '# matches' }),
  });
  return (
    <Scaffold testID="explore-swipe">
      <View style={[styles.page, { paddingBottom: insets.bottom + theme.space['12'] }]}>
        <BackEyebrow label={props.eyebrow} onPress={props.onBack} testID="explore-back" />
        <Row justify="space-between" align="flex-end" gap="12">
          <View style={{ flex: 1 }}>
            <Text variant="h1">
              {upper(t({ id: 'explore.swipe.title', message: 'Swipe together' }), locale)}
            </Text>
          </View>
          {liveCount === 0 ? null : (
            <View
              style={{ alignItems: 'flex-end', gap: theme.space['4'] }}
              testID="explore-swipe-live"
            >
              <Text variant="label" color={theme.color.pink}>
                {upper(t({ id: 'explore.swipe.live', message: `● ${liveCount} live` }), locale)}
              </Text>
              <AvatarStack members={props.live} max={4} />
            </View>
          )}
        </Row>
        {total === 0 ? null : (
          <LinearBar
            value={done}
            max={total}
            color={theme.semantic.action.primary}
            valueLabel={t({
              id: 'explore.swipe.progress',
              message: `${done}/${total} · ${matches}`,
            })}
            testID="explore-swipe-progress"
          />
        )}
        {props.offline ? (
          <View style={{ gap: theme.space['4'] }}>
            <OfflinePill testID="explore-swipe-offline" />
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'explore.swipe.offline',
                message:
                  'Your swipes are kept and sent when you are back online. Matches show then.',
              })}
            </Text>
          </View>
        ) : null}
        {stage.kind === 'building' ? (
          <DeckWaiting
            guideName={guide.name}
            wait={stage.wait}
            onRetry={stage.onRetry}
            style={styles.deck}
          />
        ) : stage.kind === 'summary' ? (
          <DeckSummary
            ended={stage.ended}
            yesCount={stage.yesCount}
            matches={stage.matches}
            guideName={guide.name}
            onIdeas={stage.onIdeas}
            onDone={props.onBack}
          />
        ) : (
          <>
            <View style={styles.deck}>
              {stage.under === null ? null : (
                <View style={styles.layer}>
                  <SwipeCardUnder face={stage.under} guide={guide} />
                </View>
              )}
              <View style={styles.layer}>
                <SwipeCard
                  // A new card is a new gesture: it starts centred.
                  key={stage.top.poiId}
                  face={stage.top}
                  guide={guide}
                  onSwiped={(verdict) => props.onSwipe(stage.top.poiId, verdict)}
                />
              </View>
            </View>
            <SwipeControls
              onNo={() => props.onSwipe(stage.top.poiId, 'no')}
              onYes={() => props.onSwipe(stage.top.poiId, 'yes')}
              onWhy={() => props.onWhy(true)}
              onUndo={props.onUndo}
            />
          </>
        )}
      </View>
      {stage.kind === 'deck' && props.whyOpen ? (
        <WhyThisSheet
          placeName={stage.top.name}
          guideName={guide.name}
          lines={stage.why}
          note={stage.top.note}
          onClose={() => props.onWhy(false)}
        />
      ) : null}
      {props.match === null ? null : <MatchStamp {...props.match} />}
    </Scaffold>
  );
}

/**
 * No cards yet: what the guide is doing and how long it takes; the cards replace this by
 * themselves when they land. A deck that is not coming says so and offers a fresh start.
 */
function DeckWaiting(props: {
  readonly guideName: string;
  readonly wait: DeckWait;
  readonly onRetry?: (() => void) | undefined;
  readonly style: ViewStyle;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  const name = props.guideName;
  const minutes = DECK_MINUTES;
  const line =
    props.wait === 'stuck'
      ? t({
          id: 'explore.swipe.stuck',
          message: `${name} couldn't finish the cards. Start again and ${name} picks a fresh set.`,
        })
      : props.wait === 'arriving'
        ? t({
            id: 'explore.swipe.arriving',
            message: 'The cards are ready. They are coming onto your phone.',
          })
        : t({
            id: 'explore.swipe.pickingLine',
            message: `${name} is picking cards for the crew. It takes about ${minutes} minutes, and they show up here by themselves.`,
          });
  return (
    <View style={[props.style, { gap: theme.space['12'] }]} testID={`explore-swipe-${props.wait}`}>
      <Text variant="body" singleLine={false} testID="explore-swipe-wait-line">
        {line}
      </Text>
      {props.wait === 'stuck' ? (
        props.onRetry === undefined ? null : (
          <PillButton
            label={t({ id: 'explore.swipe.retry', message: 'Start again' })}
            onPress={props.onRetry}
            testID="explore-swipe-retry"
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          <Skeleton
            preset="photo"
            label={t({ id: 'explore.swipe.building', message: `${name} is picking the cards` })}
          />
        </View>
      )}
    </View>
  );
}
