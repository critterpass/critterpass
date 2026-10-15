/**
 * The crew switcher (3.07): a popover under Home's crew line, not a sheet. The page dims below the
 * anchor; each crew row shows three faces, its name and its next trip, with a check on the one
 * Home shows or a pink count of unread chat. In-app invites follow as rows of their own ("Dev
 * invited you"), joined after a two-choice alert. Under them: start a crew and join with a code. A
 * tap outside closes it. It grows out of the anchor's corner (opacity 0, scale 0.92) on the Snappy
 * spring and fades out in 150 ms before the window goes (a fade both ways under Reduce Motion). A
 * long list scrolls inside the menu, which never runs past the screen; in dark it carries the
 * floating ring and drop so it stands off the card below.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { InviteCardView } from '@/features/crew';
import {
  Icon,
  PressableScale,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
} from '@/ui/premium';
import { confirmAlert, noticeAlert } from '@/ui/premium/shell';

import { HOME_ROUTES } from '../../routes';
import { HomeGlyph } from '../components/home-glyph';
import { CrewLine, InviteLine, useStyles } from './crew-switcher-rows';
import { useCrewSwitcher } from './use-crew-switcher';

export interface CrewSwitcherMenuProps {
  readonly visible: boolean;
  /** The bottom edge of the anchor in window coordinates. */
  readonly top: number;
  readonly currentCrewId: string | null;
  readonly onPick: (crewId: string) => void;
  readonly onClose: () => void;
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
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuTop = top + 4;
  const maxHeight = Math.max(160, window.height - menuTop - insets.bottom - 16);
  // The window stays up while the menu fades out, then goes.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      shown.set(
        reduced ? withTiming(1, { duration: REDUCED_FADE_MS }) : withSpring(1, SPRINGS.snappy),
      );
      return;
    }
    shown.set(
      withTiming(0, { duration: REDUCED_FADE_MS }, (finished) => {
        if (finished === true) scheduleOnRN(setMounted, false);
      }),
    );
  }, [visible, reduced, shown]);
  const pop = useAnimatedStyle(() => {
    const p = shown.get();
    return {
      opacity: Math.min(1, p),
      transform: [{ scale: reduced || !visible ? 1 : 0.92 + 0.08 * p }],
    };
  });
  const dim = useAnimatedStyle(() => ({ opacity: 0.55 * Math.min(1, shown.get()) }));
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const answer = async (invite: InviteCardView) => {
    onClose();
    const crewName = invite.crewName;
    const joining = await confirmAlert({
      title: t({ id: 'home.premium.switcher.joinTitle', message: `Join ${crewName}?` }),
      message: t({
        id: 'home.premium.switcher.joinLine',
        message: 'You’ll see its trips and its chat.',
      }),
      confirm: t({ id: 'home.premium.switcher.join', message: 'Join' }),
      cancel: t({ id: 'home.premium.switcher.notNow', message: 'Not now' }),
      destructive: false,
    });
    if (!joining) return;
    if (await switcher.join(invite)) onPick(invite.crewId);
    else
      await noticeAlert({
        title: t({ id: 'crew.sheet.joinFailed', message: 'That invite can’t be joined now' }),
        ok: t({ id: 'home.premium.switcher.joinFailedOk', message: 'Got it' }),
      });
  };
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View pointerEvents="none" style={[styles.scrim, { top }, dim]} />
      <Pressable
        style={[styles.hit, { top }]}
        onPress={onClose}
        disabled={!visible}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'home.premium.switcher.close', message: 'Close' })}
      />
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.menu, { top: menuTop, maxHeight }, pop]}
        testID="crew-switcher"
      >
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
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
          {switcher.invites.map((invite) => (
            <View key={invite.id}>
              <View style={styles.rule} />
              <InviteLine invite={invite} onPress={() => void answer(invite)} />
            </View>
          ))}
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
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
