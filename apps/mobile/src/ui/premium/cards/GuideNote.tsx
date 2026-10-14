import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

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

/** The words keep at least this share of the room beside the critter, or the action moves under them. */
const WORDS_SHARE = 0.6;

/**
 * Whether the action goes under the words: beside them it would leave the words less than
 * `WORDS_SHARE` of the room right of the critter (a wide "Find bookings in my email" squeezed the
 * line into a five-line column).
 */
export function stacksAction(room: number, action: number, gap: number): boolean {
  if (room <= 0 || action <= 0) return false;
  return room - action - gap < room * WORDS_SHARE;
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
  const gap = t.space.gap10;
  const [room, setRoom] = useState(0);
  const [actionWidth, setActionWidth] = useState(0);
  const stacked = action !== undefined && stacksAction(room, actionWidth, gap);
  const onRow = (event: LayoutChangeEvent) => {
    const inner = event.nativeEvent.layout.width - t.space.gap8 - t.space.rowPadH;
    setRoom(Math.max(0, inner - disc - gap));
  };
  const onAction = (event: LayoutChangeEvent) => setActionWidth(event.nativeEvent.layout.width);
  const pill =
    action === undefined ? null : (
      <PressableScale
        onPress={action.onPress}
        accessibilityLabel={action.label}
        onLayout={onAction}
        style={stacked ? { alignSelf: 'flex-start', marginTop: t.space.gap6 } : null}
      >
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
    );
  return (
    <View
      testID={testID}
      onLayout={onRow}
      style={{
        borderRadius: t.radius.card,
        backgroundColor: t.color.card,
        boxShadow: t.shadow.float,
        paddingVertical: t.space.gap8,
        paddingStart: t.space.gap8,
        paddingEnd: t.space.rowPadH,
        flexDirection: 'row',
        alignItems: 'center',
        gap,
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
      <View style={{ flex: 1 }}>
        <View accessible accessibilityLabel={`${name}: ${text}`}>
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
        {stacked ? pill : null}
      </View>
      {stacked ? null : pill}
    </View>
  );
}
