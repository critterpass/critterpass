/**
 * A stay's rooms as a list card (7.07, 7.09): each room a row with its bed tile (sun, rain, mint in
 * turn), "Room 1 · Light sleepers", the nightly price, and the people in it as a stack. A room can
 * ring the reader's own.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent, IconTile } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { CrewStack, Text, usePremiumTheme } from '@/ui/premium';

import { money } from '../../budget/model';
import type { SetupMember } from '../../data/setup-trip';
import { traitName } from '../../rooms/copy';
import type { PlanStay } from '../../rooms/model';
import { bedTint } from './room-tint';

export function RoomList(props: {
  readonly stay: PlanStay;
  readonly currency: string;
  readonly people: ReadonlyMap<string, SetupMember>;
  /** Leave this person's room out (the member's own room shows in the hero). */
  readonly skip?: string | undefined;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const rooms = props.stay.rooms
    .map((room, at) => ({ room, at }))
    .filter(({ room }) => props.skip === undefined || !room.occupants.includes(props.skip));
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
    >
      {rooms.map(({ room, at }, index) => {
        const tint = bedTint(th, at);
        const names = room.occupants.map((uid) => props.people.get(uid)?.name ?? '');
        const title = t({ id: 'setup.premium.rooms.roomN', message: `Room ${at + 1}` });
        return (
          <View
            key={room.key}
            style={[
              styles.row,
              index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
            ]}
            testID={`setup-rooms-row-${props.stay.key}-${room.key}`}
          >
            <IconTile name="bed" bg={tint.bg} color={tint.text} size={44} />
            <View style={styles.flex}>
              <Text variant="rowTitle" numberOfLines={1}>
                {room.trait === null ? title : `${title} · ${traitName(room.trait)}`}
              </Text>
              <Text variant="caption" tone="muted" style={styles.tabular}>
                {t({
                  id: 'setup.premium.rooms.nightly',
                  message: `${money(locale, room.nightlyMinor, props.currency)} a night`,
                })}
              </Text>
            </View>
            <CrewStack
              members={room.occupants.map((uid) => ({
                id: uid,
                name: props.people.get(uid)?.name ?? '',
                color: crewAccent(props.people.get(uid)?.joinIndex ?? 0),
              }))}
              size={30}
              accessibilityLabel={names.join(', ')}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 70,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  flex: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
});
