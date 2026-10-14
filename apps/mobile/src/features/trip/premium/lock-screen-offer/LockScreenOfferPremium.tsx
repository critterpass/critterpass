/**
 * The lock-screen offer as a premium sheet, opened from the crew map's "put this on the lock
 * screen": Cancel left; the trip's Live Activity eyebrow and the title; the lock-screen picture;
 * what it does; then Boost with the quiet way out ("just my own leave-by alarms") on an unboosted
 * trip, "Got it" once it is on, or Try again when it could not be done.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useOfferCopy } from '../../live-activities/lock-screen-offer/offer-copy';
import { useLockScreenOffer } from '../../live-activities/lock-screen-offer/use-lock-screen-offer';
import { CrewLivePreviewPremium } from './CrewLivePreviewPremium';

export function LockScreenOfferPremium({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const offer = useLockScreenOffer(tripId);
  const { phase, boost } = offer;
  const { trip, title, line } = useOfferCopy(offer.facts, phase, offer.startsTime);
  const done =
    phase.kind === 'started' ||
    phase.kind === 'no_meetup' ||
    (phase.kind === 'unavailable' && phase.why === 'switched_off');
  return (
    <SheetScreen
      cancelLabel={t({ id: 'trip.lockScreen.cancel', message: 'Cancel' })}
      testID={`lock-screen-offer-${phase.kind}`}
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap16 }]}>
        <View style={{ gap: th.space.gap4 }}>
          <Text variant="badge" color={th.color.destructive.helper}>
            {t({ id: 'trip.lockScreen.eyebrow', message: `${trip} · Live Activity` })}
          </Text>
          <Text variant="title" singleLine={false} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {phase.kind === 'no_meetup' || phase.kind === 'unavailable' ? null : (
          <CrewLivePreviewPremium
            facts={offer.facts}
            clock={offer.clock}
            meetTime={offer.meetTime}
          />
        )}
        <Text variant="body" tone="inkSecondary">
          {line}
        </Text>
        <View style={[styles.foot, { gap: th.space.gap12 }]}>
          {phase.kind === 'asking' ? (
            <Button
              label={t({ id: 'trip.lockScreen.asking', message: 'Checking' })}
              loading
              testID="lock-screen-offer-asking"
            />
          ) : null}
          {phase.kind === 'offer' && boost !== null ? (
            <Button
              label={
                boost.price === null
                  ? t({ id: 'trip.lockScreen.offer.boost', message: `Boost ${trip}` })
                  : t({
                      id: 'trip.lockScreen.offer.boostPrice',
                      message: `Boost ${trip} · ${boost.price}`,
                    })
              }
              icon="bolt"
              onPress={boost.onPress}
              testID="lock-screen-offer-boost"
            />
          ) : null}
          {phase.kind === 'offer' ? (
            <TextButton
              align="center"
              label={t({
                id: 'trip.lockScreen.offer.quiet',
                message: 'Just my own leave-by alarms',
              })}
              onPress={offer.onClose}
              testID="lock-screen-offer-quiet"
            />
          ) : null}
          {phase.kind === 'unavailable' && phase.why !== 'switched_off' ? (
            <Button
              label={t({ id: 'trip.lockScreen.retry', message: 'Try again' })}
              variant="secondary"
              onPress={offer.onRetry}
              testID="lock-screen-offer-retry"
            />
          ) : null}
          {done ? (
            <Button
              label={t({ id: 'trip.lockScreen.done', message: 'Got it' })}
              onPress={offer.onClose}
              testID="lock-screen-offer-done"
            />
          ) : null}
        </View>
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 24 },
  foot: { alignItems: 'stretch' },
});
