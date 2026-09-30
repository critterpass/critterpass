/**
 * A member's own part of the rooms step (undesigned; from the chip and pill patterns): their room
 * wishes, which the guide reads when it groups the rooms (only the grouping sees them), and "Ask to
 * swap", which tells the organiser without changing anything itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- room chip keys, never copy. */
import { t } from '@lingui/core/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { chipName, type RoomChipKey } from './copy';

export type { RoomChipKey } from './copy';

export const ROOM_CHIP_KEYS: readonly RoomChipKey[] = [
  'early_bird',
  'night_owl',
  'light_sleeper',
  'snorer',
  'dont_care',
];

const useStyles = makeStyles((th) => ({
  chips: { flexWrap: 'wrap', gap: th.space['8'] },
}));

export function MemberRoomTools({
  chips,
  onToggleChip,
}: {
  readonly chips: readonly RoomChipKey[];
  readonly onToggleChip: (chip: RoomChipKey) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="10" testID="setup-rooms-member-tools">
      <Text variant="eyebrow">{t({ id: 'setup.rooms.wishes', message: 'Your room wishes' })}</Text>
      {chips.length === 0 ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="setup-rooms-no-wishes">
          {t({
            id: 'setup.rooms.wishesMissing',
            message: 'Pick any that fit you. Nobody sees them; they only shape the rooms.',
          })}
        </Text>
      ) : null}
      <Row style={styles.chips}>
        {ROOM_CHIP_KEYS.map((chip, index) => (
          <ChoiceChip
            key={chip}
            label={chipName(chip)}
            selected={chips.includes(chip)}
            onPress={() => onToggleChip(chip)}
            tilt={index % 2 === 0 ? -2 : 2}
            testID={`setup-rooms-chip-${chip}`}
          />
        ))}
      </Row>
    </Stack>
  );
}

/** The member's swap request, in the step's footer: the button, then who it went to. */
export function MemberSwapAction({
  swapAsked,
  organiser,
  onAskSwap,
}: {
  readonly swapAsked: boolean;
  readonly organiser: string;
  readonly onAskSwap: () => void;
}) {
  const theme = useTheme();
  return swapAsked ? (
    <Text variant="bodySm" color={theme.semantic.state.success} testID="setup-rooms-swap-sent">
      {t({ id: 'setup.rooms.swapSent', message: `Asked ${organiser} for a swap.` })}
    </Text>
  ) : (
    <PillButton
      label={t({ id: 'setup.rooms.askSwap', message: 'Ask to swap' })}
      onPress={onAskSwap}
      variant="secondary"
      block
      testID="setup-rooms-ask-swap"
    />
  );
}
