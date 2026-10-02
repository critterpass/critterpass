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
  const trip = facts.tripName ?? t({ id: 'trip.lockScreen.thisTrip', message: 'This trip' });
  const count = facts.crew.length;
  const place = facts.meetup?.placeName ?? '';

  let title: string;
  let line: string;
  if (phase.kind === 'started') {
    title = t({ id: 'trip.lockScreen.started.title', message: 'On every lock screen' });
    line =
      startsTime === null
        ? t({
            id: 'trip.lockScreen.started.now',
            message: `The meet-up at ${place} is going to all ${count} lock screens now. It ends by itself once everyone is there.`,
          })
        : t({
            id: 'trip.lockScreen.started.later',
            message: `The meet-up at ${place} goes to all ${count} lock screens at ${startsTime}, half an hour before. It ends by itself once everyone is there.`,
          });
  } else if (phase.kind === 'no_meetup') {
    title = t({ id: 'trip.lockScreen.noMeetup.title', message: 'Set a meet-up first' });
    line = t({
      id: 'trip.lockScreen.noMeetup.line',
      message:
        'The lock screen follows a meet-up. Set one on the crew map and it goes to every phone half an hour before.',
    });
  } else if (phase.kind === 'unavailable') {
    title = t({ id: 'trip.lockScreen.unavailable.title', message: 'Not right now' });
    line =
      phase.why === 'offline'
        ? t({
            id: 'trip.lockScreen.unavailable.offline',
            message:
              "You're offline, so this couldn't reach the crew's phones. Try again when you're back.",
          })
        : phase.why === 'switched_off'
          ? t({
              id: 'trip.lockScreen.unavailable.switchedOff',
              message: 'The crew lock screen is switched off for now. The crew map still works.',
            })
          : t({
              id: 'trip.lockScreen.unavailable.failed',
              message: "That didn't go through. Try again in a moment.",
            });
  } else {
    title = t({ id: 'trip.lockScreen.offer.title', message: 'On every lock screen' });
    line = t({
      id: 'trip.lockScreen.offer.line',
      message: `On a boosted trip the meet-up, ETAs and SOS sit on all ${count} lock screens and in the Dynamic Island. It switches off at midnight on the last day.`,
    });
  }

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
