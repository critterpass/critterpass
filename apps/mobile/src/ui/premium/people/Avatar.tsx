import { useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import type { PremiumTypeName } from '@cp/design-tokens';

import { formerMemberLabel } from '@/lib/people/member-name';

import { Icon } from '../icons/Icon';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { useMemberFace, type MemberFace } from './member-face';

export interface AvatarProps {
  /** The person's name: the initial is drawn from it and assistive tech reads it. */
  readonly name: string;
  /** The person's crew colour (each person keeps one colour everywhere). */
  readonly color: string;
  /**
   * The member's user id: draws the face they chose (a photo, a critter, a guide) in place of the
   * initial. A `photo` or `critter` passed here wins over it.
   */
  readonly uid?: string | null | undefined;
  /** A photo drawn in the circle; the initial shows while it loads and if it fails. */
  readonly photo?: ImageSourcePropType | undefined;
  /** A critter sticker drawn inside the circle instead of the initial. */
  readonly critter?: ReactNode;
  /** @default 32 */
  readonly size?: number;
  /** Ring in the ground colour so overlapping avatars read apart (crew stacks). */
  readonly ringed?: boolean;
  readonly testID?: string;
}

function initialVariant(size: number, large: number, small: number): PremiumTypeName {
  if (size >= large) return 'avatarInitialLarge';
  if (size <= small) return 'avatarInitialSmall';
  return 'avatarInitial';
}

/** First letter of a name, uppercased for its own locale. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? '';
  return first.toLocaleUpperCase();
}

/** What a circle draws: an erased account's glyph, a photo, a critter or the initial. */
export type AvatarFill = 'former' | 'photo' | 'critter' | 'initial';

/**
 * The face wins over the initial; a photo that failed to load falls back to the critter, then the
 * initial. Someone with no name left (an erased account) never shows a face.
 */
export function avatarFill(name: string, face: MemberFace, photoFailed: boolean): AvatarFill {
  if (initialOf(name) === '') return 'former';
  if (face.photo !== undefined && !photoFailed) return 'photo';
  if (face.critter !== undefined && face.critter !== null) return 'critter';
  return 'initial';
}

/** A photo's identity across renders: its address, or the bundled asset number. */
function photoKey(source: ImageSourcePropType | undefined): string | null {
  if (source === undefined) return null;
  if (typeof source === 'number') return String(source);
  if (!Array.isArray(source) && typeof source === 'object' && 'uri' in source) {
    return source.uri ?? null;
  }
  return JSON.stringify(source);
}

/** A remote photo asks the platform cache first, so a face seen once draws at once. */
function cachedSource(source: ImageSourcePropType): ImageSourcePropType {
  if (typeof source === 'object' && !Array.isArray(source) && 'uri' in source) {
    return { ...source, cache: 'force-cache' };
  }
  return source;
}

/**
 * A round crew-colour avatar with the member's chosen face (photo or critter) or, without one, their
 * initial in the on-accent ink; a person with no name left (an erased account) shows the people glyph
 * and reads "Former member".
 */
export function Avatar({
  name,
  color,
  uid,
  photo,
  critter,
  size,
  ringed = false,
  testID,
}: AvatarProps) {
  const t = usePremiumTheme();
  const side = size ?? t.size.avatar;
  const chosen = useMemberFace(uid, side);
  const face: MemberFace = {
    ...((photo ?? chosen.photo) === undefined ? {} : { photo: photo ?? chosen.photo }),
    ...((critter ?? chosen.critter) === undefined ? {} : { critter: critter ?? chosen.critter }),
  };
  const key = photoKey(face.photo);
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const fill = avatarFill(name, face, key !== null && failed === key);
  const initial = initialOf(name);
  const initialText = (
    <Text
      variant={initialVariant(side, t.size.avatarLarge, t.size.avatarSmall)}
      tone="onAccent"
      accessible={false}
    >
      {initial}
    </Text>
  );
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={fill === 'former' ? formerMemberLabel() : name}
      style={{
        width: side,
        height: side,
        borderRadius: side / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...(ringed ? { borderWidth: t.size.stackBorder, borderColor: t.color.stackBorder } : {}),
      }}
    >
      {fill === 'former' ? (
        <Icon name="people" size={Math.round(side * 0.5)} color={t.color.onAccent} />
      ) : null}
      {fill === 'critter' ? face.critter : null}
      {fill === 'initial' ? initialText : null}
      {fill === 'photo' && face.photo !== undefined ? (
        <>
          {loaded === key ? null : initialText}
          <Image
            source={cachedSource(face.photo)}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onLoad={() => setLoaded(key)}
            onError={() => setFailed(key)}
            style={{
              position: 'absolute',
              width: side,
              height: side,
              opacity: loaded === key ? 1 : 0,
            }}
            {...(testID === undefined ? {} : { testID: `${testID}-photo` })}
          />
        </>
      ) : null}
    </View>
  );
}

export interface CrewMember {
  readonly id: string;
  /** The member's user id, for their chosen face; `id` stands in when it is one. */
  readonly uid?: string | null | undefined;
  readonly name: string;
  readonly color: string;
}

export interface CrewStackProps {
  readonly members: readonly CrewMember[];
  /** Spoken summary ("Maya, Jordan and 4 others"). */
  readonly accessibilityLabel: string;
  /** Avatars drawn before the rest fold into "+N". @default 6 */
  readonly max?: number;
  /** @default 32 */
  readonly size?: number;
  readonly testID?: string;
}

/** Overlapping crew avatars (−10 overlap, ground-colour ring), folding the rest into "+N". */
export function CrewStack({ members, accessibilityLabel, max = 6, size, testID }: CrewStackProps) {
  const t = usePremiumTheme();
  const side = size ?? t.size.avatar;
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', paddingEnd: t.size.stackOverlap }}
    >
      {shown.map((m) => (
        <View key={m.id} style={{ marginEnd: -t.size.stackOverlap }}>
          <Avatar name={m.name} color={m.color} uid={m.uid ?? m.id} size={side} ringed />
        </View>
      ))}
      {rest > 0 ? (
        <View
          style={{
            width: side,
            height: side,
            borderRadius: side / 2,
            backgroundColor: t.color.control,
            borderWidth: t.size.stackBorder,
            borderColor: t.color.stackBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="avatarInitialSmall" tone="inkSecondary">
            {`+${String(rest)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
