/**
 * A member's rooms (7.09), read-only: the hero with their own room ("YOUR ROOM", the room, who they
 * share with, their share), everyone else's rooms as the organiser set them, the swap card (ask the
 * organiser, then waiting on them), and their room wishes, which nobody else sees.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent, IconTile, turn } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, CrewStack, PressableScale, StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import { money } from '../../budget/model';
import type { SetupMember } from '../../data/setup-trip';
import { chipName, traitName, type RoomChipKey, ROOM_CHIP_KEYS } from '../../rooms/copy';
import { type PerPerson, type PlanStay, fractionDigits } from '../../rooms/model';
import { RoomList } from './room-list';

export function MemberRoom(props: {
  readonly stay: PlanStay;
  readonly currency: string;
  readonly me: string;
  readonly organiser: string;
  readonly people: ReadonlyMap<string, SetupMember>;
  readonly price: PerPerson | null;
  readonly chips: readonly RoomChipKey[];
  readonly swapAsked: boolean;
  readonly onToggleChip: (chip: RoomChipKey) => void;
  readonly onAskSwap: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const at = props.stay.rooms.findIndex((room) => room.occupants.includes(props.me));
  const mine = props.stay.rooms[at];
  const others = (mine?.occupants ?? []).filter((uid) => uid !== props.me);
  const otherNames = format.list(
    locale,
    others.map((uid) => props.people.get(uid)?.name ?? ''),
  );
  const share = props.price?.mine ?? null;
  const organiser = props.organiser;
  return (
    <View style={{ gap: th.space.gap16 }}>
      {mine === undefined ? (
        <Text variant="rowText" tone="muted" testID="setup-rooms-unplaced">
          {t({ id: 'setup.rooms.unplaced.member', message: 'Not in a room yet.' })}
        </Text>
      ) : (
        <View
          style={[
            styles.hero,
            {
              borderRadius: th.radius.hero,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.float,
            },
          ]}
          testID="setup-rooms-mine"
        >
          <View style={[styles.doodle, { transform: [turn(10)] }]}>
            <IconTile
              name="bed"
              bg={th.color.status.rain.bg}
              color={th.color.status.rain.text}
              size={72}
            />
          </View>
          <Text variant="tier" color={th.color.status.rain.text}>
            {t({ id: 'setup.premium.rooms.yours', message: 'YOUR ROOM' })}
          </Text>
          <Text variant="largeTitle">
            {mine.trait === null
              ? t({ id: 'setup.premium.rooms.roomN', message: `Room ${at + 1}` })
              : `${t({ id: 'setup.premium.rooms.roomN', message: `Room ${at + 1}` })} · ${traitName(mine.trait)}`}
          </Text>
          <Text variant="rowText" tone="muted">
            {others.length === 0
              ? t({ id: 'setup.premium.rooms.alone', message: 'A room to yourself.' })
              : t({ id: 'setup.premium.rooms.with', message: `With ${otherNames}.` })}
          </Text>
          <View style={styles.heroFoot}>
            <CrewStack
              members={mine.occupants.map((uid) => ({
                id: uid,
                name: props.people.get(uid)?.name ?? '',
                color: crewAccent(props.people.get(uid)?.joinIndex ?? 0),
              }))}
              size={40}
              accessibilityLabel={otherNames}
            />
            {share === null ? null : (
              <View style={styles.share}>
                <Text variant="captionMuted" tone="muted">
                  {t({ id: 'setup.premium.rooms.yourShare', message: 'Your share' })}
                </Text>
                <Text variant="title" style={styles.tabular}>
                  {money(locale, share * 10 ** fractionDigits(props.currency), props.currency)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
      <Text variant="label" tone="muted">
        {t({
          id: 'setup.premium.rooms.everyoneElse',
          message: `Everyone else · set by ${props.organiser}`,
        })}
      </Text>
      <RoomList stay={props.stay} currency={props.currency} people={props.people} skip={props.me} />
      <View
        style={[
          styles.swap,
          {
            borderRadius: th.radius.cardRow,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        {props.swapAsked ? (
          <>
            <Text variant="rowTitle" testID="setup-rooms-swap-sent">
              {t({ id: 'setup.rooms.swapSent', message: `Asked ${organiser} for a swap.` })}
            </Text>
            <StatusTag
              label={t({
                id: 'setup.premium.rooms.waitingOn',
                message: `Waiting on ${props.organiser}`,
              })}
              tone="tangerine"
            />
          </>
        ) : (
          <>
            <Text variant="rowText" tone="muted">
              {t({
                id: 'setup.premium.rooms.swapLine',
                message: `Want a different room? ${props.organiser} sets the rooms.`,
              })}
            </Text>
            <Button
              label={t({ id: 'setup.rooms.askSwap', message: 'Ask to swap' })}
              variant="secondary"
              size="medium"
              onPress={props.onAskSwap}
              testID="setup-rooms-ask-swap"
            />
          </>
        )}
      </View>
      <View style={{ gap: th.space.gap8 }} testID="setup-rooms-member-tools">
        <Text variant="label" tone="muted">
          {t({ id: 'setup.rooms.wishes', message: 'Your room wishes' })}
        </Text>
        <View style={styles.chips}>
          {ROOM_CHIP_KEYS.map((chip) => (
            <PressableScale
              key={chip}
              onPress={() => props.onToggleChip(chip)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: props.chips.includes(chip) }}
              testID={`setup-rooms-chip-${chip}`}
            >
              <View
                style={[
                  styles.chip,
                  props.chips.includes(chip)
                    ? { backgroundColor: th.color.ink }
                    : { backgroundColor: th.color.card, boxShadow: th.shadow.float },
                ]}
              >
                <Text
                  variant="pillSmall"
                  color={props.chips.includes(chip) ? th.color.onInk : th.color.ink}
                >
                  {chipName(chip)}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'setup.rooms.wishesMissing',
            message: 'Pick any that fit you. Nobody sees them; they only shape the rooms.',
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 18, gap: 4, minHeight: 196, overflow: 'hidden' },
  doodle: { position: 'absolute', top: 14, right: 14 },
  heroFoot: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 12 },
  share: { marginLeft: 'auto', alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
  swap: { padding: 14, gap: 10, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
});
