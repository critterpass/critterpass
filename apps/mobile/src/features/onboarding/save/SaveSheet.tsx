/**
 * 3a-7 "Save your pass · Keep it safe": the sheet rises over the finished pass. Apple, Google or a
 * phone number link this device's anonymous pass to an account; after sign-in the pass gets its
 * SAVED tick. "Not now" is a real option: signing in is asked again at purchase, invites or a
 * second device.
 */
import { t } from '@lingui/core/macro';
import { Platform, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { upper } from '@cp/i18n';
import { TextLink } from '@/ui/buttons/TextLink';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { MergeChoice } from './MergeChoice';
import { DeclinedMergeNote } from './MergeSheet';
import { ProviderMark } from './ProviderMark';
import type { SaveError, SaveState } from './use-save-flow';

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['12'], paddingHorizontal: th.space['20'], paddingBottom: th.space['16'] },
  center: { alignItems: 'center' },
}));

export function saveErrorLine(reason: SaveError): string {
  switch (reason) {
    case 'network':
      return t({
        id: 'onboarding.save.error.network',
        message: 'No signal right now. Your pass is safe on this phone; try again in a moment.',
      });
    case 'different_email':
      return t({
        id: 'onboarding.save.error.email',
        message: 'That account uses a different email. Try another way.',
      });
    case 'unavailable':
      return t({
        id: 'onboarding.save.error.unavailable',
        message: 'That sign-in isn’t available on this phone. Try another way.',
      });
    case 'cancelled':
      return t({
        id: 'onboarding.save.error.cancelled',
        message: 'Google sign-in didn’t finish. Try again, or use another way.',
      });
    case 'merge_expired':
      return t({
        id: 'onboarding.save.error.expired',
        message: 'That took a while. Sign in again to continue.',
      });
    case 'unknown':
      return t({
        id: 'onboarding.save.error.unknown',
        message: 'That didn’t work. Try again, or use another way.',
      });
  }
}

export interface SaveSheetProps {
  readonly state: SaveState;
  readonly onApple: () => void;
  readonly onGoogle: () => void;
  readonly onPhone: () => void;
  readonly onNotNow: () => void;
  readonly onUseExisting: () => void;
  readonly onKeepNew: () => void;
  /** Closes the "kept" explanation. */
  readonly onKeptDone: () => void;
  /** Back to the merge choice after the new pass was kept. */
  readonly onReopenMerge: () => void;
}

export function SaveSheet(props: SaveSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { state } = props;
  const working = state.kind === 'working' ? state.provider : null;
  const busy = working !== null || state.kind === 'merging';
  return (
    <Sheet
      detents={['fit']}
      onDismiss={props.onNotNow}
      accessibilityLabel={t({ id: 'onboarding.save.eyebrow', message: 'Save your pass' })}
      testID="save-sheet"
    >
      <View style={styles.body}>
        {state.kind === 'merge' || state.kind === 'merging' || state.kind === 'kept' ? (
          <MergeChoice
            provider={state.provider}
            preview={state.preview}
            mode={state.kind === 'kept' ? 'kept' : 'choose'}
            busy={state.kind === 'merging'}
            onUseExisting={props.onUseExisting}
            onKeepNew={props.onKeepNew}
            onDone={props.onKeptDone}
          />
        ) : (
          <>
            <Text variant="eyebrow" color={theme.color.yellow}>
              {upper(t({ id: 'onboarding.save.eyebrow', message: 'Save your pass' }), locale)}
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {t({ id: 'onboarding.save.title', message: 'Keep it safe' })}
            </Text>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({
                id: 'onboarding.save.body',
                message:
                  'So your pass, critters and crews survive a lost phone. We never post anything for you.',
              })}
            </Text>
            {state.kind === 'error' ? (
              <Text variant="bodySm" color={theme.color.pink} testID="save-error">
                {saveErrorLine(state.reason)}
              </Text>
            ) : null}
            {state.kind === 'declined' ? (
              <DeclinedMergeNote state={state} onSwitch={props.onReopenMerge} />
            ) : null}
            {Platform.OS === 'ios' ? (
              <PillButton
                label={t({ id: 'onboarding.save.apple', message: 'Continue with Apple' })}
                tone="cream"
                leading={
                  <Text variant="buttonLg" color={theme.color.ink['950']}>
                    {''}
                  </Text>
                }
                onPress={props.onApple}
                loading={working === 'apple'}
                disabled={busy}
                testID="save-apple"
              />
            ) : null}
            <PillButton
              label={t({ id: 'onboarding.save.google', message: 'Continue with Google' })}
              variant="secondary"
              leading={<ProviderMark provider="google" color={theme.semantic.text.primary} />}
              onPress={props.onGoogle}
              loading={working === 'google'}
              disabled={busy}
              testID="save-google"
            />
            <PillButton
              label={t({ id: 'onboarding.save.phone', message: 'Use my phone number' })}
              variant="secondary"
              onPress={props.onPhone}
              disabled={busy}
              testID="save-phone"
            />
            <View style={styles.center}>
              <TextLink
                label={t({ id: 'onboarding.save.notNow', message: 'Not now' })}
                onPress={props.onNotNow}
                disabled={busy}
                testID="save-not-now"
              />
            </View>
            <Text
              variant="caption"
              color={theme.semantic.text.tertiary}
              style={{ textAlign: 'center' }}
            >
              {t({
                id: 'onboarding.save.terms',
                message: 'By continuing you agree to the Terms and the Privacy Policy.',
              })}
            </Text>
          </>
        )}
      </View>
    </Sheet>
  );
}
