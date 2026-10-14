/**
 * The crew pass's two pickers: six guide stickers on a strip card (the picked one lifts in a white
 * bubble with an ink check) and the cover books (the picked one lifts and tilts with a ring; an
 * earned cover not yet unlocked shows a lock and says how to earn it).
 */
/* eslint-disable lingui/no-unlocalized-strings -- style values, never copy. */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import type { CrewCover } from '@cp/domain';

import {
  Card,
  CritterSticker,
  Icon,
  PressableScale,
  ring,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  usePremiumTheme,
} from '@/ui/premium';
import { GUIDE_AVATAR_IDS, guideSticker } from '@/ui/premium/stickers/guides';

import type { CoverOption } from '../crew-look';

export function StickerPicker({
  value,
  onPick,
  testID,
}: {
  readonly value: string;
  readonly onPick: (art: string) => void;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <Card padded={false} style={styles.strip} testID={testID}>
      {GUIDE_AVATAR_IDS.slice(0, 6).map((id) => {
        const sticker = guideSticker(id);
        const on = id === value;
        return (
          <PressableScale
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={sticker.name}
            onPress={() => onPick(id)}
            testID={`${testID ?? 'sticker'}-${id}`}
            style={[
              styles.cell,
              on && {
                backgroundColor: th.color.card,
                borderRadius: 26,
                boxShadow: '0 10px 20px -8px rgba(20,22,40,.35)',
                transform: [{ translateY: -3 }],
              },
              !on && { opacity: 0.92 },
            ]}
          >
            <View style={on ? styles.lifted : null}>
              <CritterSticker
                kind={sticker.kind}
                seed={sticker.seed}
                name={sticker.name}
                size={44}
              />
            </View>
            {on ? <Check /> : null}
          </PressableScale>
        );
      })}
    </Card>
  );
}

function Check() {
  const th = usePremiumTheme();
  return (
    <View
      style={[styles.check, { backgroundColor: th.color.ink, boxShadow: ring(2, th.color.card) }]}
    >
      <Icon name="check" size={10} color={th.color.onInk} />
    </View>
  );
}

export function CoverPicker({
  options,
  value,
  onPick,
  onLocked,
  testID,
}: {
  readonly options: readonly CoverOption[];
  readonly value: CrewCover;
  readonly onPick: (cover: CrewCover) => void;
  /** A locked cover was tapped: say how it is earned. */
  readonly onLocked: (cover: CrewCover) => void;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <ScrollRow
      gap={12}
      bleed={12}
      contentContainerStyle={styles.covers}
      style={styles.coverStrip}
      testID={testID}
    >
      {options.map((option) => {
        const on = option.cover === value;
        return (
          <PressableScale
            key={option.cover}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: option.locked }}
            accessibilityLabel={coverName(option.cover)}
            onPress={() => (option.locked ? onLocked(option.cover) : onPick(option.cover))}
            testID={`${testID ?? 'cover'}-${option.cover}`}
            style={[
              styles.book,
              { backgroundColor: option.fill },
              option.locked && { opacity: 0.45 },
              on && {
                transform: [{ translateY: -8 }, { rotate: '-4deg' }],
                boxShadow: `${ring(3, th.color.ground)}, ${ring(5, th.color.ink)}`,
              },
            ]}
          >
            {option.locked ? <Icon name="lock" size={14} color={th.accent.stickerEdge} /> : null}
            {on ? <Check /> : null}
          </PressableScale>
        );
      })}
    </ScrollRow>
  );
}

/** The spoken name of a cover. */
export function coverName(cover: CrewCover): string {
  const names: Readonly<Record<CrewCover, string>> = {
    tangerine: t({ id: 'crew.premium.cover.tangerine', message: 'Tangerine cover' }),
    sky: t({ id: 'crew.premium.cover.sky', message: 'Sky cover' }),
    mint: t({ id: 'crew.premium.cover.mint', message: 'Mint cover' }),
    pink: t({ id: 'crew.premium.cover.pink', message: 'Pink cover' }),
    sun: t({ id: 'crew.premium.cover.sun', message: 'Sun cover' }),
    ink: t({ id: 'crew.premium.cover.ink', message: 'Ink cover' }),
    navy: t({ id: 'crew.premium.cover.navy', message: 'Navy cover' }),
    collector: t({ id: 'crew.premium.cover.collector', message: 'Collector cover' }),
  };
  return names[cover];
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', padding: 6, justifyContent: 'space-between' },
  cell: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center' },
  lifted: { transform: [{ scale: 1.08 }, { rotate: '-8deg' }] },
  check: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // One row that scrolls sideways (the Pass+ covers sit past the sixth): the row keeps room for
  // the picked book's lift, ring and shadow, and lays out with 14 above and 6 below as before.
  coverStrip: { marginTop: 14 - ROW_ROOM_ABOVE, marginBottom: 6 - ROW_ROOM_BELOW },
  covers: { alignItems: 'flex-start' },
  book: {
    width: 40,
    height: 52,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 5px 0 0 rgba(0,0,0,.12)',
  },
});
