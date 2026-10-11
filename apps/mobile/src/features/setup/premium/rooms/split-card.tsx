/**
 * The split under the rooms editor (7.08): the booked stay's total with a By room | Evenly switch,
 * and one tile per room with what each guest in it pays. By room follows the editor's layout as
 * people move (the server makes the same split when the rooms are saved); Evenly is the total over
 * everyone in a room. Before a stay is booked the tiles show the plan's estimate instead.
 */
import { roomSplitShares } from '@cp/cost-engine';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useStayRoomSplit, type StaySplitMode } from '@/features/money';
import { useLocale } from '@/lib/i18n/use-locale';
import { SegmentedControl, Text, usePremiumTheme } from '@/ui/premium';

import { money } from '../../budget/model';
import type { PlanStay } from '../../rooms/model';

/* eslint-disable lingui/no-unlocalized-strings -- split modes, not copy. */
const BY_ROOM: StaySplitMode = 'by_room';
const EVENLY: StaySplitMode = 'evenly';
/* eslint-enable lingui/no-unlocalized-strings */

function roomEach(
  stay: PlanStay,
  total: bigint | null,
  mode: StaySplitMode,
  currency: string,
): Map<string, number> {
  const guests = stay.rooms.flatMap((room) => room.occupants);
  if (total !== null && mode === EVENLY) {
    const each = guests.length === 0 ? 0 : Number(total) / guests.length;
    return new Map(stay.rooms.map((room) => [room.key, each] as const));
  }
  const shares =
    total === null
      ? null
      : roomSplitShares({
          amountMinor: total,
          currency,
          stayKey: stay.key,
          rooms: stay.rooms.map((room) => ({
            stay_key: stay.key,
            stay_type: stay.type,
            stay_nights: stay.nights,
            key: room.key,
            capacity: room.capacity,
            nightly_minor: room.nightlyMinor,
            label: room.key,
          })),
          seats: stay.rooms.flatMap((room) =>
            room.occupants.map((uid) => ({ stay_key: stay.key, room_key: room.key, user_id: uid })),
          ),
        });
  const byUser = new Map((shares ?? []).map((share) => [share.user_id, share.fixed_minor ?? 0]));
  return new Map(
    stay.rooms.map((room): [string, number] => {
      const first = room.occupants[0];
      if (shares !== null) return [room.key, first === undefined ? 0 : (byUser.get(first) ?? 0)];
      const whole = room.nightlyMinor * stay.nights;
      return [room.key, room.occupants.length === 0 ? whole : whole / room.occupants.length];
    }),
  );
}

export function SplitCard(props: {
  readonly tripId: string;
  readonly stay: PlanStay;
  readonly planCurrency: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const split = useStayRoomSplit(props.tripId);
  const expense = split.expense;
  const currency = expense?.currency || props.planCurrency;
  const mode: StaySplitMode = expense?.mode ?? BY_ROOM;
  const each = roomEach(
    props.stay,
    expense === null ? null : BigInt(expense.amountMinor),
    mode,
    currency,
  );
  const guests = props.stay.rooms.flatMap((room) => room.occupants);
  return (
    <View
      style={[styles.card, { borderRadius: th.radius.cardRow, backgroundColor: th.color.card }]}
      testID="setup-rooms-split"
    >
      <View style={styles.head}>
        <Text variant="rowTitle" style={styles.flex}>
          {expense === null
            ? t({ id: 'setup.premium.rooms.estimate', message: 'Each, estimate' })
            : t({
                id: 'setup.premium.rooms.split',
                message: `${money(locale, expense.amountMinor, currency)} split`,
              })}
        </Text>
        {expense === null ? null : (
          <SegmentedControl<StaySplitMode>
            options={[
              {
                value: BY_ROOM,
                label: t({ id: 'setup.premium.rooms.byRoom', message: 'By room' }),
              },
              {
                value: EVENLY,
                label: t({ id: 'setup.premium.rooms.evenly', message: 'Evenly' }),
              },
            ]}
            value={mode}
            onChange={(next) =>
              next === BY_ROOM ? split.splitByRoom(props.stay.key) : split.splitEvenly(guests)
            }
            accessibilityLabel={t({
              id: 'setup.premium.rooms.splitMode',
              message: 'How the stay splits',
            })}
            testID="setup-rooms-split-mode"
          />
        )}
      </View>
      <View style={styles.tiles}>
        {props.stay.rooms.map((room, at) => (
          <View
            key={room.key}
            style={[
              styles.tile,
              { borderRadius: th.radius.dayBadge, backgroundColor: th.color.ground },
            ]}
          >
            <Text variant="captionMuted" tone="muted" numberOfLines={1}>
              {t({ id: 'setup.premium.rooms.tileEach', message: `Room ${at + 1}, each` })}
            </Text>
            <Text variant="headline" style={styles.tabular}>
              {money(locale, Math.round(each.get(room.key) ?? 0), currency)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { flexGrow: 1, flexBasis: 90, paddingVertical: 7, paddingHorizontal: 10 },
  tabular: { fontVariant: ['tabular-nums'] },
});
