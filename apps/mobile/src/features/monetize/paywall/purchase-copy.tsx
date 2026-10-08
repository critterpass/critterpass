/**
 * The words every purchase surface shares: what is happening with a purchase right now, what a
 * restore found, and the renewal terms the stores require next to a subscription button. None of
 * it names a price of ours: prices are always the store's own strings, passed in.
 */
import type { StorePlatform } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Platform } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { RestoreState } from '../data/use-billing';
import type { PaywallPhase } from './paywall-model';

/** The line under a buy button for the purchase's current state, or null when there is none. */
export function usePhaseLine(): (phase: PaywallPhase) => string | null {
  const { t } = useLingui();
  return (phase) => {
    switch (phase) {
      case 'loading':
        return t({ id: 'monetize.phase.loading', message: 'Getting prices from the store…' });
      case 'unavailable':
        return t({
          id: 'monetize.phase.unavailable',
          message: 'Purchases aren’t available yet. Nothing can be charged from here.',
        });
      case 'offline':
        return t({ id: 'monetize.phase.offline', message: 'You’re offline. Connect to buy.' });
      case 'verifying':
        return t({ id: 'monetize.phase.verifying', message: 'Paid. Finishing up…' });
      case 'pending':
        return t({
          id: 'monetize.phase.pending',
          message:
            'Waiting for approval. We’ll finish this when it clears; you can close this page.',
        });
      case 'background':
        return t({
          id: 'monetize.phase.background',
          message: 'Paid. We’re finishing in the background and it turns on by itself.',
        });
      case 'failed':
        return t({
          id: 'monetize.phase.failed',
          message: 'The store didn’t take the payment. Nothing was charged.',
        });
      case 'verify_failed':
        return t({
          id: 'monetize.phase.verifyFailed',
          message: 'You’ve paid, but we couldn’t confirm it yet. There is nothing more to pay.',
        });
      case 'ready':
      case 'purchasing':
      case 'subscribed':
        return null;
    }
  };
}

/** What a restore found, or null before one has run. */
export function useRestoreLine(): (state: RestoreState) => string | null {
  const { t } = useLingui();
  return (state) => {
    if (state.status === 'idle') return null;
    if (state.status === 'restoring') {
      return t({ id: 'monetize.restore.busy', message: 'Checking your purchases…' });
    }
    const { result } = state;
    if (result.kind === 'restored') {
      return result.passPlus
        ? t({ id: 'monetize.restore.passPlus', message: 'Found Pass+. It’s back on.' })
        : t({ id: 'monetize.restore.found', message: 'Your purchases are back.' });
    }
    if (result.kind === 'nothing') {
      return t({
        id: 'monetize.restore.nothing',
        message: 'Nothing to restore on this store account.',
      });
    }
    if (result.kind === 'other_account' || result.code === 'OWNED_BY_OTHER_ACCOUNT') {
      return t({
        id: 'monetize.restore.otherAccount',
        message:
          'These purchases belong to another CritterPass account. Sign in to that account to use them.',
      });
    }
    return t({
      id: 'monetize.restore.failed',
      message: 'We couldn’t check your purchases. Try again.',
    });
  };
}

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
  const { price } = props;
  // With no store answering yet, the phone itself says which one it would be.
  const store = props.store ?? (Platform.OS === 'android' ? 'play' : null);
  const where =
    store === 'play'
      ? t({ id: 'monetize.disclosure.play', message: 'Google Play' })
      : t({ id: 'monetize.disclosure.appStore', message: 'the App Store' });
  const line =
    props.kind === 'once'
      ? t({
          id: 'monetize.disclosure.once',
          message: 'A boost is one trip, paid once. It doesn’t renew.',
        })
      : price === undefined
        ? t({
            id: 'monetize.disclosure.renews',
            message: `Pass+ renews automatically until you cancel. Manage or cancel any time in ${where}.`,
          })
        : props.period === 'monthly'
          ? t({
              id: 'monetize.disclosure.monthly',
              message: `${price} a month. Renews automatically every month until you cancel. Manage or cancel any time in ${where}.`,
            })
          : t({
              id: 'monetize.disclosure.yearly',
              message: `${price} a year. Renews automatically every year until you cancel. Manage or cancel any time in ${where}.`,
            });
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
