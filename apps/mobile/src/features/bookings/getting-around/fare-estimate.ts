/**
 * Our own fare range for a ride while Grab's live quote is off: a range, in the local and the
 * crew's currency, with the basis it comes from and its sources. It is optional on
 * `/v1/rides/quote`; without it the card shows no fare at all rather than a guess.
 */
export interface FareRange {
  readonly low_minor: number;
  readonly high_minor: number;
  readonly currency: string;
}

export interface FareSource {
  readonly name: string;
  readonly url?: string | null;
}

export interface FareEstimate extends FareRange {
  /** The same range in the crew's settlement currency, when it differs. */
  readonly crew?: FareRange | null;
  /** Why the range is what it is ("Metered taxi tariff, 12 km, day rate"). */
  readonly basis: string;
  readonly sources: readonly FareSource[];
  readonly checked_at: string;
  /** Checked by a person, not only computed. */
  readonly reviewed: boolean;
}

function isRange(value: unknown): value is FareRange {
  const v = value as Partial<FareRange> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.low_minor === 'number' &&
    typeof v.high_minor === 'number' &&
    typeof v.currency === 'string'
  );
}

/**
 * The quote's fare estimate when it carries one: `fare_estimate`, or an `estimate` that has a
 * basis (Grab's own estimate has none, and is shown as Grab's).
 */
export function readFareEstimate(quote: unknown): FareEstimate | null {
  const body = quote as { fare_estimate?: unknown; estimate?: { basis?: unknown } | null } | null;
  const raw =
    body?.fare_estimate ?? (typeof body?.estimate?.basis === 'string' ? body.estimate : undefined);
  if (!isRange(raw)) return null;
  const v = raw as Partial<FareEstimate> & FareRange;
  if (typeof v.basis !== 'string' || typeof v.checked_at !== 'string') return null;
  const sources = Array.isArray(v.sources)
    ? v.sources.flatMap((s: unknown) =>
        typeof s === 'string'
          ? [{ name: s }]
          : typeof (s as FareSource | null)?.name === 'string'
            ? [s as FareSource]
            : [],
      )
    : [];
  return {
    low_minor: v.low_minor,
    high_minor: v.high_minor,
    currency: v.currency,
    crew: isRange(v.crew) ? v.crew : null,
    basis: v.basis,
    sources,
    checked_at: v.checked_at,
    reviewed: v.reviewed === true,
  };
}
