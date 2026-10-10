import { View } from 'react-native';

import type { PremiumTypeName } from '@cp/design-tokens';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface AvatarProps {
  /** The person's name: the initial is drawn from it and assistive tech reads it. */
  readonly name: string;
  /** The person's crew colour (each person keeps one colour everywhere). */
  readonly color: string;
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

/** A round crew-colour avatar with the person's initial in the on-accent ink. */
export function Avatar({ name, color, size, ringed = false, testID }: AvatarProps) {
  const t = usePremiumTheme();
  const side = size ?? t.size.avatar;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: side,
        height: side,
        borderRadius: side / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        ...(ringed ? { borderWidth: t.size.stackBorder, borderColor: t.color.stackBorder } : {}),
      }}
    >
      <Text
        variant={initialVariant(side, t.size.avatarLarge, t.size.avatarSmall)}
        tone="onAccent"
        accessible={false}
      >
        {initialOf(name)}
      </Text>
    </View>
  );
}

export interface CrewMember {
  readonly id: string;
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
          <Avatar name={m.name} color={m.color} size={side} ringed />
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
