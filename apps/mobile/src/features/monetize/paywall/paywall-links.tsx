/**
 * The paywall's quiet actions as 4e-1 draws them: RESTORE in the top bar, across from the modal's
 * ✕, and under the button "Boost a trip instead" beside the yellow "What's in each ›".
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

/** The modal's ✕ is a header pill; RESTORE shares its line. */
const BAR = sizeToken(tokens.size.headerPill, 'height');

const useStyles = makeStyles((t) => ({
  bar: {
    position: 'absolute',
    top: t.space['8'],
    end: t.size.gutter,
    height: BAR,
    justifyContent: 'center',
  },
  link: { minHeight: BAR, justifyContent: 'center' },
}));

export function PaywallRestore({ onPress }: { readonly onPress: () => void }) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const label = t({ id: 'monetize.disclosure.restore', message: 'Restore' });
  return (
    <View style={styles.bar}>
      <PressScale
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.link}
        testID="paywall-restore"
      >
        <Text variant="label" color={theme.semantic.text.secondary}>
          {upper(label, locale)}
        </Text>
      </PressScale>
    </View>
  );
}

export interface PaywallLinksProps {
  /** Null when there is no trip here to boost. */
  readonly onBoost: (() => void) | null;
  readonly onCompare: () => void;
  readonly disabled: boolean;
}

export function PaywallLinks({ onBoost, onCompare, disabled }: PaywallLinksProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const compare = t({ id: 'monetize.paywall.compare', message: 'What’s in each ›' });
  return (
    <Row justify="space-between" align="center">
      {onBoost === null ? (
        <View />
      ) : (
        <TextLink
          label={t({ id: 'monetize.paywall.boostInstead', message: 'Boost a trip instead' })}
          onPress={onBoost}
          disabled={disabled}
          testID="paywall-boost"
        />
      )}
      <PressScale
        accessibilityLabel={compare}
        onPress={onCompare}
        disabled={disabled}
        style={styles.link}
        testID="paywall-compare"
      >
        <Text
          variant="rowTitle"
          color={disabled ? theme.semantic.text.tertiary : theme.color.yellow}
        >
          {compare}
        </Text>
      </PressScale>
    </Row>
  );
}
