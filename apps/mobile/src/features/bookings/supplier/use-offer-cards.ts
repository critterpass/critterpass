/**
 * Builds the offer screen's cards: a partner link card in our own words, or a live Viator product
 * in theirs. Shared by the screen and the lab so both show the same copy in every language.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test ids and wire values. */
import { ALL_PARTNERS_OFF, supplierCopy, type AffiliatePartner } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import type { GuideId } from '@/ui/people/GuideLine';

import { useSupplierCopy } from './copy';
import type { WireOffer } from './data/api';
import type { PartnerLinkOutcome } from './data/partner-link';
import type { OfferCardProps } from './OfferCard';
import { SUPPLIER_NAMES } from './suppliers';

export type Card = OfferCardProps & { readonly key: string };
export type LinkReason = 'off' | 'offline' | 'down';

export interface LinkCardInput {
  readonly partner: AffiliatePartner;
  readonly name: string;
  readonly pending: boolean;
  readonly outcome?: PartnerLinkOutcome | undefined;
  readonly onOpen: () => void;
}

export interface OfferCardInput {
  readonly offer: WireOffer;
  readonly note?:
    { readonly guide: GuideId; readonly name: string; readonly line: string } | undefined;
  readonly onBook: () => void;
}

export function useOfferCards() {
  const { t, i18n } = useLingui();
  const render = useSupplierCopy();

  const linkCard = ({ partner, name, pending, outcome, onOpen }: LinkCardInput): Card => {
    const supplier = SUPPLIER_NAMES[partner];
    const open = render(
      supplierCopy({ action: 'activity_offer', supplier, availability: null }, ALL_PARTNERS_OFF),
    );
    return {
      key: partner,
      supplier,
      title: name,
      verbatim: false,
      lines: [
        t({ id: 'suppliers.offers.linkLine', message: `Times, prices and tickets on ${supplier}` }),
      ],
      primary: {
        label: `${open} ↗`,
        onPress: onOpen,
        loading: pending,
        testID: `supplier-open-${partner}`,
      },
      error:
        outcome === 'unavailable'
          ? t({
              id: 'suppliers.offers.partnerOff',
              message: `${supplier} links aren't available right now.`,
            })
          : outcome === 'failed'
            ? t({ id: 'suppliers.offers.failed', message: "That didn't open. Try again." })
            : null,
      testID: `supplier-offer-${partner}`,
    };
  };

  const offerCard = ({ offer, note, onBook }: OfferCardInput): Card => {
    const time = i18n.date(new Date(offer.seenAt), { hour: '2-digit', minute: '2-digit' });
    const price = offer.priceFrom
      ? i18n.number(offer.priceFrom.amount, {
          style: 'currency',
          currency: offer.priceFrom.currency,
        })
      : null;
    return {
      key: offer.productCode,
      supplier: SUPPLIER_NAMES.viator,
      title: offer.title,
      verbatim: true,
      lines: [
        ...(price ? [t({ id: 'suppliers.offers.priceFrom', message: `From ${price}` })] : []),
        ...(offer.description ? [offer.description] : []),
      ],
      seen: t({ id: 'suppliers.offers.seen', message: `seen ${time} on Viator` }),
      note: note ?? null,
      primary: {
        label: t({ id: 'suppliers.offers.book', message: 'Book' }),
        onPress: onBook,
        testID: `supplier-book-${offer.productCode}`,
      },
      testID: `supplier-offer-viator-${offer.productCode}`,
    };
  };

  const notice = (reason: LinkReason | null): string | null =>
    reason === 'offline'
      ? t({
          id: 'suppliers.offers.offline',
          message: "No signal. Links open, and the supplier's page loads once you're back.",
        })
      : reason === 'down'
        ? t({
            id: 'suppliers.offers.down',
            message: "Viator isn't answering, so these open the supplier's own site.",
          })
        : null;

  return { linkCard, offerCard, notice };
}
