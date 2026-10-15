/**
 * The premium supplier and getting-around sheets as their routes open them: each reads its own
 * link params (a missing or unknown value falls back, never throws), the same way the legacy
 * sheets do, and hands them to its premium sheet content.
 */
import { rideProviderSchema, vendorIntentSchema } from '@cp/domain';

import { BookFlowPremium } from './BookFlowPremium';
import { CancelPremium } from './CancelPremium';
import { EstimatePremium } from './EstimatePremium';
import { LogRidePremium } from './LogRidePremium';
import { OffersPremium } from './OffersPremium';
import { VendorDraftPremium } from './VendorDraftPremium';
import { VendorMessagesPremium } from './VendorMessagesPremium';

type Params<Key extends string> = Readonly<Partial<Record<Key, string>>>;

export function SupplierBookPremium({
  params,
}: {
  readonly params: Params<'tripId' | 'product' | 'title' | 'date' | 'currency' | 'stableId'>;
}) {
  return (
    <BookFlowPremium
      params={{
        tripId: params.tripId ?? '',
        product: params.product ?? '',
        title: params.title ?? '',
        date: params.date ?? '',
        currency: params.currency ?? 'USD',
        stableId: params.stableId,
      }}
    />
  );
}

export function SupplierCancelPremium({
  params,
}: {
  readonly params: Params<'bookingId' | 'title'>;
}) {
  return <CancelPremium bookingId={params.bookingId ?? ''} title={params.title ?? ''} />;
}

export function VendorDraftSheetPremium({
  params,
}: {
  readonly params: Params<'tripId' | 'vendorKind' | 'vendorId' | 'vendorName' | 'intent' | 'text'>;
}) {
  const intent = vendorIntentSchema.safeParse(params.intent);
  return (
    <VendorDraftPremium
      params={{
        tripId: params.tripId ?? '',
        vendorKind: params.vendorKind === 'provider' ? 'provider' : 'poi',
        vendorId: params.vendorId ?? '',
        vendorName: params.vendorName ?? '',
        intent: intent.success ? intent.data : 'other',
        text: params.text ?? '',
      }}
    />
  );
}

export function VendorMessagesSheetPremium({ params }: { readonly params: Params<'tripId'> }) {
  return <VendorMessagesPremium tripId={params.tripId ?? ''} />;
}

export function EstimateWhySheetPremium({ params }: { readonly params: Params<'option'> }) {
  return <EstimatePremium raw={params.option} />;
}

export function LogRideSheetPremium({
  params,
}: {
  readonly params: Params<'tripId' | 'legRef' | 'provider' | 'currency' | 'quoteId' | 'attendees'>;
}) {
  const provider = rideProviderSchema.safeParse(params.provider);
  return (
    <LogRidePremium
      params={{
        tripId: params.tripId ?? '',
        legRef: params.legRef ?? '',
        provider: provider.success ? provider.data : 'taxi',
        currency: params.currency ?? '',
        attendees: (params.attendees ?? '').split(',').filter((id) => id !== ''),
        quoteId: params.quoteId,
      }}
    />
  );
}

export function SupplierOffersPremium({
  params,
}: {
  readonly params: Params<'tripId' | 'name' | 'date' | 'destinationRef' | 'currency' | 'stableId'>;
}) {
  return (
    <OffersPremium
      params={{
        tripId: params.tripId ?? '',
        name: params.name ?? '',
        date: params.date,
        destinationRef: params.destinationRef,
        currency: params.currency,
        stableId: params.stableId,
      }}
    />
  );
}
