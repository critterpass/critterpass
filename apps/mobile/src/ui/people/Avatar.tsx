import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Animated from 'react-native-reanimated';

import { resolveMemberStyle } from '@cp/design-tokens';

import { useLoop } from '@/motion/use-loop';

import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { useMemberFace } from './member-face';
import { formerMemberLabel, isFormerMember } from './member-name';
import type { TextVariant } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  readonly name: string;
  /**
   * The member's user id: draws the face they chose (a photo, a critter, a guide) in place of the
   * initial. A `photo` or `critter` passed here wins over it.
   */
  readonly uid?: string | null | undefined;
  /** 0-based crew join order: picks the member colour and, for members 7–16, the ring pattern. */
  readonly joinIndex?: number;
  readonly photo?: ImageSourcePropType;
  /** A critter sticker drawn inside the circle instead of the initial. */
  readonly critter?: ReactNode;
  /** @default 'md' */
  readonly size?: AvatarSize;
  /** Invited but not joined yet: bobs gently and reads as pending. */
  readonly pending?: boolean;
  /** 2 pt ring in the background colour so overlapping avatars read as cut out. @default true */
  readonly cutout?: boolean;
  /** Hidden from assistive tech when a parent (a stack, a row) already names the person. */
  readonly decorative?: boolean;
  readonly testID?: string;
}

const INITIAL_VARIANT: Record<AvatarSize, TextVariant> = {
  sm: 'label',
  md: 'label',
  lg: 'title',
  xl: 'h3',
};

const useStyles = makeStyles(() => ({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
}));

/** Graphemes-aware first letter, uppercased with the platform's locale rules by `<Text>`. */
function initialOf(name: string): string {
  const [first] = Array.from(name.trim());
  return first ?? '?';
}

/** A crew member: initial, photo or critter in their member colour, with pattern ring and cut-out. */
export function Avatar({
  name,
  uid,
  joinIndex = 0,
  photo,
  critter,
  size = 'md',
  pending = false,
  cutout = true,
  decorative = false,
  testID,
}: AvatarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const tone = useSurfaceTone();
  const bob = useLoop('bob', { active: pending });
  const diameter = sizeToken(theme.size.avatar, size);
  const face = useMemberFace(uid, diameter);
  const shownPhoto = photo ?? face.photo;
  const shownCritter = critter ?? face.critter;
  const member = resolveMemberStyle(joinIndex);
  const cut = tone === 'paper' ? theme.color.paper.base : theme.semantic.bg.base;
  const ringWidth = cutout ? theme.ring.cutout.widthPt : 0;
  const patternRing =
    member.pattern === 'solid'
      ? null
      : {
          borderWidth: member.pattern === 'double' ? 3 : 2,
          borderStyle: member.pattern === 'double' ? ('solid' as const) : ('dashed' as const),
          borderColor: member.color,
        };
  const former = isFormerMember(name);
  const label = former
    ? formerMemberLabel()
    : pending
      ? t({ id: 'common.avatar.pending', message: `${name}, invited` })
      : name;
  return (
    <Animated.View
      testID={testID}
      style={[
        { padding: patternRing ? 2 : 0, borderRadius: diameter },
        former ? null : patternRing,
        pending ? bob : null,
      ]}
      {...(decorative
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
    >
      <View
        style={[
          styles.circle,
          {
            width: diameter + ringWidth * 2,
            height: diameter + ringWidth * 2,
            borderRadius: diameter,
            borderWidth: ringWidth,
            borderColor: cut,
            // Someone who left for good: a plain circle, no colour and no initial.
            backgroundColor: former ? theme.semantic.bg.control : member.color,
            opacity: pending ? 0.7 : 1,
          },
        ]}
      >
        {former ? null : shownPhoto ? (
          <Image
            source={shownPhoto}
            style={styles.fill}
            accessibilityIgnoresInvertColors
            {...(testID ? { testID: `${testID}-photo` } : {})}
          />
        ) : shownCritter ? (
          shownCritter
        ) : (
          <Text variant={INITIAL_VARIANT[size]} color={theme.semantic.text.onAccent}>
            {initialOf(name)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
