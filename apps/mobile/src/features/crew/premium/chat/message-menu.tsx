/**
 * Holding a message (5.04) or a sticker (5.09): the chat dims behind a frost, the message lifts in
 * place (a bubble to 1.03, a sticker grows to 150), a reaction bar sits above it (five doodles and
 * "more" for a message, six critters for a sticker) and a glass menu below it. Everything comes in
 * on the Snappy spring from 0.9 and leaves on a fade; Reduce Motion fades. Tapping outside closes
 * it. A message taller than 40% of the screen lifts only its top, so the menu always stays on screen.
 */
import { critterReactionKey, DOODLE_REACTIONS } from '@cp/domain';
import { t } from '@lingui/core/macro';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import {
  GlassSurface,
  Icon,
  PressableScale,
  REDUCED_FADE,
  SPRINGS,
  makePremiumStyles,
  reducedFadeIn,
  reducedFadeOut,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumIconName,
} from '@/ui/premium';

import type { ReactionGroup } from '../../chat/data/use-reactions';
import { CHAT_PAINT } from '../premium-paint';
import type { MessageAnchor } from './message-row';
import { MENU_ROW, MenuRow } from './menu-row';
import { ReactionFace, reactionLabel } from './reaction-chips';

/** The sticker bar's critters: Tokek cheering and thinking, Pon, the sardine, the puffin, Tokek asleep. */
export const STICKER_BAR = [
  critterReactionKey(112, 'cheer'),
  critterReactionKey(112, 'think'),
  critterReactionKey(61, 'idle'),
  critterReactionKey(76, 'idle'),
  critterReactionKey(148, 'idle'),
  critterReactionKey(112, 'sleep'),
] as const;

export interface MenuAction {
  readonly key: string;
  readonly label: string;
  readonly icon: PremiumIconName;
  readonly destructive?: boolean;
  readonly onPress: () => void;
}

const MENU_WIDTH = 250;
/** The lifted message takes at most this share of the screen's height. */
const PREVIEW_SHARE = 0.4;
const BAR_HEIGHT = 54;

const useStyles = makePremiumStyles((th) => ({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: CHAT_PAINT.menuScrim },
  // Over the header and the status bar too; with no blur on hand the frost is thick enough that
  // the chat behind reads as shapes, not words.
  root: { ...StyleSheet.absoluteFill, zIndex: 10 },
  frost: { ...StyleSheet.absoluteFill, backgroundColor: th.color.ground, opacity: 0.82 },
  lifted: { position: 'absolute' },
  liftedShadow: { borderRadius: th.radius.banner },
  liftedClip: { borderRadius: th.radius.banner, overflow: 'hidden' },
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: th.space.gap8,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  cell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: th.radius.card,
    overflow: 'hidden',
  },
  hairline: { height: th.size.hairline, backgroundColor: th.color.hairlineMenu },
  band: { height: 6, backgroundColor: th.color.segmentTrack },
}));

export interface MessageMenuProps {
  readonly anchor: MessageAnchor;
  readonly sticker: boolean;
  readonly mine: boolean;
  readonly reactions: readonly ReactionGroup[];
  readonly actions: readonly MenuAction[];
  readonly destructive: readonly MenuAction[];
  /** The lifted message, drawn by the caller at the anchor's size. */
  readonly preview: ReactNode;
  readonly onReact: (reaction: string) => void;
  readonly onClose: () => void;
}

/** Rises from 0.9 on the Snappy spring while it fades in. */
const popIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, REDUCED_FADE),
      transform: [{ scale: withSpring(1, SPRINGS.snappy) }],
    },
  };
};

/** Where the lifted message sits, and how much of it shows, so the bar and the menu fit too. */
export function menuPlacement(input: {
  readonly anchorY: number;
  readonly anchorHeight: number;
  readonly lift: number;
  readonly menuHeight: number;
  readonly windowHeight: number;
}): { readonly top: number; readonly liftedHeight: number } {
  const liftedHeight = Math.min(
    input.anchorHeight * input.lift,
    input.windowHeight * PREVIEW_SHARE,
  );
  const top = Math.max(
    110,
    Math.min(input.anchorY, input.windowHeight - liftedHeight - input.menuHeight - 140),
  );
  return { top, liftedHeight };
}

