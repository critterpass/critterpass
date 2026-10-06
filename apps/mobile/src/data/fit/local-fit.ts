/**
 * A place's fit re-worked on the phone as someone picks a day or a time (7f-1 Add to plan): the
 * same planner fit engine the server runs (`@cp/planner` `fitPlace`), over the context the fit route
 * hands back for one place (`include_context`), so the chips and reasons follow every tap without a
 * round trip and agree with the server's answer for the same choice.
 */
import { AREA_LINK_MODES, type PlaceFit } from '@cp/domain';
import {
  fitPlace,
  layeredTravel,
  legKey,
  straightLineTravel,
  DEFAULT_FIT_THRESHOLDS,
  type FitContext,
  type FitDay,
  type FitItem,
  type FitLeg,
  type FitPlace,
} from '@cp/planner';
import { useMemo } from 'react';

/** An item as the context carries it over the wire: its times as ISO text. */
export type WireFitItem = Omit<FitItem, 'startsAt' | 'endsAt'> & {
  readonly startsAt: string;
  readonly endsAt: string;
};

export type WireFitDay = Omit<FitDay, 'items'> & { readonly items: readonly WireFitItem[] };

/** The fit route's `context`: the server's fit context without its travel function, plus its legs. */
export type WireFitContext = Omit<FitContext, 'travel' | 'days'> & {
  readonly days: readonly WireFitDay[];
  readonly legs: readonly {
    readonly from: string;
    readonly to: string;
    readonly minutes: number;
    readonly mode: string;
    readonly approx: boolean;
  }[];
};

/**
 * The context as the engine takes it: item times back to instants, and travel from the legs the
 * server used, else straight lines with the destination's drive factor (as the server does).
 */
export function fitContextFromWire(wire: WireFitContext): FitContext {
  const known = new Map<string, FitLeg>();
  for (const leg of wire.legs) {
    // A link between two areas (a day trip's train or boat) is known travel too: its minutes
    // count as time not walked, and it is always an estimate.
    const link = (AREA_LINK_MODES as readonly string[]).includes(leg.mode);
    if (leg.mode !== 'walk' && leg.mode !== 'drive' && !link) continue;
    known.set(legKey(leg.from, leg.to), {
      minutes: leg.minutes,
      mode: leg.mode === 'walk' ? 'walk' : 'drive',
      approx: link || leg.approx,
    });
  }
  const walkMaxM = wire.thresholds?.walkMaxM ?? DEFAULT_FIT_THRESHOLDS.walkMaxM;
  const { legs: _legs, days, ...rest } = wire;
  return {
    ...rest,
    days: days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({
        ...item,
        startsAt: new Date(item.startsAt),
        endsAt: new Date(item.endsAt),
      })),
    })),
    travel: layeredTravel(known, straightLineTravel(wire.driveFactor, walkMaxM)),
  };
}

export interface LocalFitChoice {
  /** Judge this start only (a picked day and time); absent re-fits every day. */
  readonly at?: Date | undefined;
}

/** The place's fit for the choice, or null until the context and the place are known. */
export function useLocalFit(
  wire: WireFitContext | null,
  place: FitPlace | null,
  choice: LocalFitChoice = {},
): PlaceFit | null {
  const context = useMemo(() => (wire === null ? null : fitContextFromWire(wire)), [wire]);
  const at = choice.at?.getTime();
  return useMemo(() => {
    if (context === null || place === null) return null;
    return fitPlace(context, place, at === undefined ? {} : { at: new Date(at) });
  }, [at, context, place]);
}
