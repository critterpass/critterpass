/**
 * The phone page's other ways in (3a-8): "or", Continue with Apple where the phone has it, Continue
 * with Google, and the terms line. Laid out by the page's own column.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { ProviderMark } from '../save/ProviderMark';

const useStyles = makeStyles((th) => ({
  or: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  rule: { flex: 1, height: 1 },
}));

export interface OtherWaysProps {
  /** Whether this phone can sign in with Apple. */
  readonly apple: boolean;
  /** The provider a sign-in is working with right now. */
  readonly working: 'apple' | 'google' | 'phone' | null;
  readonly onApple: () => void;
  readonly onGoogle: () => void;
}

export function OtherWays({ apple, working, onApple, onGoogle }: OtherWaysProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  return (
    <>
      <View style={styles.or}>
        <View style={[styles.rule, { backgroundColor: theme.semantic.border.control }]} />
        <Text variant="eyebrow" color={theme.semantic.text.tertiary}>
          {upper(t({ id: 'onboarding.phone.or', message: 'or' }), locale)}
        </Text>
        <View style={[styles.rule, { backgroundColor: theme.semantic.border.control }]} />
      </View>
      {apple ? (
        <PillButton
          label={t({ id: 'onboarding.save.apple', message: 'Continue with Apple' })}
          variant="secondary"
          leading={<ProviderMark provider="apple" color={theme.semantic.text.primary} />}
          onPress={onApple}
          loading={working === 'apple'}
          testID="phone-apple"
        />
      ) : null}
      <PillButton
        label={t({ id: 'onboarding.save.google', message: 'Continue with Google' })}
        variant="secondary"
        leading={<ProviderMark provider="google" color={theme.semantic.text.primary} />}
        onPress={onGoogle}
        loading={working === 'google'}
        testID="phone-google"
      />
      <Text variant="caption" color={theme.semantic.text.tertiary} style={{ textAlign: 'center' }}>
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
  );
}