export function MessageMenu(props: MessageMenuProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const window = useWindowDimensions();
  const [more, setMore] = useState(false);
  // The lifted copy's own height once laid out: their message adds its sender's name, so it can
  // outgrow the row; until then the row's height places the bar and the menu.
  const [height, setHeight] = useState<number | null>(null);
  const { anchor } = props;
  const lift = props.sticker ? 150 / 112 : 1.03;
  const menuHeight =
    MENU_ROW * (props.actions.length + props.destructive.length) +
    (props.destructive.length > 0 ? 6 : 0);
  // Keep the bar, the lifted message and the menu on screen together.
  const { top, liftedHeight } = menuPlacement({
    anchorY: anchor.y,
    anchorHeight: height ?? anchor.height,
    lift,
    menuHeight,
    windowHeight: window.height,
  });
  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);
  const left = props.mine ? undefined : 16;
  const right = props.mine ? 16 : undefined;
  const mine = new Set(props.reactions.filter((group) => group.mine).map((group) => group.emoji));
  const choices: readonly string[] = props.sticker || more ? STICKER_BAR : DOODLE_REACTIONS;
  const enter = reduced ? reducedFadeIn() : popIn;

  return (
    <Animated.View
      style={styles.root}
      entering={reducedFadeIn()}
      exiting={reducedFadeOut()}
      testID="chat-message-menu"
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={props.onClose}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'chat.premium.menu.close', message: 'Close' })}
      >
        <View style={styles.frost} />
        {props.sticker ? null : <View style={styles.scrim} />}
      </Pressable>
      <Animated.View
        entering={enter}
        style={[
          styles.bar,
          { top: top - BAR_HEIGHT - 12, left: left ?? undefined, right: right ?? undefined },
        ]}
      >
        <GlassSurface kind="regular" style={StyleSheet.absoluteFill} />
        {choices.map((reaction) => (
          <PressableScale
            key={reaction}
            style={[
              styles.cell,
              mine.has(reaction) ? { backgroundColor: CHAT_PAINT.myReaction } : null,
            ]}
            onPress={() => {
              void Haptics.selectionAsync();
              props.onReact(reaction);
              props.onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={reactionLabel(reaction)}
            accessibilityState={{ selected: mine.has(reaction) }}
            testID={`chat-react-${reaction}`}
          >
            <ReactionFace reaction={reaction} size={32} />
          </PressableScale>
        ))}
        {props.sticker || more ? null : (
          <PressableScale
            style={[styles.cell, { backgroundColor: th.color.segmentTrack }]}
            onPress={() => setMore(true)}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'chat.premium.menu.more', message: 'More reactions' })}
          >
            <Icon name="plus" size={18} color={th.color.ink} />
          </PressableScale>
        )}
      </Animated.View>
      {/* At the row's width, so the words wrap as they did in the chat; the shadow hugs the bubble. */}
      <View
        pointerEvents="none"
        style={[
          styles.lifted,
          {
            top,
            left: anchor.x,
            width: anchor.width,
            alignItems: props.mine ? 'flex-end' : 'flex-start',
            transform: [{ scale: lift }],
            // eslint-disable-next-line lingui/no-unlocalized-strings -- style keywords, never copy.
            transformOrigin: props.mine ? 'top right' : 'top left',
          },
        ]}
      >
        <View
          style={props.sticker ? null : [styles.liftedShadow, { boxShadow: CHAT_PAINT.menuShadow }]}
        >
          <View
            style={[
              props.sticker ? null : styles.liftedClip,
              { maxHeight: (window.height * PREVIEW_SHARE) / lift },
            ]}
            onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
          >
            {props.preview}
          </View>
        </View>
      </View>
      <Animated.View
        entering={enter}
        style={[
          styles.menu,
          { top: top + liftedHeight + 12, left: left ?? undefined, right: right ?? undefined },
        ]}
      >
        <GlassSurface kind="sheet" style={StyleSheet.absoluteFill} />
        {props.actions.map((action, index) => (
          <View key={action.key}>
            {index === 0 ? null : <View style={styles.hairline} />}
            <MenuRow action={action} onClose={props.onClose} />
          </View>
        ))}
        {props.destructive.length === 0 ? null : <View style={styles.band} />}
        {props.destructive.map((action) => (
          <MenuRow key={action.key} action={action} onClose={props.onClose} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}
