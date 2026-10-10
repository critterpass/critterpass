/**
 * Cancelling a Viator booking (undesigned; sheet + pills): Viator's refund quote first, then the
 * cancel. "Cancelled · full refund" shows only after Viator confirmed the cancel; a booking Viator
 * won't cancel says so and points to their site.
 */
import { ALL_PARTNERS_OFF, supplierCopy, type ActivityCancelQuote } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { price } from '../format';
import { useSupplierCopy } from './copy';
import { deviceSupplierApi, type SupplierApi } from './data/api';
import { useCancelBooking, type CancelState } from './use-cancel-booking';

export type { CancelState } from './use-cancel-booking';

export interface CancelSheetViewProps {
  readonly title: string;
  readonly state: CancelState;
  readonly busy: boolean;
  readonly failed: boolean;
  readonly onCancel: () => void;
  readonly onKeep: () => void;
  readonly onRetry: () => void;
}

export function CancelSheetView({
  title,
  state,
  busy,
  failed,
  onCancel,
  onKeep,
  onRetry,
}: CancelSheetViewProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const render = useSupplierCopy();
  const refund = (quote: ActivityCancelQuote) =>
    quote.refund === null ? null : price(locale, quote.refund.amount_minor, quote.refund.currency);
  return (
    <Stack gap="16" testID={`supplier-cancel-${state.kind}`}>
      <Text variant="rowTitle">{title}</Text>
      {state.kind === 'loading' ? (
        <Skeleton
          preset="lines"
          label={t({ id: 'suppliers.cancel.loading', message: 'Asking Viator what comes back' })}
        />
      ) : null}
      {state.kind === 'error' ? (
        <>
          <Text variant="body">
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
          <PillButton
            label={t({ id: 'suppliers.cancel.retry', message: 'Try again' })}
            onPress={onRetry}
          />
        </>
      ) : null}
      {state.kind === 'quote' && !state.quote.cancellable ? (
        <>
          <Text variant="body">
            {t({
              id: 'suppliers.cancel.notCancellable',
              message: 'Viator says this one can’t be cancelled any more.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'suppliers.cancel.keep', message: 'Keep it' })}
            onPress={onKeep}
          />
        </>
      ) : null}
      {state.kind === 'quote' && state.quote.cancellable ? (
        <>
          <Text variant="h3" testID="supplier-cancel-refund">
            {refund(state.quote) === null
              ? t({ id: 'suppliers.cancel.noRefund', message: 'No refund if you cancel now' })
              : t({
                  id: 'suppliers.cancel.refund',
                  message: `Cancel now and Viator refunds ${refund(state.quote) ?? ''}`,
                })}
          </Text>
          <PillButton
            variant="destructive"
            label={t({ id: 'suppliers.cancel.confirm', message: 'Cancel the booking' })}
            onPress={onCancel}
            loading={busy}
            testID="supplier-cancel-confirm"
          />
          <TextLink
            label={t({ id: 'suppliers.cancel.keepLink', message: 'Keep it' })}
            onPress={onKeep}
          />
          {failed ? (
            <Text variant="caption" color={theme.semantic.state.urgent}>
              {t({
                id: 'suppliers.cancel.failed',
                message: 'Viator didn’t cancel it. The booking still stands.',
              })}
            </Text>
          ) : null}
        </>
      ) : null}
      {state.kind === 'cancelled' ? (
        <>
          <Text variant="h3" testID="supplier-cancel-done">
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
          <PillButton
            label={t({ id: 'suppliers.cancel.done', message: 'Done' })}
            onPress={onKeep}
          />
        </>
      ) : null}
    </Stack>
  );
}

export function CancelSheet({
  bookingId,
  title,
  api = deviceSupplierApi,
}: {
  readonly bookingId: string;
  readonly title: string;
  readonly api?: SupplierApi;
}) {
  const cancel = useCancelBooking(bookingId, api);
  return (
    <CancelSheetView
      title={title}
      state={cancel.state}
      busy={cancel.busy}
      failed={cancel.failed}
      onCancel={cancel.confirm}
      onKeep={() => router.back()}
      onRetry={cancel.retry}
    />
  );
}
