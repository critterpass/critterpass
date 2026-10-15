/**
 * The travel-insurance card (7.13): blue, tilted, the insurer, the policy number and the
 * assistance line, with the heart sticker in its corner. Tapping it edits the policy.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { turn } from '@/features/trip';
import { PressableScale, StickerIcon, Text, usePremiumTheme } from '@/ui/premium';

/**
 * The design's blue card: the rain text colour into the sky accent, over the deeper colour so the
 * white text stays readable wherever the gradient isn't painted.
 */
export function policyCardFill(from: string, to: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function PolicyCard(props: {
  readonly provider: string;
  readonly policyNo: string;
  readonly phone?: string | null;
  readonly onPress: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const white = th.accent.paper;
  const fill = policyCardFill(th.color.status.rain.text, th.accent.sky);
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={[props.provider, props.policyNo].join(', ')}
      accessibilityHint={t({ id: 'bookings.insurance.editHint', message: 'Edits the policy' })}
      testID="bookings-insurance-card"
    >
      <View
        style={[
          styles.card,
          {
            borderRadius: th.radius.cardRow,
            boxShadow: th.shadow.photo,
            transform: [turn(-3)],
            backgroundColor: th.color.status.rain.text,
            backgroundImage: fill,
          },
        ]}
      >
        <View style={styles.cardHead}>
          <Text variant="tier" color={white} style={styles.eyebrow}>
            {t({ id: 'bookings.premium.insuranceEyebrow', message: 'TRAVEL INSURANCE' })}
          </Text>
          <StickerIcon name="heart" size={30} tilt={8} />
        </View>
        <Text variant="stat" color={white} style={styles.provider} numberOfLines={1}>
          {props.provider}
        </Text>
        <View style={styles.fields}>
          <View style={styles.field}>
            <Text variant="badge" color={white} style={styles.fieldLabel}>
              {t({ id: 'bookings.premium.policyNoEyebrow', message: 'POLICY NO.' })}
            </Text>
            <PrivateContent>
              <Text variant="mono" color={white} numberOfLines={1}>
                {props.policyNo}
              </Text>
            </PrivateContent>
          </View>
          {props.phone == null || props.phone === '' ? null : (
            <View style={styles.field}>
              <Text variant="badge" color={white} style={styles.fieldLabel}>
                {t({ id: 'bookings.premium.assistanceEyebrow', message: 'ASSISTANCE' })}
              </Text>
              <Text variant="mono" color={white} numberOfLines={1}>
                {props.phone}
              </Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { height: 200, paddingVertical: 18, paddingHorizontal: 20 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { opacity: 0.8, letterSpacing: 0.9 },
  provider: { marginTop: 6 },
  fields: { marginTop: 'auto', flexDirection: 'row', gap: 24 },
  field: { gap: 2, flexShrink: 1 },
  fieldLabel: { opacity: 0.7, letterSpacing: 0.8 },
});
