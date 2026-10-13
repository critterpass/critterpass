/**
 * 3a-8 "Your number": number entry with a country picker, the OTP boxes (digits drop in as the code
 * autofills; the last one rings green and the puffin claps), resend with a growing wait, and every
 * error the OTP route can answer. Pushed over the page that offered to save the pass, which it goes
 * back to once the number is verified. Also the returning user's sign-in from the splash.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { guideSticker } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { CodeBoxes } from '@/ui/inputs/CodeBoxes';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DeclinedMergeNote, MergeSheet } from '../save/MergeSheet';
import { saveErrorLine } from '../save/SaveSheet';
import { CountryPicker } from './CountryPicker';
import { OtherWays } from './OtherWays';
import { phoneProblemLine } from './phone-copy';
import { formatE164 } from './phone-number';
import { usePhoneStep } from './use-phone-step';

export { PHONE_ADVANCE_MS } from './use-phone-step';

const useStyles = makeStyles((th) => ({
  scroll: { flex: 1 },
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));

export function PhoneScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const step = usePhoneStep();
  const { returning, services, flow, phone, picking } = step;
  const { country, number, sent, waitS, code, status, problem, busy } = phone;
  const clap = useLoop('hop', { active: status === 'valid' });

  const lundi = guideSticker('lundi');
  return (
    <>
      {/* The footer pads the bottom inset itself and rides the keyboard: the field being typed in
          stays in view above it, and "Send code" stays in reach over the phone pad. */}
      <Scaffold variant="dark" edges={['top']} testID="onboarding-phone">
        <KeyboardScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
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
                  onPress={step.openPicker}
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
            {sent === null ? null : (
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
            {problem?.kind === 'verify_failed' ? (
              <InlineAction
                label={t({ id: 'onboarding.phone.retry', message: 'Try again' })}
                onPress={() => void phone.verify(code)}
                disabled={busy}
                testID="phone-verify-retry"
              />
            ) : null}
            {flow.state.kind === 'error' ? (
              <Text variant="bodySm" color={theme.color.pink} testID="phone-save-error">
                {saveErrorLine(flow.state.reason)}
              </Text>
            ) : null}
            {flow.state.kind === 'declined' ? (
              <DeclinedMergeNote state={flow.state} onSwitch={flow.reopenMerge} />
            ) : null}
            <OtherWays
              apple={services.apple !== null}
              working={flow.state.kind === 'working' ? flow.state.provider : null}
              onApple={() => void flow.apple()}
              onGoogle={() => void flow.google()}
            />
          </>
        </KeyboardScrollView>
        <KeyboardFooter>
          {sent === null ? (
            <PillButton
              label={t({ id: 'onboarding.phone.send', message: 'Send code' })}
              onPress={() => void phone.send()}
              loading={busy}
              disabled={number.trim().length === 0}
              block
              testID="phone-send"
            />
          ) : null}
        </KeyboardFooter>
      </Scaffold>
      {/* Outside the page, so the sheets stay full size while the page scales down under them. */}
      <MergeSheet
        state={flow.state}
        onUseExisting={() => void flow.confirmSwitch()}
        onKeepNew={step.keepNew}
        onClose={flow.closeKept}
      />
      {picking ? <CountryPicker onPick={step.pickCountry} onClose={step.closePicker} /> : null}
    </>
  );
}
