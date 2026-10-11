/**
 * The result tally under the winner stamp (4.06): one row per place with its voters, its count and
 * a bar at its share of the vote in the place's colour; the winner reads ink, the rest muted. The
 * bars fill on Smooth once `fill` turns on.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  Card,
  CrewStack,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
  type CrewMember,
} from '@/ui/premium';

export interface TallyLine {
  readonly id: string;
  readonly name: string;
  readonly votes: number;
  readonly share: number;
  readonly colour: string;
  readonly winner: boolean;
  readonly voters: readonly CrewMember[];
  readonly votersLabel: string;
}

function TallyRow({ line, fill }: { readonly line: TallyLine; readonly fill: boolean }) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const width = useSharedValue(fill ? line.share : 0);
  useEffect(() => {
    if (!fill) return;
    width.set(
      reduced ? withTiming(line.share, REDUCED_FADE) : withSpring(line.share, SPRINGS.smooth),
    );
  }, [fill, line.share, reduced, width]);
  const bar = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, width.value)) * 100}%`,
  }));
  const barHeight = t.size.progressBar + 2;
  return (
    <View style={{ gap: t.space.gap8 }} testID={`reveal-tally-${line.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.gap10 }}>
        <Text
          variant="headline"
          tone={line.winner ? 'ink' : 'muted'}
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {line.name}
        </Text>
        {line.voters.length > 0 ? (
          <CrewStack
            members={line.voters}
            size={24}
            max={6}
            accessibilityLabel={line.votersLabel}
          />
        ) : null}
        <Text
          variant="title"
          tone={line.winner ? 'ink' : 'muted'}
          align="right"
          style={{ minWidth: t.size.checkbox }}
        >
          {String(line.votes)}
        </Text>
      </View>
      <View
        style={{
          height: barHeight,
          borderRadius: barHeight / 2,
          backgroundColor: t.color.control,
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[{ height: '100%', backgroundColor: line.colour }, bar]} />
      </View>
    </View>
  );
}

export function TallyCard({
  lines,
  fill,
  summary,
}: {
  readonly lines: readonly TallyLine[];
  readonly fill: boolean;
  readonly summary: string;
}) {
  const t = usePremiumTheme();
  return (
    <Card radius={t.radius.cardRow} testID="reveal-tally">
      <View
        accessible
        accessibilityLabel={summary}
        style={{
          paddingVertical: t.space.gap16,
          paddingHorizontal: t.space.gap16 + 2,
          gap: t.space.gap16,
        }}
      >
        {lines.map((line) => (
          <TallyRow key={line.id} line={line} fill={fill} />
        ))}
      </View>
    </Card>
  );
}
