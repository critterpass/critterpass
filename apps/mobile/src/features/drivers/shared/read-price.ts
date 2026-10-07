/**
 * A shortlisted driver's price as he wrote it. The shortlist keeps one confirmed figure; whether
 * that figure is a rate, a floor or the low end of a range, the other prices he gave, and his own
 * words when no figure could be quoted, are read from the message the card came from.
 */
import type { DriverCard, IntakeItem } from '@cp/domain';

/** The card read from the message this driver was shortlisted from; null without one. */
export function readCardFor(intake: readonly IntakeItem[], providerId: string): DriverCard | null {
  return intake.find((item) => item.provider_id === providerId)?.parsed?.card ?? null;
}

export function withReadPrice(card: DriverCard, read: DriverCard | null): DriverCard {
  if (read === null) return card;
  const tiers = read.price_tiers;
  const listed = tiers === undefined || tiers.length === 0 ? {} : { price_tiers: tiers };
  if (card.price_minor === null) {
    const ask = read.price_ask ?? null;
    return { ...card, ...listed, ...(ask === null ? {} : { price_ask: ask }) };
  }
  // A figure the traveller typed over his is a plain price: his range and floor go with his figure.
  const asRead = read.price_minor === card.price_minor && read.currency === card.currency;
  const per = read.price_minor === null ? null : (read.price_per ?? null);
  const max = asRead ? (read.price_max_minor ?? null) : null;
  return {
    ...card,
    ...listed,
    ...(per === null ? {} : { price_per: per }),
    ...(max === null ? {} : { price_max_minor: max }),
    ...(asRead && read.price_from === true ? { price_from: true } : {}),
  };
}
