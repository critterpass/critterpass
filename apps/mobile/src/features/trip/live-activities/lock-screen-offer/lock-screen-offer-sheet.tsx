/**
 * The lock-screen sheet (5a-6), opened from the crew map's "put this on the lock screen": on an
 * unboosted trip, what the crew-live Live Activity is, with the Boost button and the quiet way out
 * ("just my own leave-by alarms", which are free and stay as they are); on a boosted trip, that it
 * is on every lock screen and from when; or why it could not be done.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { CrewLivePreview } from './crew-live-preview';
import { useOfferCopy } from './offer-copy';
import type { OfferFacts, OfferPhase } from './offer-model';

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['16'], paddingBottom: th.space['8'], paddingHorizontal: th.size.gutter },
  head: { gap: th.space['4'] },
  foot: { gap: th.space['12'], alignItems: 'center' },
}));

export interface LockScreenOfferSheetProps {
  readonly facts: OfferFacts;
  readonly phase: OfferPhase;
  /** The lock screen's clock in the preview ("16:38"). */
  readonly clock: string;
  /** The meet-up's time ("17:00"), in the trip's zone; null when no meet-up is set. */
  readonly meetTime: string | null;
  /** When it reaches the lock screens ("16:30"); null when that is now. */
  readonly startsTime: string | null;
  /** The Boost button, once the paywall has registered; null hides it. */
  readonly boost: { readonly price: string | null; readonly onPress: () => void } | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export function LockScreenOfferSheet({
  facts,
  phase,
  clock,
  meetTime,
  startsTime,
  boost,
  onRetry,
  onClose,
}: LockScreenOfferSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const { trip, title, line } = useOfferCopy(facts, phase, startsTime);

  return (
    <Sheet
      detents={['fit']}
      closable={false}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID={`lock-screen-offer-${phase.kind}`}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <Text variant="eyebrow" color={theme.color.pink}>
            {t({ id: 'trip.lockScreen.eyebrow', message: `${trip} · Live Activity` })}
          </Text>
          <Text variant="h1" singleLine={false} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {phase.kind === 'no_meetup' || phase.kind === 'unavailable' ? null : (
          <CrewLivePreview facts={facts} clock={clock} meetTime={meetTime} />
        )}
        <Text variant="body" color={theme.semantic.text.secondary}>
          {line}
        </Text>
        <View style={styles.foot}>
          {phase.kind === 'asking' ? (
            <PillButton
              label={t({ id: 'trip.lockScreen.asking', message: 'Checking' })}
              tone="pink"
              block
              loading
              onPress={() => undefined}
              testID="lock-screen-offer-asking"
            />
          ) : null}
          {phase.kind === 'offer' && boost !== null ? (
            <PillButton
              label={
                boost.price === null
                  ? t({ id: 'trip.lockScreen.offer.boost', message: `Boost ${trip}` })
                  : t({
                      id: 'trip.lockScreen.offer.boostPrice',
                      message: `Boost ${trip} · ${boost.price}`,
                    })
              }
              tone="pink"
              block
              onPress={boost.onPress}
              testID="lock-screen-offer-boost"
            />
          ) : null}
          {phase.kind === 'offer' ? (
            <TextLink
              label={t({
                id: 'trip.lockScreen.offer.quiet',
                message: 'Just my own leave-by alarms',
              })}
              onPress={onClose}
              testID="lock-screen-offer-quiet"
            />
          ) : null}
          {phase.kind === 'unavailable' && phase.why !== 'switched_off' ? (
            <PillButton
              label={t({ id: 'trip.lockScreen.retry', message: 'Try again' })}
              block
              onPress={onRetry}
              testID="lock-screen-offer-retry"
            />
          ) : null}
          {phase.kind === 'started' ||
          phase.kind === 'no_meetup' ||
          (phase.kind === 'unavailable' && phase.why === 'switched_off') ? (
            <PillButton
              label={t({ id: 'trip.lockScreen.done', message: 'Got it' })}
              block
              onPress={onClose}
              testID="lock-screen-offer-done"
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
