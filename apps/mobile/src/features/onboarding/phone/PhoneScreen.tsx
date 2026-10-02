/**
 * 3a-8 "Your number": number entry with a country picker, the OTP boxes (digits drop in as the code
 * autofills; the last one rings green and the puffin claps), resend with a growing wait, and every
 * error the OTP route can answer. Also the returning user's sign-in from the splash.
 */
import { t } from '@lingui/core/macro';
import { getLocales } from 'expo-localization';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { homeBaseFor } from '@cp/domain';
import { upper } from '@cp/i18n';

import { deviceLastUid } from '@/data/app-session/last-uid-store';
import { useAnalytics } from '@/lib/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { CodeBoxes } from '@/ui/inputs/CodeBoxes';
import { TextField } from '@/ui/inputs/TextField';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { airportDataset } from '../content';
import { markOnboardingComplete } from '../flow-controller/completion';
import { readDraft, updateDraft } from '../flow-controller/draft-store';
import { ONBOARDING_ROUTES } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { DeclinedMergeNote, MergeSheet } from '../save/MergeSheet';
import { ProviderMark } from '../save/ProviderMark';
import { saveErrorLine } from '../save/SaveSheet';
import { useSaveFlow } from '../save/use-save-flow';
import { useOnboardingServices } from '../services';
import { CountryPicker } from './CountryPicker';
import { phoneProblemLine } from './phone-copy';
import { defaultCountry, formatE164 } from './phone-number';
import { usePhoneFlow } from './use-phone-flow';

/** From the last digit landing to moving on (3a-8: ring at 1350 ms, auto-advance at 2150 ms). */
export const PHONE_ADVANCE_MS = 2150;

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['14'],
    paddingBottom: th.space['24'],
  },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  headText: { flex: 1, gap: th.space['8'] },
  dialTarget: { justifyContent: 'center' },
  dial: {
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['6'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.base,
  },
  or: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  rule: { flex: 1, height: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));

