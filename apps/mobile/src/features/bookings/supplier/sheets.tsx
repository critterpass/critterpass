/**
 * The supplier and getting-around sheets as their routes open them: each reads its own link
 * params (a missing or unknown value falls back, never throws) and sits in one shared frame, so
 * every sheet has the same padding and the routes hold nothing but the params.
 */
import { rideProviderSchema, vendorIntentSchema } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { EstimateSheet } from '../getting-around/EstimateSheet';
import { LogRideSheet } from '../getting-around/LogRideSheet';
import { parseEstimateOption } from '../getting-around/routes';
import { BookingScreen } from './BookingScreen';
import { CancelSheet } from './CancelSheet';
import { VendorDraftScreen, VendorMessagesScreen } from './VendorScreens';

type Params<Key extends string> = Readonly<Partial<Record<Key, string>>>;

const useStyles = makeStyles((t) => ({
  content: { padding: t.space['20'], paddingBottom: t.space['32'] + t.space['16'] },
}));

function SupplierSheet(props: {
  readonly title: string;
  readonly size: 'fit' | 'large';
  /** The sheet holds a field: taps on its buttons land while the keyboard is up. */
  readonly fields?: boolean;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Sheet detents={[props.size]} title={props.title} testID={props.testID}>
      <SheetScrollView
        contentContainerStyle={styles.content}
        {...(props.fields === true ? { keyboardShouldPersistTaps: 'handled' as const } : {})}
      >
        {props.children}
      </SheetScrollView>
    </Sheet>
  );
}

/** Booking a Viator activity in the app: hold, traveller, Viator's payment form, result. */
export function SupplierBookSheet({
  params,
}: {
  readonly params: Params<'tripId' | 'product' | 'title' | 'date' | 'currency' | 'stableId'>;
}) {
  const { t } = useLingui();
  return (
    <SupplierSheet
      size="large"
      fields
      title={t({ id: 'suppliers.book.title', message: 'Book with Viator' })}
      testID="supplier-book-sheet"
    >
      <BookingScreen
        params={{
          tripId: params.tripId ?? '',
          product: params.product ?? '',
          title: params.title ?? '',
          date: params.date ?? '',
          currency: params.currency ?? 'USD',
          stableId: params.stableId,
        }}
      />
    </SupplierSheet>
  );
}

/** Cancelling a Viator booking: Viator's refund quote first, then the cancel. */
export function SupplierCancelSheet({
  params,
}: {
  readonly params: Params<'bookingId' | 'title'>;
}) {
  const { t } = useLingui();
  return (
    <SupplierSheet
      size="fit"
      title={t({ id: 'suppliers.cancel.title', message: 'Cancel with Viator' })}
      testID="supplier-cancel-sheet"
    >
      <CancelSheet bookingId={params.bookingId ?? ''} title={params.title ?? ''} />
    </SupplierSheet>
  );
}

/** A message to a place: the exact text, then the desk sends it or the traveller's WhatsApp does. */
export function VendorDraftSheet({
  params,
}: {
  readonly params: Params<'tripId' | 'vendorKind' | 'vendorId' | 'vendorName' | 'intent' | 'text'>;
}) {
  const { t } = useLingui();
  const intent = vendorIntentSchema.safeParse(params.intent);
  return (
    <SupplierSheet
      size="large"
      fields
      title={t({ id: 'suppliers.vendor.draftTitle', message: 'Message to a place' })}
      testID="vendor-draft-sheet"
    >
      <VendorDraftScreen
        params={{
          tripId: params.tripId ?? '',
          vendorKind: params.vendorKind === 'provider' ? 'provider' : 'poi',
          vendorId: params.vendorId ?? '',
          vendorName: params.vendorName ?? '',
          intent: intent.success ? intent.data : 'other',
          text: params.text ?? '',
        }}
      />
    </SupplierSheet>
  );
}

/** The trip's messages to places: drafts to send, sent and waiting, and the places' replies. */
export function VendorMessagesSheet({ params }: { readonly params: Params<'tripId'> }) {
  const { t } = useLingui();
  return (
    <SupplierSheet
      size="large"
      title={t({ id: 'suppliers.vendor.listTitle', message: 'Messages to places' })}
      testID="vendor-messages-sheet"
    >
      <VendorMessagesScreen tripId={params.tripId ?? ''} />
    </SupplierSheet>
  );
}

/** Why a fare estimate says what it says: basis, sources, when checked, whether reviewed. */
export function EstimateWhySheet({ params }: { readonly params: Params<'option'> }) {
  const { t } = useLingui();
  const theme = useTheme();
  const locale = useLocale();
  const option = parseEstimateOption(params.option);
  return (
    <SupplierSheet
      size="fit"
      title={t({ id: 'suppliers.estimate.title', message: 'Why this estimate' })}
      testID="supplier-estimate-sheet"
    >
      {option === null ? (
        <Text variant="body" color={theme.semantic.text.secondary} testID="supplier-estimate-gone">
          {t({
            id: 'suppliers.estimate.gone',
            message: 'That estimate isn’t on this phone any more. Open the ride again to see it.',
          })}
        </Text>
      ) : (
        <EstimateSheet option={option} locale={locale} />
      )}
    </SupplierSheet>
  );
}

/** LOG IT: the ride on its leg and, with an amount, a split crew expense. */
export function LogRideRouteSheet({
  params,
}: {
  readonly params: Params<'tripId' | 'legRef' | 'provider' | 'currency' | 'quoteId' | 'attendees'>;
}) {
  const { t } = useLingui();
  const provider = rideProviderSchema.safeParse(params.provider);
  return (
    <SupplierSheet
      size="fit"
      fields
      title={t({ id: 'suppliers.log.title', message: 'Log the ride' })}
      testID="supplier-log-ride-sheet"
    >
      <LogRideSheet
        params={{
          tripId: params.tripId ?? '',
          legRef: params.legRef ?? '',
          provider: provider.success ? provider.data : 'taxi',
          currency: params.currency ?? '',
          attendees: (params.attendees ?? '').split(',').filter((id) => id !== ''),
          quoteId: params.quoteId,
        }}
      />
    </SupplierSheet>
  );
}
