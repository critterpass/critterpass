/**
 * Rate your driver (6.24): the driver's card (name, the days he drove) tilted on the sun, "How was
 * Made?", a three-way switch (loved, fine, not again), tags as chips (picked ones in ink with a
 * check), one tip for the next crew, and "Send to the next crew". An unlisted driver can be invited
 * to list himself. The answer may wait offline.
 */
import { DRIVER_TAGS, DRIVER_VERDICTS, type DriverVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { crewAccent, turn } from '@/features/trip';
import {
  Avatar,
  Button,
  Skeleton,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { TAG_LABELS, VERDICT_LABELS } from '../rating/labels';
import { useRateDriver } from '../rating/use-rate-driver';

export function RateDriverPremium(input: { readonly tripId: string; readonly providerId: string }) {
  const th = usePremiumTheme();
  const { t, i18n } = useLingui();
  const rate = useRateDriver(input);
  const back = t({ id: 'drivers.rate.back', message: 'Our drivers' });
  if (rate.kind !== 'ready') {
    return (
      <PushScreen
        title={t({ id: 'drivers.rate.title', message: 'Rate your driver' })}
        backLabel={back}
        testID={`drivers-rate-${rate.kind}`}
      >
        {rate.kind === 'loading' ? (
          <View style={{ padding: th.space.gutter }}>
            <Skeleton height={220} radius={th.radius.cardLarge} />
          </View>
        ) : rate.kind === 'failed' ? (
          <View style={{ padding: th.space.gutter, gap: th.space.gap12 }}>
            <Text variant="body" tone="muted" align="center">
              {rate.offline
                ? t({
                    id: 'drivers.premium.offline',
                    message: 'This needs signal. Try again when you have some.',
                  })
                : t({ id: 'drivers.premium.failed', message: "That didn't load. Try again." })}
            </Text>
            <Button
              label={t({ id: 'drivers.premium.retry', message: 'Try again' })}
              variant="secondary"
              onPress={rate.reload}
              testID="drivers-rate-retry"
            />
          </View>
        ) : (
          <Text variant="body" tone="muted" align="center" style={{ padding: th.space.gutter }}>
            {t({
              id: 'drivers.rate.missingLine',
              message: 'You can rate the drivers this crew rode with on this trip.',
            })}
          </Text>
        )}
      </PushScreen>
    );
  }
  const p = rate.props;
  const name = p.name;
  const days = p.days
    .map((day) => t({ id: 'drivers.rate.day', message: `Day ${day}` }))
    .join(' + ');
  return (
    <PushScreen
      title={t({ id: 'drivers.rate.title', message: 'Rate your driver' })}
      backLabel={back}
      scroll={false}
      testID="drivers-rate"
    >
      <ScrollView
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: th.space.gutter, gap: th.space.gap14 },
        ]}
      >
        <View
          style={[
            styles.driver,
            {
              backgroundColor: th.accent.sun,
              borderRadius: th.radius.cardRow,
              transform: [turn(4)],
            },
          ]}
        >
          <Avatar name={name} color={crewAccent(5)} size={62} ringed />
          <Text variant="headline" color={th.color.onAccent}>
            {name}
          </Text>
          {days === '' ? null : (
            <Text variant="badge" color={th.color.onAccent}>
              {days}
            </Text>
          )}
        </View>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'drivers.premium.howWas', message: `How was ${name}?` })}
        </Text>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.rate.intro',
            message: `Your crew's rating and tags go on ${name}'s listing if he's listed. Nothing about you does.`,
          })}
        </Text>
        <View style={styles.verdicts} accessibilityRole="radiogroup">
          {DRIVER_VERDICTS.map((value: DriverVerdict) => (
            <View key={value} style={styles.flex}>
              <Button
                label={i18n._(VERDICT_LABELS[value])}
                size="medium"
                variant={p.verdict === value ? 'primary' : 'control'}
                onPress={() => p.onVerdict(value)}
                testID={`drivers-verdict-${value}`}
              />
            </View>
          ))}
        </View>
        <View style={styles.tags}>
          {DRIVER_TAGS.map((tag) => {
            const on = p.tags.includes(tag);
            return (
              <Button
                key={tag}
                label={on ? `✓ ${i18n._(TAG_LABELS[tag])}` : i18n._(TAG_LABELS[tag])}
                size="small"
                variant={on ? 'primary' : 'floating'}
                onPress={() => p.onToggleTag(tag)}
                testID={`drivers-tag-${tag}`}
              />
            );
          })}
        </View>
        <TextField
          accessibilityLabel={t({ id: 'drivers.rate.tip', message: 'One tip for the next crew' })}
          placeholder={t({ id: 'drivers.rate.tip', message: 'One tip for the next crew' })}
          value={p.tip}
          onChangeText={p.onTip}
          multiline
          testID="drivers-rate-tip"
        />
        {p.onInvite === null ? null : (
          <TextButton
            label={t({ id: 'drivers.rate.invite', message: `Invite ${name} to be listed` })}
            onPress={p.onInvite}
            testID="drivers-rate-invite"
          />
        )}
      </ScrollView>
      <KeyboardStickyFooter>
        <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: th.space.gap12 }}>
          <Button
            label={
              p.saved
                ? t({ id: 'drivers.rate.saved', message: 'Answer saved' })
                : t({ id: 'drivers.premium.send', message: 'Send to the next crew' })
            }
            disabled={p.verdict === null || p.saved}
            loading={p.saving}
            onPress={p.onSave}
            testID="drivers-rate-save"
          />
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 120 },
  driver: { alignSelf: 'center', width: 160, alignItems: 'center', gap: 6, paddingVertical: 16 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  verdicts: { flexDirection: 'row', gap: 6 },
  flex: { flex: 1 },
});
