/**
 * The translations on the menu (3j-3): one sticker per dish, laid over the dish's own line of the
 * still, with the crew chips of the members it was checked for underneath. A dish that clashes
 * with someone's flags shakes once as it lands and is pink.
 */
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Text, makeStyles, useTheme } from '@/ui';

import type { MenuFlag, MenuSticker, MenuStill } from './menu-scan';

const SHAKE_DEGREES = 3;
const SHAKE_STEP_MS = 50;

const useStyles = makeStyles((t) => ({
  frame: { width: '100%', overflow: 'hidden', borderRadius: t.radius.sm },
  sticker: {
    position: 'absolute',
    alignSelf: 'flex-start',
    borderRadius: t.radius.sm,
    borderWidth: 2,
    borderColor: t.color.ink[850],
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['2'],
  },
  chips: { position: 'absolute', gap: t.space['4'], alignItems: 'flex-start' },
  chip: {
    borderRadius: t.radius.sm,
    borderWidth: 2,
    borderColor: t.color.ink[850],
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['2'],
  },
}));

function flagLabel(flag: MenuFlag): string {
  return `${flag.member} ${flag.verdict === 'clash' ? '✕' : '✓'} ${flag.reason}`.trim();
}

function Sticker({ sticker }: { readonly sticker: MenuSticker }) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const still = useReducedImpactMotion();
  const turn = useSharedValue(0);
  const clash = sticker.clash;
  useEffect(() => {
    if (!clash || still) return;
    turn.value = withSequence(
      withTiming(-SHAKE_DEGREES, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_DEGREES, { duration: SHAKE_STEP_MS }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
  }, [clash, still, turn]);
  const shake = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const flags = sticker.flags.map(flagLabel);
  return (
    <>
      <Animated.View
        accessible
        accessibilityRole="text"
        accessibilityLabel={[`${sticker.source}: ${sticker.translation}`, ...flags].join(', ')}
        style={[
          styles.sticker,
          {
            // Over the dish's name, leaving the price at the line's end in view.
            left: `${Math.min(sticker.x + sticker.width * 0.35, 0.6) * 100}%`,
            top: `${sticker.y * 100}%`,
            backgroundColor: clash ? theme.color.pink : theme.color.paper.base,
          },
          shake,
        ]}
        testID={`guide-menu-sticker-${sticker.id}`}
      >
        <Text variant="label" color={theme.color.ink[850]}>
          {upper(sticker.translation, i18n.locale)}
        </Text>
      </Animated.View>
      {sticker.flags.length === 0 ? null : (
        <View
          style={[
            styles.chips,
            {
              left: `${Math.min(sticker.x + sticker.width * 0.35, 0.6) * 100}%`,
              top: `${(sticker.y + sticker.height * 1.6) * 100}%`,
            },
          ]}
        >
          {sticker.flags.map((flag) => (
            <View
              key={`${flag.member}-${flag.reason}`}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    flag.verdict === 'clash' ? theme.color.pink : theme.semantic.state.success,
                },
              ]}
              testID={`guide-menu-flag-${flag.verdict}`}
            >
              <Text variant="label" color={theme.color.ink[850]}>
                {upper(flagLabel(flag), i18n.locale)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export interface MenuStickersProps {
  /** The proportions of the still the stickers sit on. */
  readonly still: Pick<MenuStill, 'width' | 'height'>;
  /** The still itself (the photo; a drawn menu in the lab). */
  readonly children: ReactNode;
  readonly stickers: readonly MenuSticker[];
}

export function MenuStickers({ still, children, stickers }: MenuStickersProps) {
  const styles = useStyles();
  const ratio = still.height > 0 ? still.width / still.height : 0.75;
  return (
    <View style={[styles.frame, { aspectRatio: ratio }]} testID="guide-menu-still">
      {children}
      {stickers.map((sticker) => (
        <Sticker key={sticker.id} sticker={sticker} />
      ))}
    </View>
  );
}
