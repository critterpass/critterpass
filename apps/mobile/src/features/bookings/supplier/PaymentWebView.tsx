/**
 * Viator's hosted payment form (Viator is the merchant of record; card data and 3DS stay inside
 * their iframe). The form is embedded by our payment page on this build's web host, the hosting
 * URL Viator knows for the cart, and the page reports back with
 * `window.ReactNativeWebView.postMessage(JSON.stringify({status, payment_session_ref?}))`:
 * `paid` carries the token `book_activity` needs; `failed` and `cancelled` leave the hold as it is.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URL paths and wire values. */
import { WebView } from '@expo/dom-webview';
import { LINK_ENVIRONMENT_CONFIG, type LinkEnvironment } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export type PaymentResult =
  | { readonly status: 'paid'; readonly paymentSessionRef: string }
  | { readonly status: 'failed' }
  | { readonly status: 'cancelled' };

export function paymentPageUrl(env: LinkEnvironment, holdId: string, sessionToken: string): string {
  const params = new URLSearchParams({ hold: holdId, session: sessionToken });
  return `https://${LINK_ENVIRONMENT_CONFIG[env].primaryHost}/pay/viator?${params}`;
}

/** Reads the payment page's message; anything unexpected counts as a failed payment. */
export function parsePaymentMessage(data: string): PaymentResult {
  try {
    const message = JSON.parse(data) as { status?: unknown; payment_session_ref?: unknown };
    if (
      message.status === 'paid' &&
      typeof message.payment_session_ref === 'string' &&
      message.payment_session_ref !== ''
    ) {
      return { status: 'paid', paymentSessionRef: message.payment_session_ref };
    }
    if (message.status === 'cancelled') return { status: 'cancelled' };
  } catch {
    // fall through
  }
  return { status: 'failed' };
}

const useStyles = makeStyles((t) => ({
  frame: {
    height: 520,
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    backgroundColor: t.color.paper.base,
  },
}));

export interface PaymentWebViewProps {
  readonly url: string;
  readonly onResult: (result: PaymentResult) => void;
}

export function PaymentWebView({ url, onResult }: PaymentWebViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: theme.space['8'] }} testID="supplier-payment">
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {t({
          id: 'suppliers.pay.note',
          message: "Viator's own payment form. Your card goes to Viator, never to us.",
        })}
      </Text>
      <View style={styles.frame}>
        <WebView
          source={{ uri: url }}
          style={{ flex: 1 }}
          onMessage={(event) => onResult(parsePaymentMessage(event.nativeEvent.data))}
        />
      </View>
    </View>
  );
}
