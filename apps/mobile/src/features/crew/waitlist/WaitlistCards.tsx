/**
 * The caller's place on full trips, on top of the crews sheet and on Home (the Home crew's trips
 * only): "You're next for a seat" (or their number in line) while they wait, and, once a seat
 * frees up, the offer with the time left and TAKE THE SEAT. An offer is never a join: nothing happens until they take it, and an unanswered
 * one passes on after a day. Undesigned; built from the card and pill patterns.
 */
/* eslint-disable lingui/no-unlocalized-strings -- the SQL below; copy goes through t. */
import { t } from '@lingui/core/macro';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { defineClientCommand } from '@/data/commands/summaries';
import type { CommandClient } from '@/data/commands/client';
import { watchRows } from '@/data/status/watch-rows';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { rowId } from '../crews-sheet/crew-commands';

export const ACCEPT_SEAT_OFFER = defineClientCommand<{ offer_id: string }>({
  name: 'accept_seat_offer',
  offline: false,
});

interface PlaceRow {
  readonly trip_id: string;
  readonly place: string | null;
  readonly waitlist_position: number | null;
  readonly offer_id: string | null;
  readonly offer_expires_at: string | null;
}

const UUID = /^[0-9a-f-]{36}$/iu;
const HOUR_MS = 3_600_000;

function watchPlaces(
  db: AbstractPowerSyncDatabase,
  uid: string,
  crewId: string | null,
  now: string,
  onRows: (rows: PlaceRow[]) => void,
) {
  if (!UUID.test(uid) || (crewId !== null && !UUID.test(crewId))) return () => undefined;
  return watchRows<PlaceRow>(
    db,
    `SELECT tp.trip_id, d.name AS place, tp.waitlist_position,
            o.id AS offer_id, o.expires_at AS offer_expires_at
       FROM trip_participants tp
       LEFT JOIN trips t ON t.id = tp.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN seat_waitlist_offers o ON o.trip_id = tp.trip_id AND o.user_id = tp.user_id
            AND o.status = 'offered' AND o.expires_at > '${now}'
      WHERE tp.user_id = '${uid}' AND tp.rsvp = 'waitlisted'
        ${crewId === null ? '' : `AND t.crew_id = '${crewId}'`}
      ORDER BY tp.waitlist_position`,
    ['trip_participants', 'trips', 'destinations', 'seat_waitlist_offers'],
    onRows,
  );
}

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['12'] },
  card: { gap: th.space['8'] },
}));

export function WaitlistCards({
  db,
  uid,
  commands,
  now,
  crewId = null,
}: {
  readonly db: AbstractPowerSyncDatabase | null;
  readonly uid: string | null;
  readonly commands: Pick<CommandClient, 'send'> | null;
  readonly now: Date;
  /** Only this crew's trips (Home is crew-scoped); every crew's when absent (the crews sheet). */
  readonly crewId?: string | null;
}) {
  const styles = useStyles();
  const [rows, setRows] = useState<readonly PlaceRow[]>([]);
  const [taking, setTaking] = useState<string | null>(null);
  const nowIso = now.toISOString().slice(0, 16);
  useEffect(() => {
    if (db === null || uid === null) return undefined;
    return watchPlaces(db, uid, crewId, nowIso, setRows);
  }, [db, uid, crewId, nowIso]);

  const take = (offerId: string, place: string) => {
    if (commands === null) return;
    setTaking(offerId);
    void commands.send(ACCEPT_SEAT_OFFER, { offer_id: offerId }).then((sent) => {
      setTaking(null);
      toast.show(
        sent.kind === 'applied'
          ? {
              id: rowId('seat-taken', offerId),
              title: t({ id: 'crew.waitlist.taken', message: `You’re in for ${place}` }),
            }
          : {
              id: rowId('seat-missed', offerId),
              title: t({
                id: 'crew.waitlist.missed',
                message: 'That seat went to someone else. You’re still in line.',
              }),
            },
      );
    });
  };

  if (rows.length === 0) return null;
  return (
    <View style={styles.root} testID="waitlist-cards">
      {rows.map((row) => {
        const place = row.place ?? t({ id: 'crew.waitlist.theTrip', message: 'the trip' });
        const position = row.waitlist_position ?? 1;
        if (row.offer_id !== null && row.offer_expires_at !== null) {
          const offerId = row.offer_id;
          const hours = Math.max(
            1,
            Math.ceil((Date.parse(row.offer_expires_at) - now.getTime()) / HOUR_MS),
          );
          return (
            <Card key={row.trip_id} tone="green" testID={rowId('seat-offer', offerId)}>
              <View style={styles.card}>
                <Text variant="h3">
                  {t({ id: 'crew.waitlist.offerTitle', message: `A seat opened on ${place}` })}
                </Text>
                <Text variant="bodySm">
                  {t({
                    id: 'crew.waitlist.offerBody',
                    message: `It’s yours if you take it in the next ${hours} h.`,
                  })}
                </Text>
                <PillButton
                  label={t({ id: 'crew.waitlist.take', message: 'Take the seat' })}
                  onPress={() => take(offerId, place)}
                  loading={taking === offerId}
                  testID={rowId('seat-offer-take', offerId)}
                />
              </View>
            </Card>
          );
        }
        return (
          <Card key={row.trip_id} tone="raised" testID={rowId('waitlist', row.trip_id)}>
            <Text variant="rowTitle">
              {position === 1
                ? t({ id: 'crew.waitlist.next', message: `You’re next for a seat on ${place}` })
                : t({
                    id: 'crew.waitlist.number',
                    message: `You’re number ${position} for a seat on ${place}`,
                  })}
            </Text>
          </Card>
        );
      })}
    </View>
  );
}
