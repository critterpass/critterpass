/** The crew switcher's rows (3.07): a crew with its faces and next trip, and an in-app invite. */
/* eslint-disable lingui/no-unlocalized-strings -- message ids and style values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import type { InviteCardView } from '@/features/crew';
import {
  CrewStack,
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { memberAccent } from '../components/member-colour';
import type { SwitcherCrew } from './use-crew-switcher';

/** Faces a crew row shows: three 24 pt avatars overlapping by 10 fill the 52 pt slot. */
const FACES = 3;

export const useStyles = makePremiumStyles((t) => ({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.color.ground,
  },
  hit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: {
    position: 'absolute',
    start: t.space.gutter,
    width: 290,
    borderRadius: t.radius.cardRow,
    backgroundColor: t.color.card,
    boxShadow:
      t.scheme === 'dark'
        ? t.shadow.float
        : '0 2px 6px rgba(20,22,40,.08), 0 24px 60px rgba(20,22,40,.22)',
    overflow: 'hidden',
    transformOrigin: 'top left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap12,
    paddingVertical: t.space.gap12,
    paddingHorizontal: t.space.rowPadH,
  },
  rule: { height: t.size.hairline, backgroundColor: t.color.hairlineMenu },
  faces: { width: 52 },
  grow: { flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: t.accent.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.color.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function CrewLine({
  crew,
  current,
  onPress,
}: {
  readonly crew: SwitcherCrew;
  readonly current: boolean;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const { t: tr } = useLingui();
  const next = crew.nextTrip?.place ?? null;
  const count = crew.members.length;
  const sub =
    next === null
      ? tr({ id: 'home.premium.switcher.members', message: `${count} in the crew` })
      : tr({ id: 'home.premium.switcher.next', message: `Next: ${next}` });
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${crew.name}, ${sub}`}
      accessibilityState={{ selected: current }}
      testID={`crew-switcher-${crew.id}`}
    >
      <View style={styles.row}>
        <View style={styles.faces}>
          {/* Three faces and no count chip (3.07): the slot is fixed, so every crew name lines up. */}
          <CrewStack
            members={crew.members.slice(0, FACES).map((m) => ({
              id: m.userId,
              name: m.name,
              color: memberAccent(t, m.colour),
            }))}
            max={FACES}
            size={24}
            accessibilityLabel={sub}
          />
        </View>
        <View style={styles.grow}>
          <Text variant="rowTitle" numberOfLines={1}>
            {crew.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {current ? (
          <Icon name="check" size={18} />
        ) : crew.unread > 0 ? (
          <View style={styles.badge}>
            <Text variant="tier" tone="onAccent">
              {crew.unread > 99 ? '99+' : String(crew.unread)}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function InviteLine({
  invite,
  onPress,
}: {
  readonly invite: InviteCardView;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const { t: tr } = useLingui();
  const inviter = invite.inviterName;
  const sub =
    inviter === ''
      ? tr({ id: 'home.premium.switcher.invited', message: 'You’re invited' })
      : tr({ id: 'home.premium.switcher.invitedBy', message: `${inviter} invited you` });
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${invite.crewName}, ${sub}`}
      testID={`crew-switcher-invite-${invite.id}`}
    >
      <View style={styles.row}>
        <View style={styles.faces}>
          <CrewStack
            members={[{ id: invite.id, name: inviter, color: t.accent.neutral }]}
            max={1}
            size={24}
            accessibilityLabel={sub}
          />
        </View>
        <View style={styles.grow}>
          <Text variant="rowTitle" numberOfLines={1}>
            {invite.crewName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}
