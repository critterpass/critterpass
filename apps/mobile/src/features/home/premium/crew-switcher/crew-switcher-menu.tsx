/**
 * The crew switcher (3.07): a popover under Home's crew line, not a sheet. The page dims below the
 * anchor; each crew row shows three faces, its name and its next trip, with a check on the one
 * Home shows or a pink count of unread chat. Under them: start a crew, join with a code, and any
 * in-app invites waiting on the crews sheet. A tap outside closes it; it scales out of the anchor
 * on the Snappy spring (a fade under Reduce Motion).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import {
  CrewStack,
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { HOME_ROUTES } from '../../routes';
import { memberAccent } from '../components/member-colour';
import { HomeGlyph } from '../components/home-glyph';
import { useCrewSwitcher, type SwitcherCrew } from './use-crew-switcher';

const useStyles = makePremiumStyles((t) => ({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.color.ground,
    opacity: 0.55,
  },
  menu: {
    position: 'absolute',
    start: t.space.gutter,
    width: 290,
    borderRadius: t.radius.cardRow,
    backgroundColor: t.color.card,
    boxShadow: '0 2px 6px rgba(20,22,40,.08), 0 24px 60px rgba(20,22,40,.22)',
    overflow: 'hidden',
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

export interface CrewSwitcherMenuProps {
  readonly visible: boolean;
  /** The bottom edge of the anchor in window coordinates. */
  readonly top: number;
  readonly currentCrewId: string | null;
  readonly onPick: (crewId: string) => void;
  readonly onClose: () => void;
}

function CrewLine({
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
          <CrewStack
            members={crew.members.map((m) => ({
              id: m.userId,
              name: m.name,
              color: memberAccent(t, m.colour),
            }))}
            max={3}
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

export function CrewSwitcherMenu({
  visible,
  top,
  currentCrewId,
  onPick,
  onClose,
}: CrewSwitcherMenuProps) {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const { t } = useLingui();
  const switcher = useCrewSwitcher();
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const invites = switcher.invites;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        style={[styles.scrim, { top }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'home.premium.switcher.close', message: 'Close' })}
      />
      <Animated.View
        entering={reduced ? FadeIn.duration(150) : ZoomIn.springify().damping(36).stiffness(438)}
        style={[styles.menu, { top: top + 4 }]}
        testID="crew-switcher"
      >
        {switcher.crews.map((crew, i) => (
          <View key={crew.id}>
            {i > 0 ? <View style={styles.rule} /> : null}
            <CrewLine
              crew={crew}
              current={crew.id === currentCrewId}
              onPress={() => {
                switcher.pick(crew.id);
                onPick(crew.id);
                onClose();
              }}
            />
          </View>
        ))}
        {invites > 0 ? (
          <>
            <View style={styles.rule} />
            <PressableScale
              onPress={() => go(HOME_ROUTES.crewSheet)}
              testID="crew-switcher-invites"
            >
              <View style={styles.row}>
                <View style={styles.action}>
                  <HomeGlyph name="bell" size={16} />
                </View>
                <Text variant="rowTitle" style={styles.grow}>
                  {t({
                    id: 'home.premium.switcher.invites',
                    message: `Invites waiting · ${invites}`,
                  })}
                </Text>
              </View>
            </PressableScale>
          </>
        ) : null}
        <View style={styles.rule} />
        <PressableScale onPress={() => go('/crew/new')} testID="home-start-crew">
          <View style={styles.row}>
            <View style={styles.action}>
              <Icon name="plus" size={16} />
            </View>
            <Text variant="rowTitle" style={styles.grow}>
              {t({ id: 'home.firstRun.startCrew', message: 'Start a crew' })}
            </Text>
          </View>
        </PressableScale>
        <View style={styles.rule} />
        <PressableScale onPress={() => go(HOME_ROUTES.joinCode)} testID="home-join-code">
          <View style={styles.row}>
            <View style={styles.action}>
              <HomeGlyph name="hash" size={16} />
            </View>
            <Text variant="rowTitle" style={styles.grow}>
              {t({ id: 'home.firstRun.joinCode', message: 'Join with a code' })}
            </Text>
          </View>
        </PressableScale>
      </Animated.View>
    </Modal>
  );
}
