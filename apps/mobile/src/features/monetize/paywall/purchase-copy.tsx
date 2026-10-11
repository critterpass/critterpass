/**
 * The disclosure every purchase surface shows under its button: renewal terms, where to cancel,
 * Terms, Privacy and Restore. The words themselves live in ./purchase-lines.
 */
import type { StorePlatform } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { useDisclosureLine } from './purchase-lines';

export { usePhaseLine, useRestoreLine } from './purchase-lines';

export interface DisclosureProps {
  /** `subscription` renews; `once` is a single payment. */
  readonly kind: 'subscription' | 'once';
  /** The store's price string and the period it renews on; absent while there is no price. */
  readonly price?: string | undefined;
  readonly period?: 'monthly' | 'yearly' | undefined;
  readonly store: StorePlatform | null;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
  readonly onRestore?: (() => void) | undefined;
  readonly testID: string;
}

/** Renewal terms, where to cancel, Terms, Privacy and Restore, under a purchase button. */
export function Disclosure(props: DisclosureProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const line = useDisclosureLine()(props);
  return (
    <Stack gap="4" align="center" testID={props.testID}>
      <Text
        variant="caption"
        color={theme.semantic.text.secondary}
        style={{ textAlign: 'center' }}
        testID={`${props.testID}-line`}
      >
        {line}
      </Text>
      <Row gap="16" justify="center" wrap>
        <TextLink
          label={t({ id: 'monetize.disclosure.terms', message: 'Terms' })}
          onPress={props.onTerms}
          testID={`${props.testID}-terms`}
        />
        <TextLink
          label={t({ id: 'monetize.disclosure.privacy', message: 'Privacy' })}
          onPress={props.onPrivacy}
          testID={`${props.testID}-privacy`}
        />
        {props.onRestore ? (
          <TextLink
            label={t({ id: 'monetize.disclosure.restore', message: 'Restore' })}
            onPress={props.onRestore}
            testID={`${props.testID}-restore`}
          />
        ) : null}
      </Row>
    </Stack>
  );
}
