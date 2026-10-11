/**
 * The foot of the trip hub: the one way to end this trip the reader may take (an organiser
 * deletes a trip still being set up that nobody else is on, or calls any other trip off before it starts; a member
 * leaves), behind a confirm sheet that says what happens. A called-off trip shows a note instead.
 */
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useTripRemoval, type TripMenuProps } from './use-trip-removal';

export type { TripMenuProps } from './use-trip-removal';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['16'] },
}));

const NOTHING = { foot: null, sheet: null } as const;

/**
 * The menu in two pieces: `foot` scrolls with the hub, `sheet` fills the screen and so belongs
 * outside the scroll view. Either is null when there is nothing to show.
 */
export function useTripMenu(props: TripMenuProps): {
  readonly foot: ReactNode;
  readonly sheet: ReactNode;
} {
  const styles = useStyles();
  const theme = useTheme();
  const removal = useTripRemoval(props);
  const [open, setOpen] = useState(false);
  if (removal.kind === 'cancelled') {
    const note = (
      <View style={styles.body}>
        <Card tone="sunken" testID="trip-cancelled-note">
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'trip.menu.cancelledNote',
              message: 'This trip was called off. The chat, money, bookings and photos stay here.',
            })}
          </Text>
        </Card>
      </View>
    );
    return { foot: note, sheet: null };
  }
  if (removal.kind === 'none') return NOTHING;
  const { copy } = removal;
  return {
    foot: (
      <View style={styles.body}>
        <TextLink
          label={copy.link}
          onPress={() => setOpen(true)}
          testID={`trip-menu-${removal.removal}`}
        />
      </View>
    ),
    sheet: open ? (
      <Sheet
        detents={['fit']}
        onDismiss={() => setOpen(false)}
        accessibilityLabel={copy.title}
        testID="trip-menu-sheet"
      >
        <View style={styles.body}>
          <ConfirmSheet
            title={copy.title}
            consequences={copy.lines}
            confirmLabel={copy.confirm}
            onConfirm={() => removal.confirm(() => setOpen(false))}
            onCancel={() => setOpen(false)}
          />
        </View>
      </Sheet>
    ) : null,
  };
}

/** Both pieces together, for a screen with no scroll view between them. */
export function TripMenu(props: TripMenuProps) {
  const menu = useTripMenu(props);
  return (
    <>
      {menu.foot}
      {menu.sheet}
    </>
  );
}
