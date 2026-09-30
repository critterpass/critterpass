/**
 * What the day bundle needs from outside the local database: authenticated reads, file downloads
 * into the app's own `trip-days/` folder, file checks and removal, and free space. The device
 * implementation lives in `device-services.ts`; the (dev) lab and tests pass their own.
 */
import { createContext, useContext, type ReactNode } from 'react';

export type HttpOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export interface TripDayServices {
  getJson(path: string): Promise<HttpOutcome<unknown>>;
  /** Saves `url` as `name` under `trip-days/<folder>/`; answers the file URI, or null on failure. */
  download(url: string, folder: string, name: string): Promise<string | null>;
  exists(uri: string): boolean;
  /** Deletes `trip-days/<folder>/` and everything in it. */
  removeFolder(folder: string): void;
  /** Bytes used under `trip-days/<folder>/`. */
  folderBytes(folder: string): number;
  /** Free space on the device, or null when the OS won't say. */
  freeBytes(): number | null;
  now(): number;
}

const offline = () => Promise.resolve({ kind: 'offline' as const });

export const NO_TRIP_DAY_SERVICES: TripDayServices = {
  getJson: offline,
  download: () => Promise.resolve(null),
  exists: () => false,
  removeFolder: () => undefined,
  folderBytes: () => 0,
  freeBytes: () => null,
  now: () => Date.now(),
};

const Context = createContext<TripDayServices>(NO_TRIP_DAY_SERVICES);

export function TripDayServicesProvider({
  services,
  children,
}: {
  readonly services: TripDayServices;
  readonly children: ReactNode;
}) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}

export function useTripDayServices(): TripDayServices {
  return useContext(Context);
}
