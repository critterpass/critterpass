/**
 * What a problem report's screenshot may show. Screens that hold money, messages, travel
 * documents or where people are get covered whole before the picture is taken; anywhere else only
 * the parts wrapped in `PrivateContent` are covered. The cover is drawn in the app for the moment
 * of the capture, so the picture never holds what it hides.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and modes, never copy. */

/** `screen` covers everything, `parts` only `PrivateContent`. */
export type MaskMode = 'screen' | 'parts';

/** Wallet and money, crew chat, the pass and its documents, and the maps people share. */
export const PRIVATE_ROUTE_PREFIXES: readonly string[] = [
  '/wallet',
  '/money',
  '/pass',
  '/crew',
  '/map',
  '/help',
  '/sos',
];

export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function maskModeFor(pathname: string): MaskMode {
  return isPrivateRoute(pathname) ? 'screen' : 'parts';
}

type Listener = () => void;
let masking: MaskMode | null = null;
const listeners = new Set<Listener>();

/** The mask in force right now; `null` outside a capture. */
export const maskStore = {
  get: (): MaskMode | null => masking,
  set: (next: MaskMode | null): void => {
    if (masking === next) return;
    masking = next;
    for (const listener of listeners) listener();
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
