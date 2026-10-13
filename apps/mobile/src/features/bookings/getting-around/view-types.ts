import type { FareRow } from './fare-rows';
import type { TransferBooking } from './model';
import type { GuideId } from '@/ui/people/GuideLine';
import type { ReactNode } from 'react';

export interface GettingAroundViewProps {
  readonly status: 'loading' | 'no_trip' | 'no_place' | 'ready';
  /** "AIRPORT → VILLA · 1H 05M". */
  readonly header: string | null;
  readonly map: Omit<RouteMapProps, 'height'> | null;
  readonly transfer: TransferCardProps | null;
  readonly ride: GrabEstimateCardProps | null;
  readonly journey: JourneyProgressProps | null;
  readonly phrase: {
    readonly phrase: string;
    readonly lang: string;
    readonly gloss: string;
    readonly eyebrow: string;
  } | null;
  readonly later: readonly (LaterTodayRowProps & { readonly key: string })[];
  readonly note?: string | null;
  /** The driver set on today, at the top (the ride-back card, `features/drivers/offline`). */
  readonly top?: ReactNode;
  readonly guide: { readonly id: GuideId; readonly name: string };
  readonly onBack?: () => void;
}

export interface LaterTodayRowProps {
  readonly from: string;
  readonly to: string;
  readonly detail: string | null;
  /** "Open Grab", or null where no ride app runs. */
  readonly openLabel: string | null;
  /** The ride app's link is being fetched. */
  readonly opening?: boolean | undefined;
  readonly onOpen: () => void;
  readonly onLog: () => void;
  readonly testID?: string;
}

export interface JourneyProgressProps {
  /** Driving minutes for the leg; without them there is nothing to estimate. */
  readonly minutes: number | null;
  readonly startedAt: number | null;
  readonly onStart: () => void;
  readonly onLog: () => void;
  readonly now?: () => number;
}

export interface RideAppButton {
  readonly key: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface GrabEstimateCardProps {
  readonly state: 'loading' | 'estimate' | 'links' | 'none' | 'offline';
  /** "Grab estimates Rp 90.000–120.000, about 4 min away", or "Call a car" for links. */
  readonly title: string;
  readonly detail?: string | null;
  /** Our tariff estimate per ride class, when Grab gave none. */
  readonly fares?: readonly FareRow[];
  readonly apps: readonly RideAppButton[];
  readonly testID?: string;
}

export interface TransferCardProps {
  readonly transfer: TransferBooking;
  /** The copy-rule line: "Airport pickup booked on Klook (from your email) · …". */
  readonly line: string;
  readonly when: string | null;
  readonly onOpen: () => void;
}

export interface LngLatPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface RouteMapProps {
  readonly from: LngLatPoint | null;
  readonly to: LngLatPoint & { readonly label: string };
  readonly destinationSlug: string | null;
  /** 0–1 along the line while an estimated journey runs; null before and after. */
  readonly carShare: number | null;
  readonly height: number;
  /** What sits over the map's top edge (status bar and the screen's title row), in points. */
  readonly topCover?: number | undefined;
}
