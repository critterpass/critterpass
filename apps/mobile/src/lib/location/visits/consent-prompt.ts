/**
 * When the visit consent sheet rises by itself: on a trip day, while the traveller has not
 * decided, at a calm moment on the trip's own screen, and once. "Not now" is remembered on the
 * device for good; after it the sheet only opens when the traveller asks for it (the trip
 * screen's row, or the Settings toggle). It never rises on any other screen, over a ceremony,
 * over another sheet, or while the traveller is typing.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

/**
 * How long a trip screen must rest in front before the sheet may rise. Longer than the arrival
 * hatch's own wait on the same screens, so the ceremony always goes first.
 */
export const VISIT_CONSENT_CALM_MS = 4000;

const TRIP_SURFACES = [/^\/trips$/u, /^\/trips\/[^/]+$/u];

/**
 * The trip's own screen with no other route over it: the trips tab root (the one trip's hub, or
 * the switcher when there are several) and a trip's hub. Nothing else counts: not Home's other
 * tabs, the wallet, a day-of screen with its pack list field, or any modal route.
 */
export function isTripSurfacePath(pathname: string): boolean {
  return TRIP_SURFACES.some((pattern) => pattern.test(pathname));
}

export interface VisitConsentAskInput {
  readonly tripDaySessionRunning: boolean;
  /** Any consent row for the purpose exists (granted or refused). */
  readonly decided: boolean;
  /** "Not now" was answered on this device before. */
  readonly dismissed: boolean;
  /** The app has rested in front on the trip's own screen (see `isTripSurfacePath`). */
  readonly restedOnTripSurface: boolean;
  /** Right now a sheet or rise is up, a text field has focus or the keyboard is showing. */
  readonly busy: boolean;
}

/** The gate: every condition must hold at the moment the sheet would rise. */
export function shouldAskVisitConsent(input: VisitConsentAskInput): boolean {
  return (
    input.tripDaySessionRunning &&
    !input.decided &&
    !input.dismissed &&
    input.restedOnTripSurface &&
    !input.busy
  );
}

/** The trip screen's "turn it on" row is offered: a trip day, undecided, after "Not now". */
export function shouldOfferVisitConsent(input: {
  readonly tripDaySessionRunning: boolean;
  readonly decided: boolean;
  readonly dismissed: boolean;
}): boolean {
  return input.tripDaySessionRunning && !input.decided && input.dismissed;
}

const KEY = 'visit-consent-dismissed-at';
let storage: ReturnType<typeof createMMKV> | null = null;
const prefs = () => (storage ??= createMMKV({ id: 'cp-location-prefs' }));

export function visitConsentDismissedAt(): number | null {
  const value = prefs().getNumber(KEY);
  return value === undefined ? null : value;
}

export function markVisitConsentDismissed(at: number): void {
  prefs().set(KEY, at);
}

/** What the host and the trip screen's row share: the row is offered, the sheet was asked for. */
interface ConsentEntry {
  readonly offered: boolean;
  readonly requested: boolean;
}

let entry: ConsentEntry = { offered: false, requested: false };
const listeners = new Set<() => void>();

function setEntry(next: Partial<ConsentEntry>): void {
  const merged = { ...entry, ...next };
  if (merged.offered === entry.offered && merged.requested === entry.requested) return;
  entry = merged;
  for (const listener of listeners) listener();
}

function useEntry(): ConsentEntry {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entry,
  );
}

/** The host says whether the row has anything to offer right now. */
export function setVisitConsentOffered(offered: boolean): void {
  setEntry({ offered });
}

/** The traveller asked for the sheet (the row's action); the host opens it and clears this. */
export function requestVisitConsent(): void {
  setEntry({ requested: true });
}

export function clearVisitConsentRequest(): void {
  setEntry({ requested: false });
}

export function useVisitConsentRequested(): boolean {
  return useEntry().requested;
}

/** For the trip screen: whether to show the "turn it on" row, and what its action does. */
export function useVisitConsentEntry(): { readonly offered: boolean; readonly open: () => void } {
  return { offered: useEntry().offered, open: requestVisitConsent };
}
