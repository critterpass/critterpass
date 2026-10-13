/**
 * Before you go (9.23): what stays on if you cancel, a pause card for a renewing monthly plan (a
 * year is already paid, so a yearly plan is told cancelling only stops the next renewal), what
 * you'd lose, and Pause, Keep Pass+ or Cancel anyway. Both happen in the store's own sheet.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Card, LoadingCritter, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { usePlanDate } from '../plan/plan-copy';
import type { CancelViewProps } from '../plan/cancel-props';
import { PauseMonthBars } from './pause-bars';

export function CancelPremiumView({ props }: { readonly props: CancelViewProps | null }) {
  const { t, i18n } = useLingui();
  const th = usePremiumTheme();
  const planDate = usePlanDate();
  const backLabel = t({ id: 'monetize.cancel.back', message: 'Your plan' });
  if (props === null) {
    return (
      <PushScreen title={backLabel} backLabel={backLabel} testID="cancel-loading">
        <LoadingCritter
          label={t({ id: 'monetize.premium.planLoading', message: 'Tokek is reading your plan…' })}
        />
      </PushScreen>
    );
  }
  const { plan, nextTrip } = props;
  const until = planDate(plan.date);
  const play = props.store === 'play';
  const trip = nextTrip?.name ?? '';
  const pauseText = th.color.banner.guide.text;

  return (
    <PushScreen title={backLabel} backLabel={backLabel} testID="plan-cancel-page">
      <View
        style={{
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        <Text variant="display" style={styles.heavy} accessibilityRole="header">
          {t({ id: 'monetize.cancel.title', message: 'Before you go' })}
        </Text>
        <Text variant="rowText" tone="muted" testID="plan-cancel-stays">
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
          <View
            style={[styles.pause, { backgroundColor: th.color.banner.guide.bg }]}
            testID="plan-cancel-pause-card"
          >
            <Text variant="badge" color={th.color.status.maybe.text} style={styles.eyebrow}>
              {t({ id: 'monetize.cancel.between', message: 'BETWEEN TRIPS?' })}
            </Text>
            <Text variant="title" color={pauseText} style={styles.heavy}>
              {nextTrip === null
                ? t({ id: 'monetize.cancel.pauseTitle', message: 'Pause instead' })
                : t({
                    id: 'monetize.cancel.pauseTitleTrip',
                    message: `Pause until ${trip} instead`,
                  })}
            </Text>
            <Text variant="note" color={pauseText}>
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
              <PauseMonthBars months={nextTrip.months} />
            ) : null}
          </View>
        ) : plan.period === 'yearly' ? (
          <Card padded radius={22} testID="plan-cancel-yearly">
            <Text variant="note" tone="inkSecondary">
              {t({
                id: 'monetize.cancel.yearly',
                message:
                  'Your year is already paid, so there is nothing to pause. Cancelling only stops the next renewal.',
              })}
            </Text>
          </Card>
        ) : null}
        {props.perks.length > 0 ? (
          <View style={{ gap: 4 }} testID="plan-cancel-lose">
            <Text variant="label" tone="muted" style={{ paddingHorizontal: 6 }}>
              {t({ id: 'monetize.premium.lose', message: 'If you cancel, you’d lose' })}
            </Text>
            <Card radius={22}>
              {props.perks.map((line, i) => (
                <View
                  key={line.key}
                  style={[
                    styles.lose,
                    i > 0
                      ? { borderTopWidth: th.size.hairline, borderTopColor: th.color.hairline }
                      : null,
                  ]}
                >
                  <View
                    style={[styles.dash, { backgroundColor: th.color.destructive.listAction }]}
                  />
                  <Text variant="rowText" style={styles.flex}>
                    {i18n._(line.copy)}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
        <View style={{ gap: 8, marginTop: 8 }}>
          {plan.canPause ? (
            <Button
              label={
                play
                  ? nextTrip === null
                    ? t({ id: 'monetize.cancel.pauseInPlay', message: 'Pause in Google Play' })
                    : t({ id: 'monetize.cancel.pauseTill', message: `Pause till ${trip}` })
                  : t({ id: 'monetize.cancel.pauseInAppStore', message: 'Turn off auto-renew' })
              }
              onPress={props.onPause}
              testID="plan-cancel-pause"
            />
          ) : null}
          <Button
            label={t({ id: 'monetize.cancel.keep', message: 'Keep Pass+' })}
            variant={plan.canPause ? 'secondary' : 'primary'}
            onPress={props.onKeep}
            testID="plan-cancel-keep"
          />
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <TextButton
              label={t({ id: 'monetize.cancel.anyway', message: 'Cancel anyway' })}
              color={th.color.destructive.listAction}
              onPress={props.onCancel}
              testID="plan-cancel-anyway"
            />
          </View>
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heavy: { fontWeight: '800' },
  eyebrow: { fontWeight: '800', letterSpacing: 0.7 },
  pause: { borderRadius: 26, padding: 18, gap: 6 },
  lose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  dash: { width: 18, height: 2.5, borderRadius: 2 },
});
