/**
 * Booking a Viator activity in the app, as a premium sheet (built from the 7.x wallet forms): how
 * many go on the stepper, Check with Viator, the lead traveller's fields, Viator's own payment
 * form, then the result. Every status line comes from the copy rules, so "held" shows only while
 * Viator reports a hold and "Booked" only once Viator confirmed it. Typed details ask before the
 * sheet goes.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { WebView } from '@expo/dom-webview';

import {
  Button,
  Stepper,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
  type TextFieldProps,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { detailsComplete, type TravellerDetails } from '../../supplier/booking-flow-model';
import type { SupplierApi } from '../../supplier/data/api';
import { parsePaymentMessage } from '../../supplier/payment-page';
import { useBookingFlow, type BookParams } from '../../supplier/use-booking-flow';
import { ErrorLine, HoldChip } from './SupplierParts';

const MAX_TRAVELLERS = 6;

export function BookFlowPremium({
  params,
  api,
}: {
  readonly params: BookParams;
  readonly api?: SupplierApi;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const flow = useBookingFlow(params, api);
  const { step, details } = flow;
  const set = (patch: Partial<TravellerDetails>) => flow.onDetails({ ...details, ...patch });
  const typed = [details.first, details.last, details.phone, details.email].some(
    (value) => value.trim() !== '',
  );
  const field = (
    key: keyof TravellerDetails,
    label: string,
    extra: Partial<TextFieldProps> = {},
  ) => (
    <TextField
      accessibilityLabel={label}
      placeholder={label}
      value={details[key]}
      onChangeText={(value) => set({ [key]: value })}
      testID={`supplier-book-${key}`}
      {...extra}
    />
  );
  return (
    <SheetScreen
      title={t({ id: 'suppliers.book.title', message: 'Book with Viator' })}
      cancelLabel={t({ id: 'suppliers.premium.cancel', message: 'Cancel' })}
      dirty={(step === 'details' || step === 'paying') && typed}
      discardPrompt={{
        title: t({ id: 'suppliers.premium.discardTitle', message: 'Leave this booking?' }),
        message: t({
          id: 'suppliers.premium.discardLine',
          message: 'The traveller details you typed go, and Viator lets the hold run out.',
        }),
        discard: t({ id: 'suppliers.premium.discard', message: 'Leave' }),
        keep: t({ id: 'suppliers.premium.keep', message: 'Keep booking' }),
      }}
      testID="supplier-book-sheet"
    >
      <View style={[styles.body, { gap: th.space.gap14 }]} testID={`supplier-book-${step}`}>
        <View style={{ gap: th.space.gap4 }}>
          <Text variant="headline">{flow.title}</Text>
          <Text variant="rowText" tone="muted">
            {flow.dateLabel}
          </Text>
        </View>
        {flow.holdLine || flow.holdUntil ? (
          <View style={[styles.wrap, { gap: th.space.gap8 }]}>
            {flow.holdLine ? (
              <Text variant="rowTextStrong" testID="supplier-book-hold-line" style={styles.shrink}>
                {flow.holdLine}
              </Text>
            ) : null}
            {flow.holdUntil ? (
              <HoldChip until={flow.holdUntil} onExpired={flow.onHoldExpired} />
            ) : null}
          </View>
        ) : null}
        {step === 'choose' ? (
          <>
            <View style={styles.row}>
              <Text variant="rowTitle" style={styles.shrink}>
                {t({ id: 'suppliers.book.howMany', message: 'How many are going' })}
              </Text>
              <Stepper
                value={flow.travellers}
                onChange={flow.onTravellers}
                min={1}
                max={MAX_TRAVELLERS}
                accessibilityLabel={t({
                  id: 'suppliers.book.howMany',
                  message: 'How many are going',
                })}
                testID="supplier-book-travellers"
              />
            </View>
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'suppliers.book.holdNote',
                message:
                  'Viator holds the seats when it can. If it can’t, you can still book straight away.',
              })}
            </Text>
            <Button
              label={t({ id: 'suppliers.book.check', message: 'Check with Viator' })}
              loading={flow.busy}
              onPress={flow.onHold}
              testID="supplier-book-check"
            />
          </>
        ) : null}
        {step === 'details' ? (
          <>
            <Text variant="badge" tone="muted">
              {t({ id: 'suppliers.book.lead', message: 'LEAD TRAVELLER' })}
            </Text>
            {field('first', t({ id: 'suppliers.book.first', message: 'First name' }), {
              autoComplete: 'given-name',
            })}
            {field('last', t({ id: 'suppliers.book.last', message: 'Last name' }), {
              autoComplete: 'family-name',
            })}
            {field('phone', t({ id: 'suppliers.book.phone', message: 'Phone' }), {
              keyboardType: 'phone-pad',
              autoComplete: 'tel',
            })}
            {field('email', t({ id: 'suppliers.book.email', message: 'Email (optional)' }), {
              keyboardType: 'email-address',
              autoCapitalize: 'none',
            })}
            <Button
              label={t({ id: 'suppliers.book.pay', message: 'Pay with Viator' })}
              loading={flow.busy}
              disabled={!detailsComplete(details)}
              onPress={flow.onPay}
              testID="supplier-book-pay"
            />
            <TextButton
              align="center"
              label={t({ id: 'suppliers.book.release', message: 'Let it go' })}
              onPress={flow.onRelease}
              testID="supplier-book-release"
            />
          </>
        ) : null}
        {step === 'paying' && flow.payUrl !== null ? (
          <View style={{ gap: th.space.gap8 }} testID="supplier-payment">
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'suppliers.pay.note',
                message: "Viator's own payment form. Your card goes to Viator, never to us.",
              })}
            </Text>
            <View
              style={[
                styles.frame,
                { borderRadius: th.radius.card, backgroundColor: th.color.card },
              ]}
            >
              <WebView
                source={{ uri: flow.payUrl }}
                style={styles.flex}
                onMessage={(event) => flow.onPaid(parsePaymentMessage(event.nativeEvent.data))}
              />
            </View>
          </View>
        ) : null}
        {step === 'pending_operator' || step === 'confirmed' || step === 'rejected' ? (
          <>
            <Text variant="title" testID="supplier-book-result">
              {flow.resultLine ?? ''}
            </Text>
            <Text variant="body" tone="inkSecondary">
              {step === 'confirmed'
                ? t({
                    id: 'suppliers.book.inWallet',
                    message:
                      'The voucher is in your wallet, and the cost is in the crew’s expenses.',
                  })
                : step === 'pending_operator'
                  ? t({
                      id: 'suppliers.book.operatorNote',
                      message:
                        'The operator confirms most bookings within a day. I’ll tell you when they do.',
                    })
                  : t({
                      id: 'suppliers.book.rejectedNote',
                      message:
                        'Viator couldn’t book it and nothing was charged. Try another time or day.',
                    })}
            </Text>
            <Button
              label={t({ id: 'suppliers.book.done', message: 'Done' })}
              onPress={flow.onDone}
              testID="supplier-book-done"
            />
          </>
        ) : null}
        {step === 'hold_expired' ? (
          <>
            <Text variant="title">
              {t({ id: 'suppliers.book.expired', message: 'The hold ran out — check again' })}
            </Text>
            <Button
              label={t({ id: 'suppliers.book.checkAgain', message: 'Check again' })}
              loading={flow.busy}
              onPress={flow.onHold}
              testID="supplier-book-check-again"
            />
          </>
        ) : null}
        {step === 'unavailable' ? (
          <>
            <Text variant="body">
              {t({
                id: 'suppliers.book.unavailable',
                message:
                  'Viator isn’t taking bookings in the app right now. You can still book it on their site.',
              })}
            </Text>
            <Button
              label={t({ id: 'suppliers.book.openViator', message: 'Open Viator ↗' })}
              variant="secondary"
              loading={flow.busy}
              onPress={flow.onOpenLink}
              testID="supplier-book-open-link"
            />
          </>
        ) : null}
        {flow.error ? <ErrorLine text={flow.error} testID="supplier-book-error" /> : null}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 32 },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1 },
  flex: { flex: 1 },
  frame: { height: 520, overflow: 'hidden' },
});
