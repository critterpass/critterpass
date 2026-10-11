/**
 * A stay expense split by room (7.22): each room with who sleeps there and what each of them owes,
 * your own share against the payer, the guide's note that the split follows the rooms, and "Split
 * evenly instead". An expense not split by room shows its usual list of who owes what.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSessionUid } from '@/data/powersync/use-session-uid';
import { crewAccent, guideCritterKind, guideCritterName, IconTile } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { CrewStack, GuideNote, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useRoomSplit } from '../../data/use-room-split';
import type { ExpenseDetail } from '../../expense-detail/use-expense-detail';
import { formatAmount } from '../../format';

type Ready = Extract<ExpenseDetail, { kind: 'ready' }>;

export function RoomSplitSection({
  detail,
  fallback,
}: {
  readonly detail: Ready;
  readonly fallback: ReactNode;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const me = useSessionUid();
  const split = useRoomSplit(detail.item.id);
  if (!split.byRoom) return <>{fallback}</>;
  const { item, currency } = detail;
  const shareOf = new Map(detail.shares.map((share) => [share.userId, share]));
  const joinIndex = new Map(detail.members.map((member) => [member.userId, member.joinIndex]));
  const payer = detail.members.find((member) => member.userId === item.payerId);
  const mine = me === null ? undefined : shareOf.get(me);
  const owing = detail.shares.filter((share) => share.crewMinor > 0n);
  const total = item.crewAmountMinor ?? 0n;
  const evenEach = owing.length === 0 ? null : total / BigInt(owing.length);
  const rooms = split.rooms.filter((room) => room.occupants.some((uid) => shareOf.has(uid)));
  const askEvenly = () =>
    void confirmAlert({
      title: t({ id: 'money.rooms.evenTitle', message: 'Split this stay evenly?' }),
      message: t({
        id: 'money.rooms.evenLine',
        message: 'Everyone pays the same, and the split stops following the rooms.',
      }),
      confirm: t({ id: 'money.rooms.evenConfirm', message: 'Split evenly' }),
      cancel: t({ id: 'money.rooms.evenCancel', message: 'Cancel' }),
    }).then((yes) => {
      if (yes) split.splitEvenly(owing.map((share) => share.userId));
    });
  return (
    <View style={{ gap: th.space.gap12 }} testID="money-detail-rooms">
      <Text variant="label" tone="muted" style={{ paddingHorizontal: th.space.titleGutter }}>
        {t({ id: 'money.rooms.title', message: 'By room' })}
      </Text>
      <View
        style={[
          styles.card,
          {
            marginHorizontal: th.space.gutter,
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        {rooms.map((room, at) => {
          const first = shareOf.get(room.occupants[0] ?? '');
          const names = room.occupants.map((uid) => shareOf.get(uid)?.name ?? '').join(', ');
          return (
            <View
              key={`${room.stayKey}:${room.key}`}
              style={[
                styles.row,
                at === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
              ]}
              testID={`money-detail-room-${room.key}`}
            >
              <IconTile
                name="bed"
                bg={th.color.status.rain.bg}
                color={th.color.status.rain.text}
                size={38}
              />
              <View style={styles.flex}>
                <Text variant="rowTitle">
                  {t({ id: 'money.rooms.room', message: `Room ${room.number}` })}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {names}
                </Text>
              </View>
              <CrewStack
                members={room.occupants.map((uid) => ({
                  id: uid,
                  name: shareOf.get(uid)?.name ?? '',
                  color: crewAccent(joinIndex.get(uid) ?? 0),
                }))}
                size={26}
                accessibilityLabel={names}
              />
              <View style={styles.value}>
                <Text variant="rowTextStrong" style={styles.tabular}>
                  {first === undefined ? '—' : formatAmount(first.crewMinor, currency, locale)}
                </Text>
                {room.occupants.length > 1 ? (
                  <Text variant="captionMuted" tone="muted">
                    {t({ id: 'money.rooms.each', message: 'each' })}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      {mine === undefined || mine.crewMinor === 0n || me === item.payerId ? null : (
        <View
          style={[
            styles.mine,
            {
              marginHorizontal: th.space.gutter,
              borderRadius: th.radius.cardRow,
              backgroundColor: th.color.banner.error.bg,
            },
          ]}
          testID="money-detail-room-mine"
        >
          <View style={styles.flex}>
            <Text variant="rowTitle">
              {t({ id: 'money.rooms.yourShare', message: 'Your share' })}
            </Text>
            <Text variant="caption" color={th.color.banner.error.text}>
              {t({ id: 'money.rooms.youOwe', message: `you owe ${payer?.name ?? ''}` })}
            </Text>
          </View>
          <Text variant="title" style={styles.tabular}>
            {formatAmount(mine.crewMinor, currency, locale)}
          </Text>
        </View>
      )}
      <View style={{ paddingHorizontal: th.space.gutter }}>
        <GuideNote
          name={guideCritterName(null)}
          critter={guideCritterKind(null)}
          text={t({
            id: 'money.rooms.follows',
            message:
              'If rooms change, this split changes too. Anyone who already paid gets a top-up or a refund line.',
          })}
        />
      </View>
      {detail.canChange && evenEach !== null ? (
        <View style={styles.center}>
          <TextButton
            label={t({
              id: 'money.rooms.splitEvenly',
              message: `Split evenly instead · ${formatAmount(evenEach, currency, locale)} each`,
            })}
            onPress={askEvenly}
            testID="money-detail-room-evenly"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  flex: { flex: 1, minWidth: 0 },
  value: { width: 64, alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  center: { alignItems: 'center' },
});
