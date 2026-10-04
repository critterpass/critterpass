/**
 * Friends' cursors on the timeline (3e-2 "MAYA"): an arrow and a name tag in their colour, pinned
 * to the block they're on (plus how far they're dragging it), gliding between updates and fading
 * after 3 s of stillness. Decorative for screen readers; the header says who is here.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { parsePlanAnchor } from '@cp/domain';
import { resolveMemberStyle, tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { PT_PER_MINUTE } from './geometry';
import type { BlockFrame } from './timeline-block';
import { type PlanMember } from '@/data/plan/use-trip-plan';

const IDLE_FADE_MS = 3000;
const GLIDE_MS = tokens.motion.duration.fast;

export interface CursorPlacement {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly x: number;
  readonly y: number;
  /** Changes on every move, restarting the idle fade. */
  readonly at: number;
}

const useStyles = makeStyles((th) => ({
  cursor: { position: 'absolute', zIndex: 30, flexDirection: 'row', alignItems: 'flex-start' },
  arrow: {
    width: 0,
    height: 0,
    borderStartWidth: th.space['6'],
    borderEndWidth: th.space['6'],
    borderBottomWidth: th.space['12'],
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
    transform: [{ rotate: degrees(-35) }],
  },
  tag: {
    marginTop: th.space['8'],
    borderRadius: th.radius.xl,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
  },
}));

/** Where each peer's cursor sits: at its item's block, shifted by the minutes they're dragging. */
export function placeCursors(
  cursors: readonly {
    readonly uid: string;
    readonly anchor: string;
    readonly offset: number;
    readonly at: number;
  }[],
  frames: ReadonlyMap<string, BlockFrame>,
  members: readonly PlanMember[],
): CursorPlacement[] {
  return cursors.flatMap((cursor) => {
    const anchor = parsePlanAnchor(cursor.anchor);
    const frame = anchor?.kind === 'plan_item' ? frames.get(anchor.id) : undefined;
    const member = members.find((candidate) => candidate.uid === cursor.uid);
    if (frame === undefined || member === undefined) return [];
    return [
      {
        uid: cursor.uid,
        name: member.name,
        joinIndex: member.joinIndex,
        x: frame.left + frame.width * 0.72,
        y: frame.top + frame.height * 0.6 + cursor.offset * PT_PER_MINUTE,
        at: cursor.at,
      },
    ];
  });
}

function Cursor({
  cursor,
  reduced,
  fades,
}: {
  readonly cursor: CursorPlacement;
  readonly reduced: boolean;
  readonly fades: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const color = resolveMemberStyle(cursor.joinIndex).color;
  const x = useSharedValue(cursor.x);
  const y = useSharedValue(cursor.y);
  const opacity = useSharedValue(1);
  useEffect(() => {
    x.value = reduced ? cursor.x : withTiming(cursor.x, { duration: GLIDE_MS });
    y.value = reduced ? cursor.y : withTiming(cursor.y, { duration: GLIDE_MS });
    opacity.value = 1;
    if (fades) opacity.value = withDelay(IDLE_FADE_MS, withTiming(0, { duration: GLIDE_MS }));
  }, [cursor.x, cursor.y, cursor.at, reduced, fades, x, y, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  return (
    <Animated.View
      style={[styles.cursor, { top: 0, left: 0 }, style]}
      testID={`plan-cursor-${cursor.uid}`}
    >
      <View style={[styles.arrow, { borderBottomColor: color }]} />
      <View style={[styles.tag, { backgroundColor: color }]}>
        <Text variant="label" color={theme.semantic.text.onAccent}>
          {upper(cursor.name, locale)}
        </Text>
      </View>
    </Animated.View>
  );
}

export function RemoteCursors({
  cursors,
  reduced,
  fades = true,
}: {
  readonly cursors: readonly CursorPlacement[];
  readonly reduced: boolean;
  /** Fade after 3 s still (the lab's stills keep them). */
  readonly fades?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }}
    >
      {cursors.map((cursor) => (
        <Cursor key={cursor.uid} cursor={cursor} reduced={reduced} fades={fades} />
      ))}
    </View>
  );
}
