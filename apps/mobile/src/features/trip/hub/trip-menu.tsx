/**
 * The foot of the trip hub: the one way to end this trip the reader may take (an organiser
 * deletes a setup trip nobody else is on, or calls any other trip off before it starts; a member
 * leaves), behind a confirm sheet that says what happens. A called-off trip shows a note instead.
 */
import { tripRemovals, type TripRemoval } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useState } from 'react';
import { View } from 'react-native';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { toast } from '@/motion/island-toast';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useLiveRows } from './data/live-rows';
import { TRIPS_TAB } from './routes';
import { CANCEL_TRIP, DELETE_TRIP, LEAVE_TRIP } from './trip-commands';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, table names and toast ids, never copy. */
const OTHERS_SQL = `SELECT count(*) AS n FROM trip_participants
  WHERE trip_id = ? AND user_id <> ? AND rsvp <> 'out'`;
const OTHERS_TABLES = ['trip_participants'];
const failedToastId = (tripId: string) => `trip-menu-failed-${tripId}`;
/* eslint-enable lingui/no-unlocalized-strings */

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['16'] },
}));

interface RemovalCopy {
  readonly link: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly confirm: string;
}

function copyFor(removal: TripRemoval): RemovalCopy {
  if (removal === 'delete') {
    return {
      link: t({ id: 'trip.menu.delete', message: 'Delete trip' }),
      title: t({ id: 'trip.menu.deleteTitle', message: 'Delete this trip?' }),
      lines: [
        t({
          id: 'trip.menu.deleteGone',
          message: 'Nobody else is on it yet, so it goes for good: dates, ideas and any draft.',
        }),
        t({ id: 'trip.menu.deleteCrew', message: 'Your crew and its chat stay.' }),
      ],
      confirm: t({ id: 'trip.menu.deleteConfirm', message: 'Delete trip' }),
    };
  }
  if (removal === 'cancel') {
    return {
      link: t({ id: 'trip.menu.cancel', message: 'Call off trip' }),
      title: t({ id: 'trip.menu.cancelTitle', message: 'Call off this trip?' }),
      lines: [
        t({ id: 'trip.menu.cancelTold', message: 'Everyone on it gets told.' }),
        t({
          id: 'trip.menu.cancelKept',
          message: 'The chat, money, bookings and photos stay to read.',
        }),
        t({
          id: 'trip.menu.cancelBoost',
          message: 'Open votes close. A boost moves to your next trip, or comes back as a credit.',
        }),
      ],
      confirm: t({ id: 'trip.menu.cancelConfirm', message: 'Call off trip' }),
    };
  }
  return {
    link: t({ id: 'trip.menu.leave', message: 'Leave trip' }),
    title: t({ id: 'trip.menu.leaveTitle', message: 'Leave this trip?' }),
    lines: [
      t({ id: 'trip.menu.leaveSeat', message: 'Your seat opens for the next person waiting.' }),
      t({
        id: 'trip.menu.leaveMoney',
        message: 'Shared costs are split again without you.',
      }),
    ],
    confirm: t({ id: 'trip.menu.leaveConfirm', message: 'Leave trip' }),
  };
}

function failedToast(tripId: string, code: string | null): void {
  toast.show({
    id: failedToastId(tripId),
    title:
      code === 'STATE_INVALID'
        ? t({
            id: 'trip.menu.stateChanged',
            message: 'The trip changed since you opened it. Have another look.',
          })
        : t({ id: 'trip.menu.failed', message: 'That didn’t go through. Try again with signal.' }),
  });
}

export function TripMenu({
  tripId,
  status,
  role,
  me,
}: {
  readonly tripId: string;
  readonly status: string;
  readonly role: string | null;
  readonly me: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = useLiveRows<{ n: number }>(
    OTHERS_SQL,
    me === null ? null : [tripId, me],
    OTHERS_TABLES,
  );
  if (status === 'cancelled') {
    return (
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
  }
  if (role === null || commands === null || !others.loaded) return null;
  const [removal] = tripRemovals({
    status,
    organiser: role === 'organiser',
    othersOnTrip: others.rows[0]?.n ?? 0,
  });
  if (removal === undefined) return null;
  const copy = copyFor(removal);
  const confirm = () => {
    if (busy) return;
    setBusy(true);
    const spec =
      removal === 'delete' ? DELETE_TRIP : removal === 'cancel' ? CANCEL_TRIP : LEAVE_TRIP;
    void commands.send(spec, { trip_id: tripId }).then((sent) => {
      setBusy(false);
      setOpen(false);
      if (sent.kind !== 'applied') {
        failedToast(tripId, sent.kind === 'rejected' ? sent.code : null);
        return;
      }
      // A deleted or left trip is no longer the reader's to look at: back to the trip list.
      if (removal !== 'cancel') router.navigate(TRIPS_TAB);
    });
  };
  return (
    <View style={styles.body}>
      <TextLink label={copy.link} onPress={() => setOpen(true)} testID={`trip-menu-${removal}`} />
      {open ? (
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
              onConfirm={confirm}
              onCancel={() => setOpen(false)}
              testID={`trip-menu-confirm-${removal}`}
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
