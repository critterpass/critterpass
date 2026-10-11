/** PASTE's send for any sheet: `import_paste` makes a candidate that is read on the server. */
import { generateUuidV7 } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { importPasteCommand } from '../data/commands';
import { useBookingsServices } from '../data/services';
import type { PasteBody } from '../paste/paste-kind';

export type PasteError = 'offline' | 'failed';

export function usePasteImport(tripId: string | null, onDone: () => void) {
  const services = useBookingsServices();
  const paste = useCommand(importPasteCommand);
  const [error, setError] = useState<PasteError | null>(null);
  return {
    sending: paste.pending,
    error,
    readClipboard: () => services.readClipboard(),
    send: (body: PasteBody) => {
      setError(null);
      void paste
        .send({
          candidate_id: generateUuidV7(),
          ...(tripId === null ? {} : { trip_id: tripId }),
          ...body,
        })
        .then((result) => {
          if (result.kind === 'unavailable') setError('offline');
          else if (result.kind === 'rejected') setError('failed');
          else onDone();
        });
    },
  };
}
