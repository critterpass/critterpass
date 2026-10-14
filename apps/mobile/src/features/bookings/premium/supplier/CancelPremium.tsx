/**
 * Cancelling a Viator booking, as a premium sheet: Viator's refund quote first, then the pink
 * hold-to-cancel (it can't be undone). "Cancelled · full refund" shows only after Viator confirmed
 * the cancel; a booking Viator won't cancel says so; offline or down says nothing has changed.
 */
import { ALL_PARTNERS_OFF, supplierCopy, type ActivityCancelQuote } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, LoadingCritter, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { HoldToConfirm, SheetScreen } from '@/ui/premium/shell';

import { price } from '../../format';
import { useSupplierCopy } from '../../supplier/copy';
import type { SupplierApi } from '../../supplier/data/api';
import { useCancelBooking } from '../../supplier/use-cancel-booking';
import { ErrorLine } from './SupplierParts';

export function CancelPremium({
  bookingId,
  title,
  api,
}: {
  readonly bookingId: string;
  readonly title: string;
  readonly api?: SupplierApi;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const render = useSupplierCopy();
  const cancel = useCancelBooking(bookingId, api);
  const { state } = cancel;
  const refund = (quote: ActivityCancelQuote) =>
    quote.refund === null ? null : price(locale, quote.refund.amount_minor, quote.refund.currency);
  const keep = () => router.back();
  return (
    <SheetScreen
      title={t({ id: 'suppliers.cancel.title', message: 'Cancel with Viator' })}
      cancelLabel={t({ id: 'suppliers.premium.close', message: 'Close' })}
      testID="supplier-cancel-sheet"
    >
      <View style={[styles.body, { gap: th.space.gap14 }]} testID={`supplier-cancel-${state.kind}`}>
        <Text variant="headline">{title}</Text>
        {state.kind === 'loading' ? (
          <LoadingCritter
            label={t({ id: 'suppliers.cancel.loading', message: 'Asking Viator what comes back' })}
          />
        ) : null}
        {state.kind === 'error' ? (
          <>
            <Text variant="body" tone="inkSecondary">
              {state.offline
                ? t({
                    id: 'suppliers.cancel.offline',
                    message: 'Cancelling needs signal, so Viator can say what you get back.',
                  })
                : t({
                    id: 'suppliers.cancel.down',
                    message: 'Viator isn’t answering right now. Nothing has changed.',
                  })}
            </Text>
            <Button
              label={t({ id: 'suppliers.cancel.retry', message: 'Try again' })}
              variant="secondary"
              onPress={cancel.retry}
            />
          </>
        ) : null}
        {state.kind === 'quote' && !state.quote.cancellable ? (
          <>
            <Text variant="body" tone="inkSecondary">
              {t({
                id: 'suppliers.cancel.notCancellable',
                message: 'Viator says this one can’t be cancelled any more.',
              })}
            </Text>
            <Button label={t({ id: 'suppliers.cancel.keep', message: 'Keep it' })} onPress={keep} />
          </>
        ) : null}
        {state.kind === 'quote' && state.quote.cancellable ? (
          <>
            <Text variant="title" testID="supplier-cancel-refund">
              {refund(state.quote) === null
                ? t({ id: 'suppliers.cancel.noRefund', message: 'No refund if you cancel now' })
                : t({
                    id: 'suppliers.cancel.refund',
                    message: `Cancel now and Viator refunds ${refund(state.quote) ?? ''}`,
                  })}
            </Text>
            <HoldToConfirm
              label={t({
                id: 'suppliers.premium.holdCancel',
                message: 'Hold to cancel the booking',
              })}
              disabled={cancel.busy}
              onConfirm={cancel.confirm}
              fallback={{
                title: t({ id: 'suppliers.cancel.confirm', message: 'Cancel the booking' }),
                message:
                  refund(state.quote) === null
                    ? t({ id: 'suppliers.cancel.noRefund', message: 'No refund if you cancel now' })
                    : t({
                        id: 'suppliers.cancel.refund',
                        message: `Cancel now and Viator refunds ${refund(state.quote) ?? ''}`,
                      }),
                confirm: t({ id: 'suppliers.cancel.confirm', message: 'Cancel the booking' }),
                cancel: t({ id: 'suppliers.cancel.keepLink', message: 'Keep it' }),
              }}
              testID="supplier-cancel-confirm"
            />
            <TextButton
              align="center"
              label={t({ id: 'suppliers.cancel.keepLink', message: 'Keep it' })}
              onPress={keep}
            />
            {cancel.failed ? (
              <ErrorLine
                text={t({
                  id: 'suppliers.cancel.failed',
                  message: 'Viator didn’t cancel it. The booking still stands.',
                })}
              />
            ) : null}
          </>
        ) : null}
        {state.kind === 'cancelled' ? (
          <>
            <Text variant="title" testID="supplier-cancel-done">
              {render(
                supplierCopy(
                  {
                    action: 'dropout',
                    supplier: 'Viator',
                    via: 'api',
                    cancelled: true,
                    refund: {
                      full: state.quote.refund_percentage === 100,
                      amount: refund(state.quote) ?? '',
                    },
                  },
                  ALL_PARTNERS_OFF,
                ),
              )}
            </Text>
            <Button label={t({ id: 'suppliers.cancel.done', message: 'Done' })} onPress={keep} />
          </>
        ) : null}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({ body: { paddingTop: 4, paddingBottom: 32 } });
