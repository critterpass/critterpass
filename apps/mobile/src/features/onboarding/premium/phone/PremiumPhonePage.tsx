/**
 * "Your number" on the premium pages (no render of its own; built on 2.05's wizard page and 2.15's
 * code tiles): the country code and number, the six code tiles (digits drop in as the code
 * autofills; a code that checks out rings green and Lundi hops), resend with a growing wait, every
 * error the code routes answer, Apple and Google as the other ways in, and the merge choice when
 * the number already holds a pass. Pushed over the page that asked for a number; also the
 * returning sign-in from the splash (`?mode=returning`).
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  PressableScale,
  SPRINGS,
  Text,
  TextButton,
  TextField,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { phoneProblemLine } from '../../phone/phone-copy';
import { formatE164 } from '../../phone/phone-number';
import { usePhoneStep } from '../../phone/use-phone-step';
import { declinedLine } from '../../save/merge-copy';
import { saveErrorLine } from '../../save/save-copy';
import { WizardHeader } from '../components/WizardHeader';
import { WizardPage } from '../components/WizardPage';
import { ProviderButton, PremiumSaveSheet } from '../save/PremiumSaveSheet';
import { CountryListPage } from './CountryListPage';
import { OtpTiles } from './OtpTiles';

/** Lundi's hop when the code checks out: up on Snappy, down on Lively. */
function useHop(active: boolean) {
  const reduced = usePremiumReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) return;
    y.value = withSequence(withSpring(-14, SPRINGS.snappy), withSpring(0, SPRINGS.lively));
  }, [active, reduced, y]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
}

function OrRule() {
  const theme = usePremiumTheme();
  const rule = { flex: 1, height: 1, backgroundColor: theme.color.fieldBorder };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
      <View style={rule} />
      <Text variant="caption" tone="muted">
        {t({ id: 'onboarding.phone.or', message: 'or' })}
      </Text>
      <View style={rule} />
    </View>
  );
}

