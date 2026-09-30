/** PASTE's sheet with its send: `import_paste` makes a candidate that is read on the server. */
import { generateUuidV7 } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { importPasteCommand } from '../data/commands';
import { useBookingsServices } from '../data/services';
import { PasteSheet } from '../paste/PasteSheet';

export function PasteFlow({
  tripId,
  onDone,
}: {
  readonly tripId: string | null;
  readonly onDone: () => void;
}) {
  const services = useBookingsServices();
  const paste = useCommand(importPasteCommand);
  const [error, setError] = useState<'offline' | 'failed' | null>(null);
  return (
    <PasteSheet
      sending={paste.pending}
      error={error}
      readClipboard={() => services.readClipboard()}
      onSend={(body) => {
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
      }}
      onClose={onDone}
    />
  );
}
