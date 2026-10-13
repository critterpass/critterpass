/**
 * Reactions under a message or sticker (5.01): a white 24-high chip per reaction with its critter
 * (a cropped bust) or doodle emoji, then the count. Tapping your own toggles it; holding a chip
 * shows who reacted. A reaction added while the message is on screen pops in from 0.6 on the
 * Lively spring (a fade under Reduce Motion); chips already there when the row mounts just sit.
 */
import { critters, type Pose } from '@cp/critter-art';
import { parseCritterReaction } from '@cp/domain';
import { t } from '@lingui/core/macro';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import {
  CritterSticker,
  PressableScale,
  REDUCED_FADE,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { ReactionGroup } from '../../chat/data/use-reactions';
import { ring } from '../premium-paint';
import { DOODLE_FOR_EMOJI, Doodle } from './doodle';

const BY_NO = new Map(critters.map((critter) => [critter.no, critter]));

/** The critter a reaction key draws (`c112.cheer` → Tokek cheering), or null for an emoji. */
export function reactionCritter(
  key: string,
): { readonly kind: string; readonly name: string; readonly pose: Pose } | null {
  const parsed = parseCritterReaction(key);
  if (parsed === null) return null;
  const critter = BY_NO.get(parsed.no);
  if (critter === undefined) return null;
  return { kind: critter.kind, name: critter.name, pose: parsed.pose as Pose };
}

/** What a screen reader says for a reaction: the critter's name, or the emoji itself. */
export function reactionLabel(key: string): string {
  return reactionCritter(key)?.name ?? key;
}

const popIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withTiming(1, REDUCED_FADE),
      transform: [{ scale: withSpring(1, SPRINGS.lively) }],
    },
  };
};

const BUST = 20;

const useStyles = makePremiumStyles((th) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap4, marginTop: -2 },
  chip: {
    height: th.size.statusTag,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingStart: 3,
    paddingEnd: 7,
    borderRadius: th.radius.statusTag,
    backgroundColor: th.color.card,
    boxShadow: ring(0.5, th.color.hairline),
  },
  mine: { boxShadow: ring(1.5, th.accent.sun) },
  bust: { width: BUST, height: BUST, overflow: 'hidden', alignItems: 'center' },
}));

export function ReactionFace({
  reaction,
  size = BUST,
}: {
  readonly reaction: string;
  readonly size?: number;
}) {
  const styles = useStyles();
  const critter = reactionCritter(reaction);
  const doodle = DOODLE_FOR_EMOJI[reaction];
  if (doodle !== undefined) return <Doodle name={doodle.name} color={doodle.color} size={size} />;
  if (critter === null) {
    return (
      <Text variant="label" style={{ fontSize: size * 0.7, lineHeight: size }}>
        {reaction}
      </Text>
    );
  }
  return (
    <View style={[styles.bust, { width: size, height: size }]}>
      {/* A bust: drawn larger and cropped at the bottom of its box. */}
      <View style={{ marginTop: -size * 0.1 }}>
        <CritterSticker
          kind={critter.kind}
          name={critter.name}
          size={size * 1.3}
          pose={critter.pose}
          edge={false}
        />
      </View>
    </View>
  );
}

export interface ReactionChipsProps {
  readonly groups: readonly ReactionGroup[];
  readonly readOnly: boolean;
  readonly onToggle: (reaction: string) => void;
  readonly onShowWho: () => void;
}

export function ReactionChips({ groups, readOnly, onToggle, onShowWho }: ReactionChipsProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  // The reactions there when this row mounted (a recycled cell mounts often): only newer ones pop.
  const [seen] = useState<ReadonlySet<string>>(() => new Set(groups.map((group) => group.emoji)));
  if (groups.length === 0) return null;
  return (
    <View style={styles.row}>
      {groups.map((group) => {
        const name = reactionLabel(group.emoji);
        const count = group.count;
        return (
          <Animated.View
            key={group.emoji}
            {...(seen.has(group.emoji)
              ? {}
              : { entering: reduced ? FadeIn.duration(REDUCED_FADE_MS) : popIn })}
          >
            <PressableScale
              style={[styles.chip, group.mine ? styles.mine : null]}
              disabled={readOnly}
              onPress={() => {
                void Haptics.selectionAsync();
                onToggle(group.emoji);
              }}
              onLongPress={onShowWho}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'chat.premium.reaction.label',
                message: `${name} · ${count}`,
              })}
              accessibilityHint={t({
                id: 'chat.premium.reaction.hint',
                message: 'Tap to react, hold to see who',
              })}
            >
              <ReactionFace reaction={group.emoji} />
              <Text variant="badge" color={th.color.inkSecondary}>
                {String(group.count)}
              </Text>
            </PressableScale>
          </Animated.View>
        );
      })}
    </View>
  );
}
