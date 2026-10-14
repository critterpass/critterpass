/**
 * Travel insurance (7.13): a blue card in the wallet, tilted, with the insurer and the policy
 * number; "Call assistance"; the details (tap the number to copy it); the guide's note that Help
 * shows this card; scan or delete at the foot. Tapping the card edits it (undesigned: the form in
 * the same push, see docs/undesigned-states.md). With no policy yet the page is the form.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivateContent } from '@/features/help';
import { guideCritterKind, turn } from '@/features/trip';
import {
  Button,
  GuideNote,
  PressableScale,
  Text,
  TextField,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';
import {
  confirmAlert,
  KeyboardAwareScroll,
  KeyboardStickyFooter,
  PushScreen,
} from '@/ui/premium/shell';

import { useBookingsServices } from '../data/services';
import { useWalletGuide } from '../data/wallet-guide';
import { useInsuranceForm } from '../insurance/use-insurance-form';
import { KeyValueCard } from './components/KeyValueCard';

export function PolicyCard(props: {
  readonly provider: string;
  readonly policyNo: string;
  readonly onPress: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const white = th.accent.paper;
  // The design's blue card: the rain text colour into the sky accent.
  const fill = [
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
    'linear-gradient(135deg',
    `${th.color.status.rain.text},`,
    `${th.accent.sky})`,
  ].join(' ');
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
            backgroundImage: fill,
          },
        ]}
      >
        <Text variant="tier" color={white} style={styles.eyebrow}>
          {t({ id: 'bookings.premium.insuranceEyebrow', message: 'TRAVEL INSURANCE' })}
        </Text>
        <Text variant="stat" color={white} style={styles.provider} numberOfLines={1}>
          {props.provider}
        </Text>
        <View style={styles.fields}>
          <Text variant="badge" color={white} style={styles.fieldLabel}>
            {t({ id: 'bookings.premium.policyNoEyebrow', message: 'POLICY NO.' })}
          </Text>
          <PrivateContent>
            <Text variant="mono" color={white} numberOfLines={1}>
              {props.policyNo}
            </Text>
          </PrivateContent>
        </View>
      </View>
    </PressableScale>
  );
}

export function InsurancePremium() {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  // Clears the home indicator with the keyboard down, and sits a gap above the keyboard when up.
  const footerPad = Math.max(insets.bottom, th.space.gap12);
  const { t } = useLingui();
  const services = useBookingsServices();
  const toast = useToast();
  const guide = useWalletGuide();
  const form = useInsuranceForm();
  const [editing, setEditing] = useState(false);
  const { existing, draft } = form;
  const backLabel = t({ id: 'bookings.back', message: 'Bookings' });
  const title = t({ id: 'bookings.insurance.title', message: 'Travel insurance' });
  const ready = draft.provider.trim() !== '' && draft.policyNo.trim() !== '';

  if (existing === null || editing) {
    return (
      <PushScreen
        largeTitle
        title={title}
        backLabel={backLabel}
        scroll={false}
        testID="bookings-insurance-form"
      >
        <KeyboardAwareScroll
          bottomOffset={th.size.button + th.space.gap12 + th.space.gap16}
          contentContainerStyle={[styles.form, { paddingHorizontal: th.space.gutter }]}
        >
          <TextField
            accessibilityLabel={t({ id: 'bookings.insurance.provider', message: 'Insurer' })}
            placeholder={t({ id: 'bookings.insurance.provider', message: 'Insurer' })}
            value={draft.provider}
            onChangeText={(provider) => form.onChange({ provider })}
            autoCapitalize="words"
            returnKeyType="next"
            testID="bookings-insurance-provider"
          />
          <TextField
            accessibilityLabel={t({ id: 'bookings.insurance.number', message: 'Policy number' })}
            placeholder={t({ id: 'bookings.insurance.number', message: 'Policy number' })}
            value={draft.policyNo}
            onChangeText={(policyNo) => form.onChange({ policyNo })}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            testID="bookings-insurance-number"
          />
          <TextField
            accessibilityLabel={t({
              id: 'bookings.premium.assistancePhone',
              message: 'Assistance phone',
            })}
            placeholder={t({ id: 'bookings.premium.assistancePhone', message: 'Assistance phone' })}
            value={draft.phone}
            onChangeText={(phone) => form.onChange({ phone })}
            keyboardType="phone-pad"
            testID="bookings-insurance-phone"
          />
          {form.canScan ? (
            <Button
              label={
                form.doc === 'scanning'
                  ? t({ id: 'bookings.insurance.scanning', message: 'Reading the page…' })
                  : form.doc === 'attached'
                    ? t({ id: 'bookings.insurance.attached', message: 'Policy page kept ✓' })
                    : t({ id: 'bookings.insurance.scan', message: 'Scan the policy' })
              }
              variant="secondary"
              loading={form.doc === 'scanning'}
              onPress={() => void form.scan()}
              testID="bookings-insurance-scan"
            />
          ) : null}
          {form.error === null ? null : (
            <Text variant="helper" color={th.color.destructive.helper}>
              {form.error === 'offline'
                ? t({
                    id: 'bookings.premium.insuranceOffline',
                    message: 'Saving needs signal. Your typing stays here.',
                  })
                : t({ id: 'bookings.insurance.failed', message: "That didn't save. Try again." })}
            </Text>
          )}
        </KeyboardAwareScroll>
        <KeyboardStickyFooter openedOffset={th.space.gap12 - footerPad}>
          <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: footerPad }}>
            <Button
              label={t({ id: 'bookings.insurance.save', message: 'Save' })}
              disabled={!ready}
              loading={form.saving}
              loadingLabel={t({ id: 'bookings.insurance.saving', message: 'Saving…' })}
              onPress={() => void form.submit()}
              testID="bookings-insurance-save"
            />
          </View>
        </KeyboardStickyFooter>
      </PushScreen>
    );
  }

  const phone = existing.assistance_phone;
  return (
    <PushScreen largeTitle title={title} backLabel={backLabel} testID="bookings-insurance">
      <View style={[styles.read, { gap: th.space.gap16 }]}>
        <View style={{ paddingHorizontal: th.space.titleGutter, paddingVertical: th.space.gap12 }}>
          <PolicyCard
            provider={existing.provider}
            policyNo={existing.policy_no}
            onPress={() => setEditing(true)}
          />
        </View>
        {phone === null ? null : (
          <View style={{ paddingHorizontal: th.space.gutter }}>
            <Button
              label={t({ id: 'bookings.insurance.call', message: 'Call assistance' })}
              // eslint-disable-next-line lingui/no-unlocalized-strings -- a dial link, not copy
              onPress={() => void Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)}
              testID="bookings-insurance-call"
            />
          </View>
        )}
        <KeyValueCard
          rows={[
            {
              key: 'insurer',
              label: t({ id: 'bookings.insurance.provider', message: 'Insurer' }),
              value: existing.provider,
            },
            {
              key: 'number',
              label: t({ id: 'bookings.insurance.number', message: 'Policy number' }),
              value: existing.policy_no,
              mono: true,
              onPress: () =>
                void services.copy(existing.policy_no).then(() =>
                  toast.show({
                    kind: 'done',
                    message: t({
                      id: 'bookings.insurance.copied',
                      message: 'Policy number copied.',
                    }),
                  }),
                ),
            },
            {
              key: 'page',
              label: t({ id: 'bookings.insurance.page', message: 'Policy page' }),
              value:
                existing.doc_media_key === null
                  ? ''
                  : t({ id: 'bookings.insurance.kept', message: 'Kept with it ✓' }),
            },
          ]}
        />
        <View style={{ paddingHorizontal: th.space.gap16 }}>
          <GuideNote
            name={guide.name}
            critter={guideCritterKind(guide.id)}
            text={t({
              id: 'bookings.insurance.note',
              message: 'The Help screen shows this card when you need it.',
            })}
          />
        </View>
        <View style={[styles.pair, { paddingHorizontal: th.space.gutter }]}>
          {form.canScan ? (
            <View style={styles.flex}>
              <Button
                label={t({ id: 'bookings.insurance.scan', message: 'Scan the policy' })}
                variant="secondary"
                loading={form.doc === 'scanning'}
                onPress={() => void form.scan()}
                testID="bookings-insurance-rescan"
              />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button
              label={t({ id: 'bookings.insurance.delete', message: 'Delete policy' })}
              variant="destructive"
              onPress={() =>
                void confirmAlert({
                  title: t({
                    id: 'bookings.insurance.deleteTitle',
                    message: 'Delete this policy?',
                  }),
                  message: t({
                    id: 'bookings.insurance.deleteLine',
                    message: 'It leaves this phone and Help stops showing it.',
                  }),
                  confirm: t({ id: 'bookings.insurance.delete', message: 'Delete policy' }),
                  cancel: t({ id: 'bookings.options.cancel', message: 'Cancel' }),
                }).then((yes) => {
                  if (yes) void form.remove();
                })
              }
              testID="bookings-insurance-delete"
            />
          </View>
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingTop: 12 },
  read: { paddingTop: 4 },
  card: { height: 200, paddingVertical: 18, paddingHorizontal: 20 },
  eyebrow: { opacity: 0.8, letterSpacing: 0.9 },
  provider: { marginTop: 6 },
  fields: { marginTop: 'auto', gap: 2 },
  fieldLabel: { opacity: 0.7, letterSpacing: 0.8 },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
