/**
 * What the money screens need from outside the local database, provided by the route layouts (the
 * device implementation) or by the (dev) money lab (recorded fixtures): the on-device receipt
 * reader (null in a build without it), the photo picker, the receipt upload, and payout details,
 * which are read over HTTPS only and never stored on the device.
 */
import type { PostReceiptBody, RevealedPayoutMethod } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

export type ReaderStatus = 'ok' | 'unsupported_script' | 'no_text';
export type ReaderQualityIssue = 'crumpled' | 'blurry' | 'glare' | 'cut_off';

export interface ReaderLine {
  readonly id: string;
  readonly text: string;
  /** [x, y, w, h], 0 to 1 from the top-left of the upright photo. */
  readonly bbox: readonly [number, number, number, number];
  readonly conf: number;
}

export interface ReaderResult {
  readonly status: ReaderStatus;
  readonly lines: readonly ReaderLine[];
  readonly quality: ReaderQualityIssue | null;
}

/** The on-device receipt reader (the `cp-ocr` module's shape). */
export interface ReceiptReader {
  recognize(
    imageUri: string,
    options?: { readonly languages?: readonly string[] },
  ): Promise<ReaderResult>;
  scanDocument(options?: {
    readonly pageLimit?: number;
  }): Promise<
    | { readonly status: 'captured'; readonly uris: readonly string[] }
    | { readonly status: 'cancelled' }
  >;
}

export type HttpOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export type PickOutcome =
  | { readonly kind: 'picked'; readonly uri: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'denied' }
  /** The picker could not open or hand the photo back (logged on the device). */
  | { readonly kind: 'failed' };

export interface MoneyServices {
  readonly reader: ReceiptReader | null;
  pickPhoto(): Promise<PickOutcome>;
  /** Uploads a receipt photo (purpose `receipt`) and answers its media key. */
  uploadReceiptPhoto(uri: string): Promise<HttpOutcome<string>>;
  postReceipt(body: PostReceiptBody): Promise<HttpOutcome<{ readonly status: string }>>;
  /** The payee's methods for the payer of an open payment (audited on the server). */
  revealPayout(paymentId: string): Promise<HttpOutcome<readonly RevealedPayoutMethod[]>>;
  /** Your own methods, for the editor. */
  myPayoutMethods(): Promise<HttpOutcome<readonly RevealedPayoutMethod[]>>;
  openUrl(url: string): Promise<boolean>;
  copy(text: string): Promise<void>;
}

const offline = () => Promise.resolve({ kind: 'offline' as const });

/** Used where no provider is mounted: nothing reachable, no reader. */
export const NO_MONEY_SERVICES: MoneyServices = {
  reader: null,
  pickPhoto: () => Promise.resolve({ kind: 'cancelled' }),
  uploadReceiptPhoto: offline,
  postReceipt: offline,
  revealPayout: offline,
  myPayoutMethods: offline,
  openUrl: () => Promise.resolve(false),
  copy: () => Promise.resolve(),
};

const MoneyServicesContext = createContext<MoneyServices>(NO_MONEY_SERVICES);

export function MoneyServicesProvider({
  services,
  children,
}: {
  readonly services: MoneyServices;
  readonly children: ReactNode;
}) {
  return <MoneyServicesContext.Provider value={services}>{children}</MoneyServicesContext.Provider>;
}

export function useMoneyServices(): MoneyServices {
  return useContext(MoneyServicesContext);
}
