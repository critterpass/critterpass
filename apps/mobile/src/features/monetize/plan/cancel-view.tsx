/**
 * Before you go (4d-2). A monthly plan is offered a pause first; a yearly plan is told plainly
 * that the year is already paid. The App Store has no pause, so on iPhone the pause is turning
 * auto-renew off in the store and back on before the next trip, and the page says so. Cancelling
 * always ends in the store's own sheet; the outcome arrives from the server afterwards.
 */
import type { StorePlatform } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { PauseBars, type PauseMonth } from '@/ui/monetize/PauseBars';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PerkLine } from '../perks/perk-copy';
import { usePlanDate } from './plan-copy';
import type { PlanModel } from './plan-model';

export interface CancelViewProps {
  readonly plan: PlanModel;
  readonly store: StorePlatform | null;
  /** The next trip, when there is one to pause until. */
  readonly nextTrip: { readonly name: string; readonly months: readonly PauseMonth[] } | null;
  /** What Pass+ gives today, from the server's list. */
  readonly perks: readonly PerkLine[];
  readonly onPause: () => void;
  readonly onKeep: () => void;
  readonly onCancel: () => void;
  readonly onBack?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  content: {
    flexGrow: 1,
    padding: t.size.gutter,
    paddingBottom: t.space['32'],
    gap: t.space['20'],
  },
  pause: {
    borderRadius: t.radius.lg,
    borderWidth: t.space['2'],
    borderColor: t.color.yellow,
    backgroundColor: t.semantic.bg.raised,
    padding: t.size.cardInner.max,
    gap: t.space['10'],
  },
  card: {
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    padding: t.size.cardInner.max,
    gap: t.space['10'],
  },
  spacer: { flex: 1 },
}));

export function CancelView(props: CancelViewProps) {
  const { t, i18n } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const planDate = usePlanDate();
  const { plan, nextTrip } = props;
  const until = planDate(plan.date);
  const play = props.store === 'play';
  const trip = nextTrip?.name ?? '';

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-cancel-page">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'monetize.cancel.back', message: 'Your plan' })}
          onPress={props.onBack}
          testID="plan-cancel-back"
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'monetize.cancel.title', message: 'Before you go' })}
        </Text>
        <Text variant="bodyLg" color={theme.semantic.text.secondary} testID="plan-cancel-stays">
          {until === null
            ? t({
                id: 'monetize.cancel.stays',
                message:
                  'If you cancel, Pass+ stays on until the end of what you’ve paid for. Boosts are separate and stay on for the whole crew.',
              })
            : t({
                id: 'monetize.cancel.staysUntil',
                message: `If you cancel, Pass+ stays on until ${until}. Boosts are separate and stay on for the whole crew.`,
              })}
        </Text>
        {plan.canPause ? (
          <View style={styles.pause} testID="plan-cancel-pause-card">
            <Text variant="eyebrow" color={theme.color.yellow}>
              {t({ id: 'monetize.cancel.between', message: 'BETWEEN TRIPS?' })}
            </Text>
            <Text variant="h3">
              {nextTrip === null
                ? t({ id: 'monetize.cancel.pauseTitle', message: 'Pause instead' })
                : t({
                    id: 'monetize.cancel.pauseTitleTrip',
                    message: `Pause until ${trip} instead`,
                  })}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {play
                ? t({
                    id: 'monetize.cancel.pausePlay',
                    message:
                      'Google Play can pause Pass+ for up to three months: no charges while it’s paused, and it starts again by itself.',
                  })
                : t({
                    id: 'monetize.cancel.pauseAppStore',
                    message:
                      'The App Store has no pause. Turn off auto-renew there instead: no more charges, and you turn Pass+ back on from Your plan before you fly.',
                  })}
            </Text>
            {nextTrip !== null && nextTrip.months.length > 0 ? (
              <PauseBars months={nextTrip.months} testID="plan-cancel-bars" />
            ) : null}
          </View>
        ) : plan.period === 'yearly' ? (
          <View style={styles.card} testID="plan-cancel-yearly">
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({
                id: 'monetize.cancel.yearly',
                message:
                  'Your year is already paid, so there is nothing to pause. Cancelling only stops the next renewal.',
              })}
            </Text>
          </View>
        ) : null}
        {props.perks.length > 0 ? (
          <View style={styles.card} testID="plan-cancel-lose">
            <Text variant="eyebrow">
              {t({ id: 'monetize.cancel.lose', message: 'WHAT YOU’D LOSE' })}
            </Text>
            {props.perks.map((line) => (
              <Text key={line.key} variant="body">
                {`– ${i18n._(line.copy)}`}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={styles.spacer} />
        <Stack gap="12">
          {plan.canPause ? (
            <PillButton
              label={
                play
                  ? t({ id: 'monetize.cancel.pauseInPlay', message: 'Pause in Google Play' })
                  : t({
                      id: 'monetize.cancel.pauseInAppStore',
                      message: 'Turn off auto-renew',
                    })
              }
              onPress={props.onPause}
              block
              testID="plan-cancel-pause"
            />
          ) : null}
          <PillButton
            label={t({ id: 'monetize.cancel.keep', message: 'Keep Pass+' })}
            variant={plan.canPause ? 'secondary' : 'primary'}
            onPress={props.onKeep}
            block
            testID="plan-cancel-keep"
          />
          <TextLink
            label={t({ id: 'monetize.cancel.anyway', message: 'Cancel anyway' })}
            onPress={props.onCancel}
            testID="plan-cancel-anyway"
          />
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
