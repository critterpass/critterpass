/**
 * What the search screens need from outside the local database, behind one seam: api reads and
 * posts with the session attached, the link import stream, and the clipboard. The route provides
 * the device services (./device-search-services.ts); tests and the (dev) lab pass recorded answers.
 */
import type { ImportEvent } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

import type { PlaceApiRead } from '@/data/places/more-places';

import type { ScreenshotRead } from '../screenshot-import';

export type ImportBody =
  { readonly url: string } | { readonly text: string; readonly kind: 'screenshot' };

export interface GuideAsk {
  readonly text: string;
  readonly thread_mode: 'group' | 'private';
  readonly context: { readonly trip_id: string };
}

export interface SearchServices {
  /** `GET` an api path (`/v1/...`). */
  readonly getJson: (path: string) => Promise<PlaceApiRead>;
  /** `POST` a JSON body to an api path. */
  readonly postJson: (path: string, body: unknown) => Promise<PlaceApiRead>;
  /** Streams `POST /v1/trips/{id}/imports`, one event at a time; rejects when it cannot start. */
  readonly streamImport: (
    tripId: string,
    body: ImportBody,
    onEvent: (event: ImportEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  /** The clipboard's text where it can be read without a prompt (Android), else null. */
  readonly readClipboard: () => Promise<string | null>;
  /** Whether the clipboard holds a URL, asked without reading it (iOS shows no paste alert). */
  readonly clipboardHasUrl: () => Promise<boolean>;
  /**
   * Asks the guide a question on a thread (the guide's own turn route), waiting for the whole
   * answer: `answered`, the thread the server already has for this trip (ask again there), or
   * a failure.
   */
  readonly askGuide: (
    threadId: string,
    body: GuideAsk,
    signal: AbortSignal,
  ) => Promise<
    | { readonly kind: 'answered' }
    | { readonly kind: 'thread'; readonly threadId: string }
    | { readonly kind: 'failed' }
  >;
  /** Picks a screenshot and reads its text on the phone. */
  readonly readScreenshot: () => Promise<ScreenshotRead>;
}

const offline = (): Promise<PlaceApiRead> => Promise.resolve({ kind: 'offline' });

/** Before a route provides the device services, every call answers as if offline. */
const unavailable: SearchServices = {
  getJson: offline,
  postJson: offline,
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
  streamImport: () => Promise.reject(new Error('search services unavailable')),
  readClipboard: () => Promise.resolve(null),
  clipboardHasUrl: () => Promise.resolve(false),
  readScreenshot: () => Promise.resolve({ kind: 'unavailable' }),
  askGuide: () => Promise.resolve({ kind: 'failed' }),
};

const SearchServicesContext = createContext<SearchServices>(unavailable);

export function SearchServicesProvider({
  services,
  children,
}: {
  readonly services: SearchServices;
  readonly children: ReactNode;
}) {
  return (
    <SearchServicesContext.Provider value={services}>{children}</SearchServicesContext.Provider>
  );
}

export function useSearchServices(): SearchServices {
  return useContext(SearchServicesContext);
}
