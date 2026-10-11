/**
 * Under a purchase button: what the purchase is doing now, the store's renewal terms, and Terms,
 * Privacy and (optionally) Restore. The same words the current pages use.
 */
import type { StorePlatform } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text, TextButton } from '@/ui/premium';

import type { PaywallPhase } from '../../paywall/paywall-model';
import { useDisclosureLine, usePhaseLine } from '../../paywall/purchase-lines';

export interface PurchaseFooterProps {
  readonly kind: 'subscription' | 'once';
  readonly phase: PaywallPhase;
  readonly price?: string | undefined;
  readonly period?: 'monthly' | 'yearly' | undefined;
  readonly store: StorePlatform | null;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
  readonly onRestore?: () => void;
  /** Text colour on a dark ground. */
  readonly color?: string;
  readonly testID: string;
}

export function PurchaseFooter(props: PurchaseFooterProps) {
  const { t } = useLingui();
  const phase = usePhaseLine()(props.phase);
  const line = useDisclosureLine()(props);
  const colour = props.color === undefined ? {} : { color: props.color };
  return (
    <View style={{ gap: 6, alignItems: 'center' }} testID={props.testID}>
      {phase === null ? null : (
        <Text
          variant="caption"
          align="center"
          tone="inkSecondary"
          {...colour}
          testID={`${props.testID}-phase`}
        >
          {phase}
        </Text>
      )}
      <Text
        variant="caption"
        tone="muted"
        align="center"
        {...colour}
        testID={`${props.testID}-line`}
      >
        {line}
      </Text>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <TextButton
          label={t({ id: 'monetize.disclosure.terms', message: 'Terms' })}
          onPress={props.onTerms}
          {...colour}
          testID={`${props.testID}-terms`}
        />
        <TextButton
          label={t({ id: 'monetize.disclosure.privacy', message: 'Privacy' })}
          onPress={props.onPrivacy}
          {...colour}
          testID={`${props.testID}-privacy`}
        />
        {props.onRestore === undefined ? null : (
          <TextButton
            label={t({ id: 'monetize.disclosure.restore', message: 'Restore' })}
            onPress={props.onRestore}
            {...colour}
            testID={`${props.testID}-restore`}
          />
        )}
      </View>
    </View>
  );
}
