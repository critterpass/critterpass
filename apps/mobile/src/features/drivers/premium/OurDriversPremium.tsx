/**
 * Our drivers, in the drivers look (6.20, 6.25): the drivers this crew used, one card each with its
 * invite timeline and actions, cards rising in one after another. Cancel invite asks first with the
 * system alert; a read that did not come back says so with a way to try again. Unclaimed drivers are
 * only visible to this crew.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideCritterKind, guideCritterName } from '@/features/trip';
import { useActiveGuide } from '@/lib/navigation/active-guide';
import {
  Button,
  EmptyState,
  enterTransition,
  Skeleton,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { driverRoutes } from '../ours/routes';
import { ourDriverState } from '../ours/timeline';
import { useOurDrivers } from '../ours/use-our-drivers';
import { useOurDriversActions } from '../ours/use-our-drivers-actions';
import { OurDriverCard } from './components/OurDriverCard';

export function OurDriversPremium({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const { guideId } = useActiveGuide();
  const { data, offline, failed, reload } = useOurDrivers(tripId);
  const actions = useOurDriversActions(reload);
  const title = t({ id: 'drivers.ours.title', message: 'Our drivers' });
  const back = t({ id: 'drivers.ours.back', message: 'Getting around' });
  const pad = { paddingHorizontal: th.space.gutter, gap: th.space.gap12 };
  if (data === null) {
    return (
      <PushScreen
        title={title}
        backLabel={back}
        testID={failed || offline ? 'drivers-ours-failed' : 'drivers-ours-loading'}
      >
        {offline || failed ? (
          <View style={[styles.body, pad]}>
            <Text variant="body" tone="muted" align="center">
              {offline
                ? t({
                    id: 'drivers.premium.offline',
                    message: 'This needs signal. Try again when you have some.',
                  })
                : t({ id: 'drivers.premium.failed', message: "That didn't load. Try again." })}
            </Text>
            <Button
              label={t({ id: 'drivers.premium.retry', message: 'Try again' })}
              variant="secondary"
              onPress={reload}
              testID="drivers-ours-retry"
            />
          </View>
        ) : (
          <View
            style={[styles.body, pad]}
            accessibilityLabel={t({ id: 'drivers.ours.loading', message: 'Loading your drivers' })}
          >
            <Skeleton height={148} radius={th.radius.cardLarge} />
            <Skeleton height={148} radius={th.radius.cardLarge} />
          </View>
        )}
      </PushScreen>
    );
  }
  const now = new Date();
  const crew = data.crew_size;
  const empty = data.drivers.length === 0;
  const directory = () => router.push(driverRoutes.directory(tripId));
  const directoryLabel = t({ id: 'drivers.ours.directory', message: 'Drivers other crews loved' });
  // The note about nudging only means something while an invite is waiting on a driver.
  const waiting = data.drivers.some((driver) => ourDriverState(driver, now).kind === 'waiting');
  const cancel = async (inviteId: string) => {
    const sure = await confirmAlert({
      title: t({ id: 'drivers.ours.cancelTitle', message: 'Cancel this invite?' }),
      message: t({
        id: 'drivers.ours.cancelLine',
        message: 'The link you sent stops working at once.',
      }),
      confirm: t({ id: 'drivers.ours.cancel', message: 'Cancel invite' }),
      cancel: t({ id: 'drivers.premium.keepInvite', message: 'Keep it' }),
    });
    if (sure) actions.cancel(inviteId);
  };
  return (
    <PushScreen title={title} backLabel={back} scroll={false} testID="drivers-ours">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.body, pad, { paddingBottom: insets.bottom + 32 }]}
      >
        {empty ? (
          <EmptyState
            title={t({ id: 'drivers.ours.emptyTitle', message: 'No drivers yet' })}
            line={t({
              id: 'drivers.ours.emptyLine',
              message: 'Ride with someone on this trip and they land here for the crew.',
            })}
            critter={{ kind: guideCritterKind(guideId), name: guideCritterName(guideId) }}
            check={false}
            action={
              <Button
                label={directoryLabel}
                onPress={directory}
                testID="drivers-ours-empty-directory"
              />
            }
            testID="drivers-ours-empty"
          />
        ) : (
          <Text variant="rowText" tone="muted">
            {t({
              id: 'drivers.ours.intro',
              message: `Drivers this crew used. The ones who haven't confirmed are only visible to you ${crew}.`,
            })}
          </Text>
        )}
        {data.drivers.map((driver, index) => (
          <Animated.View
            key={driver.provider_id}
            // The first few cards cascade; the rest arrive with the last of them.
            entering={enterTransition(reduced).delay(Math.min(index, 6) * 40)}
          >
            <OurDriverCard
              driver={driver}
              index={index}
              now={now}
              busy={actions.busy === driver.provider_id}
              onRate={() => router.push(driverRoutes.rate(tripId, driver.provider_id))}
              onInvite={() => router.push(driverRoutes.invite(tripId, driver.provider_id))}
              onNudge={(inviteId) => actions.nudge(driver, inviteId)}
              onCancel={(inviteId) => void cancel(inviteId)}
            />
          </Animated.View>
        ))}
        {waiting ? (
          <Text variant="captionMuted" tone="muted" align="center">
            {t({
              id: 'drivers.ours.noChase',
              message: "I won't chase him. One nudge from you is plenty.",
            })}
          </Text>
        ) : null}
        {empty ? null : (
          <Button
            variant="secondary"
            label={directoryLabel}
            onPress={directory}
            testID="drivers-ours-directory"
          />
        )}
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
});
