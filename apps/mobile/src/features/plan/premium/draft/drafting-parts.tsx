/** The drafting page's step marks and the days as tilted stickers (4.20). */
import { View } from 'react-native';

import { Icon, Spinner, Text, usePremiumTheme } from '@/ui/premium';

import type { StepRow } from '../../draft/data/job';
import type { DraftingViewProps } from '../../draft/drafting/drafting-props';
import { dayCardLabel } from '../../draft/drafting/step-copy';
import { dayColours } from '../map';

const DISC = 22;
/* eslint-disable-next-line lingui/no-unlocalized-strings -- sticker tilts, never copy. */
const TILTS = ['-3deg', '3deg'] as const;
/**
 * Rows of day stickers sit this far apart: a full-width sticker tilted 3° lifts each end about
 * 9 pt, so two neighbours tilted apart need 18 pt to clear each other.
 */
const STICKER_ROW_GAP = 20;

export function StepMark({ status }: { readonly status: StepRow['status'] }) {
  const theme = usePremiumTheme();
  if (status === 'done') {
    return (
      <View
        style={{
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          backgroundColor: theme.accent.mint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="check" size={13} color={theme.color.onAccent} stroke={3} />
      </View>
    );
  }
  // The running step turns in ink on the track the waiting rings use (the kit's default head is
  // white, for the ink pill, and vanished on the white card).
  if (status === 'running') {
    return <Spinner size={DISC} color={theme.color.ink} trackColor={theme.color.progressTodo} />;
  }
  return (
    <View
      style={{
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        borderWidth: status === 'failed' ? 2.5 : 2,
        borderColor:
          status === 'failed' ? theme.color.destructive.fieldRing : theme.color.progressTodo,
      }}
    />
  );
}

export function DayStickers({
  days,
  locale,
}: {
  readonly days: DraftingViewProps['dayCards'];
  readonly locale: string;
}) {
  const theme = usePremiumTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: theme.space.gap8,
        rowGap: STICKER_ROW_GAP,
        paddingVertical: theme.space.gap6,
      }}
      testID="drafting-days"
    >
      {days.map((day, index) => (
        <View
          key={day.dayNo}
          style={{
            paddingVertical: theme.space.gap8,
            paddingHorizontal: theme.space.gap12,
            borderRadius: theme.radius.tag,
            borderWidth: 2.5,
            borderColor: theme.accent.stickerEdge,
            backgroundColor: dayColours(day.dayNo).fill,
            boxShadow: theme.shadow.sticker,
            transform: [{ rotate: TILTS[index % 2] ?? TILTS[0] }],
          }}
        >
          <Text variant="caption" color={theme.color.onAccent}>
            {dayCardLabel(day, locale)}
          </Text>
        </View>
      ))}
    </View>
  );
}
