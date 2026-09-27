/**
 * What the headless command and status hooks read from: the open database, its upload queue, the
 * command client and connectivity. The app root provides it once `startLocalFirst` resolves.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { createContext, useContext } from 'react';

import type { CommandClient } from '../commands/client';
import type { NetworkSource } from '../status/network';
import type { UploadQueue } from './upload-queue';

export interface LocalFirstContextValue {
  readonly db: AbstractPowerSyncDatabase;
  readonly queue: UploadQueue;
  readonly commands: CommandClient;
  readonly network: NetworkSource;
}

export const LocalFirstContext = createContext<LocalFirstContextValue | null>(null);

export const LocalFirstProvider = LocalFirstContext.Provider;

export function useLocalFirst(): LocalFirstContextValue {
  const value = useContext(LocalFirstContext);
  if (value === null) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
    throw new Error('useLocalFirst needs a LocalFirstProvider above it');
  }
  return value;
}
