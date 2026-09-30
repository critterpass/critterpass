/**
 * What the wallet needs from outside the local database, provided by the wallet layout (the
 * device implementation) or by the (dev) bookings lab (fixtures): the on-device document scanner,
 * text and barcode reader (null in a build without it), authenticated reads, document uploads and
 * downloads, the clipboard and links.
 */
import { createContext, useContext, type ReactNode } from 'react';

export type HttpOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

/** The on-device reader (the `cp-ocr` module's shape): the scanner, text lines and barcodes. */
export interface DocumentReader {
  scanDocument(options?: {
    readonly pageLimit?: number;
  }): Promise<
    | { readonly status: 'captured'; readonly uris: readonly string[] }
    | { readonly status: 'cancelled' }
  >;
  recognize(imageUri: string): Promise<{
    readonly status: 'ok' | 'unsupported_script' | 'no_text';
    readonly lines: readonly { readonly text: string }[];
  }>;
  scanBarcode(
    imageUri: string,
  ): Promise<readonly { readonly format: 'pdf417' | 'aztec' | 'qr'; readonly value: string }[]>;
}

export interface BookingsServices {
  readonly ocr: DocumentReader | null;
  getJson(path: string): Promise<HttpOutcome<unknown>>;
  /** Uploads a document or photo (purpose `booking_doc`) and answers its media key. */
  uploadDoc(uri: string, contentType: string): Promise<HttpOutcome<string>>;
  /** Saves a signed document URL under the wallet's own folder; answers the local file URI. */
  download(url: string, name: string): Promise<string | null>;
  copy(text: string): Promise<void>;
  /** Android reads the clipboard on the PASTE tap; iOS uses the system paste control instead. */
  readClipboard(): Promise<string>;
  openUrl(url: string): Promise<boolean>;
  now(): number;
}

const offline = () => Promise.resolve({ kind: 'offline' as const });

export const NO_BOOKINGS_SERVICES: BookingsServices = {
  ocr: null,
  getJson: offline,
  uploadDoc: offline,
  download: () => Promise.resolve(null),
  copy: () => Promise.resolve(),
  readClipboard: () => Promise.resolve(''),
  openUrl: () => Promise.resolve(false),
  now: () => Date.now(),
};

const BookingsServicesContext = createContext<BookingsServices>(NO_BOOKINGS_SERVICES);

export function BookingsServicesProvider({
  services,
  children,
}: {
  readonly services: BookingsServices;
  readonly children: ReactNode;
}) {
  return (
    <BookingsServicesContext.Provider value={services}>{children}</BookingsServicesContext.Provider>
  );
}

export function useBookingsServices(): BookingsServices {
  return useContext(BookingsServicesContext);
}
