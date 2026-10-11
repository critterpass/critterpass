/**
 * No results (4.33): the guide thinking in a white disc (bobbing; still under Reduce Motion),
 * "Nothing like that near Ubud", one line from what the server learned (the closest and how far),
 * then each way out with what it gives before it is tapped (a wider time, a related kind, a pin),
 * and the guide's dock with Ask to take the question to its chat.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import {
  Card,
  CritterSticker,
  enterTransition,
  Icon,
  PressableScale,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { hoursAndMinutes, nearestLine, wayOutWords } from '../../search/no-results';
import type { PlainAnswer, WayOut } from '../../search/plain-filters';
import { Doodle, type DoodleName } from '../components/doodle';
import { GuideDock } from '../components/guide-dock';

const DISC = 120;
const GECKO = 100;
const BOB = 4;
const TILE = 40;
const TILE_DOODLE = 36;

const WAY_DOODLE: Readonly<Record<WayOut['kind'], DoodleName>> = {
  widen: 'circle',
  related: 'food',
  pin: 'pin',
};

function ThinkingGuide({
  critter,
  guideName,
}: {
  readonly critter: string;
  readonly guideName: string;
}) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    // The design's slow bob: up and back on the Smooth spring, over and over.
    y.value = withRepeat(
      withSequence(withSpring(-BOB, SPRINGS.smooth), withSpring(0, SPRINGS.smooth)),
      -1,
    );
  }, [reduced, y]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View
      style={{
        alignSelf: 'center',
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        backgroundColor: theme.color.card,
        boxShadow: theme.shadow.raised,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={bob}>
        <CritterSticker kind={critter} name={guideName} size={GECKO} pose="think" />
      </Animated.View>
    </View>
  );
}

export interface FindNoResultsProps {
  readonly answer: PlainAnswer;
  readonly area: string;
  readonly whole?: boolean | undefined;
  readonly limitMinutes: number | null;
  readonly guideName: string;
  readonly critter: string;
  readonly onWayOut: (way: WayOut) => void;
  readonly onAsk: () => void;
  readonly addresses?: ReactNode;
}

export function FindNoResults(props: FindNoResultsProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const { area, limitMinutes: limit } = props;
  const nearest = props.answer.nearest;
  const lead =
    limit === null
      ? t({ id: 'search.none.leadPlain', message: 'Nothing here matches all of that yet.' })
      : t({ id: 'search.none.leadMinutes', message: `Nothing like it within ${limit} minutes.` });
  const closest =
    nearest === null || nearest.minutes === null
      ? ''
      : nearestLine(nearest.name, nearest.area, hoursAndMinutes(nearest.minutes));
  const ways = props.answer.waysOut.some((way) => way.kind === 'pin')
    ? props.answer.waysOut
    : [
        ...props.answer.waysOut,
        { kind: 'pin' as const, params: {}, count: 0, areas: [], openLate: null },
      ];
  return (
    <View
      style={{ gap: theme.space.gap16, paddingTop: theme.space.gap10 }}
      testID="search-no-results"
    >
      <ThinkingGuide critter={props.critter} guideName={props.guideName} />
      <View style={{ gap: theme.space.gap6, paddingHorizontal: theme.space.gap12 }}>
        <Text variant="emptyTitle" align="center" testID="search-no-results-title">
          {area === ''
            ? t({ id: 'search.none.titleHere', message: 'Nothing like that here' })
            : props.whole === true
              ? t({ id: 'search.none.titleIn', message: `Nothing like that in ${area}` })
              : t({ id: 'search.none.title', message: `Nothing like that near ${area}` })}
        </Text>
        <Text variant="emptyLine" tone="muted" align="center">
          {closest === '' ? lead : `${lead} ${closest}`}
        </Text>
      </View>
      {props.addresses}
      <View style={{ gap: theme.space.gap8 }}>
        {ways.map((way, index) => {
          const words = wayOutWords(way, props.guideName);
          return (
            <Animated.View key={way.kind} entering={enterTransition(reduced).delay(index * 60)}>
              <PressableScale
                onPress={() => props.onWayOut(way)}
                accessibilityRole="button"
                accessibilityLabel={`${words.title}. ${words.line}`}
                testID={`search-way-out-${way.kind}`}
              >
                <Card
                  radius={theme.radius.banner}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.gap12,
                    paddingVertical: theme.space.gap12,
                    paddingHorizontal: theme.space.rowPadH,
                  }}
                >
                  <View
                    style={{
                      width: TILE,
                      height: TILE,
                      borderRadius: theme.radius.dayBadge,
                      backgroundColor: theme.color.ground,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Doodle name={WAY_DOODLE[way.kind]} size={TILE_DOODLE} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="rowTitle">{words.title}</Text>
                    <Text variant="caption" tone="muted">
                      {words.line}
                    </Text>
                  </View>
                  <Icon
                    name="forward"
                    size={theme.size.glyph - 2}
                    color={theme.color.placeholder}
                  />
                </Card>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <GuideDock
        guideName={props.guideName}
        critter={props.critter}
        text={t({ id: 'search.none.askLine', message: 'Or ask me. I’ll dig into it with you.' })}
        action={{
          label: t({ id: 'search.none.ask', message: 'Ask' }),
          onPress: props.onAsk,
          testID: 'search-ask-guide',
        }}
      />
    </View>
  );
}