export function PremiumPhonePage() {
  const theme = usePremiumTheme();
  const step = usePhoneStep();
  const { returning, services, flow, phone } = step;
  const { country, number, sent, waitS, code, status, problem, busy } = phone;
  const hop = useHop(status === 'valid');
  const lundi = guideSticker('lundi');
  const backLabel = t({ id: 'onboarding.phone.back', message: 'Back' });
  const working = flow.state.kind === 'working' ? flow.state.provider : null;

  if (step.picking) {
    return (
      <CountryListPage current={country} onPick={step.pickCountry} onClose={step.closePicker} />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WizardPage
        backLabel={backLabel}
        header={<WizardHeader label="" backLabel={backLabel} onBack={() => router.back()} />}
        testID="onboarding-phone"
        {...(sent === null
          ? {
              footer: (
                <Button
                  label={t({ id: 'onboarding.phone.send', message: 'Send code' })}
                  onPress={() => void phone.send()}
                  loading={busy}
                  disabled={number.trim().length === 0}
                  testID="phone-send"
                />
              ),
            }
          : {})}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: theme.space.gap8 }}>
            <Text variant="largeTitle" accessibilityRole="header">
              {returning
                ? t({ id: 'onboarding.phone.returningTitle', message: 'Welcome\nback' })
                : t({ id: 'onboarding.phone.title', message: 'Your\nnumber' })}
            </Text>
            <Text variant="body" tone="muted">
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
          <Animated.View style={hop}>
            <CritterSticker
              kind={lundi.kind}
              name={lundi.name}
              size={88}
              pose={status === 'valid' ? 'cheer' : 'wave'}
            />
          </Animated.View>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
          <PressableScale
            onPress={step.openPicker}
            disabled={sent !== null}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: 'onboarding.phone.pickCountry',
              message: `Country code ${formatE164(country, '')}`,
            })}
            testID="phone-country"
          >
            <View
              style={{
                minHeight: theme.size.field,
                paddingHorizontal: theme.space.fieldPadH,
                borderRadius: theme.radius.field,
                backgroundColor: theme.color.card,
                boxShadow: theme.shadow.raised,
                justifyContent: 'center',
                opacity: sent === null ? 1 : theme.opacity.disabled,
              }}
            >
              <Text variant="rowTitle">{formatE164(country, '')}</Text>
            </View>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <TextField
              accessibilityLabel={t({ id: 'onboarding.phone.label', message: 'Phone' })}
              placeholder={t({ id: 'onboarding.phone.label', message: 'Phone' })}
              value={number}
              onChangeText={phone.setNumber}
              editable={sent === null}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              testID="phone-number"
            />
          </View>
        </View>

        {sent === null ? null : (
          <>
            <Text variant="caption" tone="muted" testID="phone-sent">
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
            <OtpTiles
              value={code}
              onChangeText={phone.setCode}
              onComplete={(entered) => void phone.verify(entered)}
              status={status}
              label={t({ id: 'onboarding.phone.code', message: 'Verification code' })}
              autoFocus
              testID="phone-code"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TextButton
                label={
                  waitS > 0
                    ? t({ id: 'onboarding.phone.resendIn', message: `Resend in ${waitS} s` })
                    : t({ id: 'onboarding.phone.resend', message: 'Send a new code' })
                }
                onPress={() => void phone.send()}
                disabled={waitS > 0 || busy}
                align="start"
                testID="phone-resend"
              />
              <TextButton
                label={t({ id: 'onboarding.phone.change', message: 'Change number' })}
                tone="inkSecondary"
                onPress={phone.changeNumber}
                testID="phone-change"
              />
            </View>
          </>
        )}
        {problem !== null ? (
          <Text variant="caption" color={theme.color.destructive.helper} testID="phone-problem">
            {phoneProblemLine(problem.kind, problem.retryS)}
          </Text>
        ) : null}
        {problem?.kind === 'verify_failed' ? (
          <TextButton
            label={t({ id: 'onboarding.phone.retry', message: 'Try again' })}
            onPress={() => void phone.verify(code)}
            disabled={busy}
            align="start"
            testID="phone-verify-retry"
          />
        ) : null}
        {flow.state.kind === 'error' ? (
          <Text variant="caption" color={theme.color.destructive.helper} testID="phone-save-error">
            {saveErrorLine(flow.state.reason)}
          </Text>
        ) : null}
        {flow.state.kind === 'declined' ? (
          <View style={{ gap: theme.space.gap4, alignItems: 'flex-start' }} testID="merge-declined">
            <Text variant="caption" tone="muted">
              {declinedLine(flow.state.provider)}
            </Text>
            <TextButton
              label={t({ id: 'onboarding.merge.switchBack', message: 'Use my old pass instead' })}
              onPress={flow.reopenMerge}
              align="start"
              testID="merge-declined-switch"
            />
          </View>
        ) : null}

        <OrRule />
        {services.apple !== null ? (
          <ProviderButton
            provider="apple"
            label={t({ id: 'onboarding.save.apple', message: 'Continue with Apple' })}
            ink={false}
            onPress={() => void flow.apple()}
            loading={working === 'apple'}
            disabled={working !== null}
            testID="phone-apple"
          />
        ) : null}
        <ProviderButton
          provider="google"
          label={t({ id: 'onboarding.save.google', message: 'Continue with Google' })}
          ink={false}
          onPress={() => void flow.google()}
          loading={working === 'google'}
          disabled={working !== null}
          testID="phone-google"
        />
        <Text variant="captionMuted" align="center">
          {t({
            id: 'onboarding.save.terms',
            message: 'By continuing you agree to the Terms and the Privacy Policy.',
          })}
          {'\n'}
          {t({ id: 'onboarding.phone.neverPost', message: 'We never post anything for you.' })}
        </Text>
      </WizardPage>
      {/* Over the page, so the merge choice never reads as part of "Your number". */}
      <PremiumSaveSheet
        state={flow.state}
        mergeOnly
        onApple={() => void flow.apple()}
        onGoogle={() => void flow.google()}
        onPhone={() => undefined}
        onNotNow={flow.closeKept}
        onUseExisting={() => void flow.confirmSwitch()}
        onKeepNew={step.keepNew}
        onKeptDone={flow.closeKept}
        onReopenMerge={flow.reopenMerge}
      />
    </View>
  );
}
