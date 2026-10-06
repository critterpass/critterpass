/**
 * Stay mix for a budget target ("2 ryokan nights in Gion, 5 in an apartment"): the richest
 * combination of the cheapest stay type plus nights of one upgrade type that fits the allowance.
 * Deterministic: equal-cost candidates go to the type key that sorts first, then more upgrade
 * nights; nothing here is left to a model.
 */
export interface StayRate {
  readonly type: string;
  /** Per person per night, trip currency minor units. */
  readonly nightlyPpMinor: bigint;
}

export interface StayMixPart {
  readonly type: string;
  readonly nights: number;
  /** The stop (its position) the nights are spent at, on a trip with several stops. */
  readonly stop?: number;
}

export interface StayMix {
  readonly parts: readonly StayMixPart[];
  readonly costMinor: bigint;
  /** False when even the all-cheapest mix is over the allowance. */
  readonly fits: boolean;
}

interface Candidate {
  readonly upgrade: StayRate | null;
  readonly upgradeNights: number;
  readonly costMinor: bigint;
}

/** Cheapest first; equal rates go to the type key that sorts first. */
export function sortStayRates(rates: readonly StayRate[]): StayRate[] {
  return [...rates].sort((a, b) =>
    a.nightlyPpMinor === b.nightlyPpMinor
      ? a.type < b.type
        ? -1
        : 1
      : a.nightlyPpMinor < b.nightlyPpMinor
        ? -1
        : 1,
  );
}

export function chooseStayMix(
  rates: readonly StayRate[],
  nights: number,
  allowanceMinor: bigint,
): StayMix | null {
  if (rates.length === 0 || nights <= 0) return null;
  const sorted = sortStayRates(rates);
  const cheapest = sorted[0] as StayRate;
  const allCheapest: Candidate = {
    upgrade: null,
    upgradeNights: 0,
    costMinor: cheapest.nightlyPpMinor * BigInt(nights),
  };
  const candidates: Candidate[] = [allCheapest];
  for (const upgrade of sorted.slice(1)) {
    for (let k = 1; k <= nights; k += 1) {
      candidates.push({
        upgrade,
        upgradeNights: k,
        costMinor:
          upgrade.nightlyPpMinor * BigInt(k) + cheapest.nightlyPpMinor * BigInt(nights - k),
      });
    }
  }
  const fitting = candidates
    .filter((c) => c.costMinor <= allowanceMinor)
    .sort((a, b) => {
      if (a.costMinor !== b.costMinor) return a.costMinor > b.costMinor ? -1 : 1;
      const typeA = a.upgrade?.type ?? '';
      const typeB = b.upgrade?.type ?? '';
      if (typeA !== typeB) return typeA < typeB ? -1 : 1;
      return b.upgradeNights - a.upgradeNights;
    });
  const chosen = fitting[0] ?? allCheapest;
  const parts: StayMixPart[] = [];
  if (chosen.upgrade && chosen.upgradeNights > 0) {
    parts.push({ type: chosen.upgrade.type, nights: chosen.upgradeNights });
  }
  if (nights - chosen.upgradeNights > 0) {
    parts.push({ type: cheapest.type, nights: nights - chosen.upgradeNights });
  }
  return { parts, costMinor: chosen.costMinor, fits: fitting.length > 0 };
}
