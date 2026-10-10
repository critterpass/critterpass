import { View } from 'react-native';

import { PressableScale } from '../motion/PressableScale';
import { CritterSticker } from '../stickers/CritterSticker';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';

/** Whose voice the note is in: it takes that guide's tint. */
export type GuideTint = 'tokek' | 'pon';

export interface GuideNoteProps {
  /** The guide's name, in Borel above the line ("Tokek"). */
  readonly name: string;
  readonly text: string;
  /** The guide's critter kind (Tokek is the gecko). @default 'gecko' */
  readonly critter?: string;
  /** @default 'tokek' */
  readonly tint?: GuideTint;
  /** Hide the name line when the note sits under the guide's own header. */
  readonly showName?: boolean;
  readonly action?: { readonly label: string; readonly onPress: () => void };
  readonly testID?: string;
}

function tintOf(t: PremiumTheme, tint: GuideTint) {
  return tint === 'pon' ? t.color.status.tangerine : t.color.banner.guide;
}

/**
 * A guide's note: r20 on the speaker's tint with the 38 pt critter, the name in the guide's voice,
 * the line at 13/1.35 and an optional ink action pill. Text on the tint stays dark in light and
 * cream in dark, never yellow on yellow.
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
  const colours = tintOf(t, tint);
  return (
    <View
      testID={testID}
      style={{
        borderRadius: t.radius.banner,
        backgroundColor: colours.bg,
        paddingVertical: t.space.rowPadV,
        paddingStart: t.space.gap8,
        paddingEnd: t.space.gap12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap8,
      }}
    >
      <CritterSticker kind={critter} name={name} size={t.size.guideCritter} pose="point" />
      <View style={{ flex: 1 }} accessible accessibilityLabel={`${name}: ${text}`}>
        {showName ? (
          <Text variant="guideName" tone="guideName">
            {name}
          </Text>
        ) : null}
        <Text variant="note" color={colours.text}>
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