export function PhoneScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const returning = params.mode === 'returning';
  useTrackStep('phone', returning ? 'returning' : 'new');
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const analytics = useAnalytics();
  const services = useOnboardingServices();
  const flow = useSaveFlow();
  const draft = readDraft();
  const home = draft?.home_iata ? homeBaseFor(airportDataset(), draft.home_iata) : null;
  const phone = usePhoneFlow(
    {
      auth: services.auth,
      save: flow,
      // Signed in to the pass this number holds: the app starts again on that account, at Home.
      returning: returning
        ? {
            onSignedIn: (userId) => {
              // The restart opens this account's data straight away, not the fresh pass's first.
              deviceLastUid.write(userId);
              setTimeout(() => {
                markOnboardingComplete();
                services.restart();
              }, PHONE_ADVANCE_MS);
            },
          }
        : undefined,
    },
    defaultCountry(home?.country ?? null, getLocales()[0]?.regionCode ?? null),
  );
  const [picking, setPicking] = useState(false);
  const { country, number, sent, waitS, code, status, problem, busy } = phone;
  const clap = useLoop('hop', { active: status === 'valid' });

  // Saved (or switched) → move on.
  useEffect(() => {
    const state = flow.state;
    if (state.kind === 'saved') {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
      analytics.capture('account_saved', { provider: state.provider });
      if (returning) {
        // No pass on this number yet: it is now this phone's account; make the pass.
        const timer = setTimeout(() => router.replace(ONBOARDING_ROUTES.name), PHONE_ADVANCE_MS);
        return () => clearTimeout(timer);
      }
      updateDraft((d) => ({ ...d, saved: true, step: 'saved' }));
      const timer = setTimeout(
        () => router.replace(ONBOARDING_ROUTES.permissions),
        PHONE_ADVANCE_MS,
      );
      return () => clearTimeout(timer);
    }
    if (state.kind === 'switched') {
      // "Use my old pass": the app starts again on that account, like a returning sign-in.
      markOnboardingComplete();
      services.restart();
    }
    return undefined;
  }, [flow.state, returning, analytics, services]);

  const lundi = GUIDE_STICKERS.lundi;
  return (
    <>
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="onboarding-phone">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackEyebrow label={t({ id: 'onboarding.phone.back', message: 'Back' })} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text variant="h1" designSize={52} accessibilityRole="header">
                {returning
                  ? t({ id: 'onboarding.phone.returningTitle', message: 'Welcome\nback' })
                  : t({ id: 'onboarding.phone.title', message: 'Your\nnumber' })}
              </Text>
              <Text variant="body" color={theme.semantic.text.secondary}>
                {returning
                  ? t({
                      id: 'onboarding.phone.returningBody',
                      message:
                        'Sign in with the number, Apple ID or Google account your pass is saved to.',
                    })
                  : t({
                      id: 'onboarding.phone.body',
                      message:
                        'So your pass survives a lost phone. One account for every crew, trip and critter.',
                    })}
              </Text>
            </View>
            <Animated.View style={clap}>
              <Sticker kind={lundi.kind} name={lundi.name} size={88} />
            </Animated.View>
          </View>

          <>
            <TextField
              label={upper(t({ id: 'onboarding.phone.label', message: 'Phone' }), locale)}
              value={number}
              onChangeText={phone.setNumber}
              editable={sent === null}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              clearable={sent === null}
              leading={
                <PressScale
                  onPress={() => setPicking(true)}
                  accessibilityLabel={t({
                    id: 'onboarding.phone.pickCountry',
                    message: `Country code ${formatE164(country, '')}`,
                  })}
                  widthClass="narrow"
                  disabled={sent !== null}
                  style={styles.dialTarget}
                  testID="phone-country"
                >
                  <View style={styles.dial}>
                    <Text variant="rowTitle">{formatE164(country, '')}</Text>
                  </View>
                </PressScale>
              }
              testID="phone-number"
            />
            {sent === null ? (
              <PillButton
                label={t({ id: 'onboarding.phone.send', message: 'Send code' })}
                onPress={() => void phone.send()}
                loading={busy}
                disabled={number.trim().length === 0}
                testID="phone-send"
              />
            ) : (
              <>
                <Text variant="bodySm" color={theme.semantic.text.secondary} testID="phone-sent">
                  {sent.channel === 'whatsapp'
                    ? t({
                        id: 'onboarding.phone.sentWhatsapp',
                        message: `Code sent to ${formatE164(country, number)} on WhatsApp`,
                      })
                    : t({
                        id: 'onboarding.phone.sentSms',
                        message: `Code sent to ${formatE164(country, number)} by SMS`,
                      })}
                </Text>
                <CodeBoxes
                  value={code}
                  onChangeText={phone.setCode}
                  onComplete={(entered) => void phone.verify(entered)}
                  status={status}
                  label={t({ id: 'onboarding.phone.code', message: 'Verification code' })}
                  autoFocus
                  testID="phone-code"
                />
                <View style={styles.row}>
                  <InlineAction
                    label={
                      waitS > 0
                        ? t({ id: 'onboarding.phone.resendIn', message: `Resend in ${waitS} s` })
                        : t({ id: 'onboarding.phone.resend', message: 'Send a new code' })
                    }
                    onPress={() => void phone.send()}
                    disabled={waitS > 0 || busy}
                    testID="phone-resend"
                  />
                  <InlineAction
                    label={t({ id: 'onboarding.phone.change', message: 'Change number' })}
                    onPress={phone.changeNumber}
                    testID="phone-change"
                  />
                </View>
              </>
            )}
            {problem !== null ? (
              <Text variant="bodySm" color={theme.color.pink} testID="phone-problem">
                {phoneProblemLine(problem.kind, problem.retryS)}
              </Text>
            ) : null}
            {flow.state.kind === 'error' ? (
              <Text variant="bodySm" color={theme.color.pink} testID="phone-save-error">
                {saveErrorLine(flow.state.reason)}
              </Text>
            ) : null}
            {flow.state.kind === 'declined' ? (
              <DeclinedMergeNote state={flow.state} onSwitch={flow.reopenMerge} />
            ) : null}
            <View style={styles.or}>
              <View style={[styles.rule, { backgroundColor: theme.semantic.border.control }]} />
              <Text variant="eyebrow" color={theme.semantic.text.tertiary}>
                {upper(t({ id: 'onboarding.phone.or', message: 'or' }), locale)}
              </Text>
              <View style={[styles.rule, { backgroundColor: theme.semantic.border.control }]} />
            </View>
            {services.apple !== null ? (
              <PillButton
                label={t({ id: 'onboarding.save.apple', message: 'Continue with Apple' })}
                variant="secondary"
                leading={<ProviderMark provider="apple" color={theme.semantic.text.primary} />}
                onPress={() => void flow.apple()}
                loading={flow.state.kind === 'working' && flow.state.provider === 'apple'}
                testID="phone-apple"
              />
            ) : null}
            <PillButton
              label={t({ id: 'onboarding.save.google', message: 'Continue with Google' })}
              variant="secondary"
              leading={<ProviderMark provider="google" color={theme.semantic.text.primary} />}
              onPress={() => void flow.google()}
              loading={flow.state.kind === 'working' && flow.state.provider === 'google'}
              testID="phone-google"
            />
            <Text
              variant="caption"
              color={theme.semantic.text.tertiary}
              style={{ textAlign: 'center' }}
            >
              {t({
                id: 'onboarding.save.terms',
                message: 'By continuing you agree to the Terms and the Privacy Policy.',
              })}
              {'\n'}
              {t({
                id: 'onboarding.phone.neverPost',
                message: 'We never post anything for you.',
              })}
            </Text>
          </>
        </ScrollView>
      </Scaffold>
      {/* Outside the page, so the sheets stay full size while the page scales down under them. */}
      <MergeSheet
        state={flow.state}
        onUseExisting={() => void flow.confirmSwitch()}
        onKeepNew={() => {
          flow.keepThisPass();
          phone.changeNumber();
        }}
        onClose={flow.closeKept}
      />
      {picking ? (
        <CountryPicker
          onPick={(next) => {
            phone.setCountry(next);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}
