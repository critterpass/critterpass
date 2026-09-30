/**
 * The trip is full (3f-5 on SEAT_CAP_REACHED): the reply is kept as a waitlist place, and the
 * member is told their place and the cap; a freed seat is offered to them when it comes up.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['14'] },
}));

export interface SeatSheetProps {
  readonly position: number | null;
  readonly cap: number | null;
  readonly onClose: () => void;
}

export function SeatSheet({ position, cap, onClose }: SeatSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Sheet
      title={t({ id: 'proposal.seat.title', message: 'The trip is full' })}
      detents={['medium']}
      onDismiss={onClose}
      testID="board-seat-sheet"
    >
      <View style={styles.body}>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {cap === null
            ? t({ id: 'proposal.seat.body', message: 'Every seat is taken.' })
            : t({ id: 'proposal.seat.bodyCap', message: `All ${cap} seats are taken.` })}{' '}
          {position === null
            ? t({ id: 'proposal.seat.waiting', message: 'You’re on the waitlist.' })
            : t({
                id: 'proposal.seat.position',
                message: `You’re number ${position} on the waitlist.`,
              })}{' '}
          {t({
            id: 'proposal.seat.offer',
            message:
              'If a seat frees up, it’s offered to you first in line. Nothing joins you by itself.',
          })}
        </Text>
        <PillButton
          label={t({ id: 'proposal.seat.ok', message: 'Got it' })}
          onPress={onClose}
          testID="board-seat-ok"
        />
      </View>
    </Sheet>
  );
}
