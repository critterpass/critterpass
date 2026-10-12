import { View } from 'react-native';

import { PressableScale } from '../motion/PressableScale';
import { CritterSticker } from '../stickers/CritterSticker';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';

/** Whose voice the note is in: it takes that guide's tint. */
export type GuideTint = 'tokek' | 'pon';

export interface GuideNoteProps {
  /** The guide's name, set in bold ahead of the line ("Tokek"). */
  readonly name: string;
  readonly text: string;
  /** The guide's critter kind (Tokek is the gecko). @default 'gecko' */
  readonly critter?: string;
  /** @default 'tokek' */
  readonly tint?: GuideTint;
  /** Hide the name when the note sits under the guide's own header. */
  readonly showName?: boolean;
  readonly action?: { readonly label: string; readonly onPress: () => void };
  readonly testID?: string;
}

/** The speaker's disc behind the critter: Tokek's yellow, Pon's tangerine. */
function discOf(t: PremiumTheme, tint: GuideTint): string {
  return tint === 'pon' ? t.color.status.tangerine.bg : t.color.status.maybe.bg;
}

/**
 * A guide's note: a neutral white strip (r22) with the speaker's critter in a 36 pt disc of their
 * tint, the bold name leading the line at 13/1.35 in the secondary ink, and an optional ink action
 * pill. The strip follows the card colour in dark mode; only the disc carries the speaker's tint.
 */
export function GuideNote({
  name,
  text,
  critter = 'gecko',
  tint = 'tokek',
  showName = true,
  action,
  testID,
}: GuideNoteProps) {
  const t = usePremiumTheme();
  const disc = t.size.guideCritter;
  return (
    <View
      testID={testID}
      style={{
        borderRadius: t.radius.card,
        backgroundColor: t.color.card,
        boxShadow: t.shadow.float,
        paddingVertical: t.space.gap8,
        paddingStart: t.space.gap8,
        paddingEnd: t.space.rowPadH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap10,
      }}
    >
      <View
        accessible={false}
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          backgroundColor: discOf(t, tint),
          alignItems: 'center',
          justifyContent: 'flex-end',
          overflow: 'hidden',
        }}
      >
        <CritterSticker kind={critter} name={name} size={disc} pose="point" />
      </View>
      <View style={{ flex: 1 }} accessible accessibilityLabel={`${name}: ${text}`}>
        <Text variant="note" tone="inkSecondary">
          {showName ? (
            <Text variant="bannerAction" tone="ink">
              {name}
              {'\u00a0 '}
            </Text>
          ) : null}
          {text}
        </Text>
      </View>
      {action === undefined ? null : (
        <PressableScale onPress={action.onPress} accessibilityLabel={action.label}>
          <View
            style={{
              height: t.size.noteAction,
              paddingHorizontal: t.space.pillSmallPadH,
              borderRadius: t.radius.noteAction,
              backgroundColor: t.color.ink,
              justifyContent: 'center',
            }}
          >
            <Text variant="noteAction" tone="onInk" numberOfLines={1}>
              {action.label}
            </Text>
          </View>
        </PressableScale>
      )}
    </View>
  );
}
