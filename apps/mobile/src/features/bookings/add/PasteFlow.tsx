/** PASTE's sheet with its send: `import_paste` makes a candidate that is read on the server. */
import { PasteSheet } from '../paste/PasteSheet';
import { usePasteImport } from './use-paste-import';

export function PasteFlow({
  tripId,
  onDone,
}: {
  readonly tripId: string | null;
  readonly onDone: () => void;
}) {
  const paste = usePasteImport(tripId, onDone);
  return (
    <PasteSheet
      sending={paste.sending}
      error={paste.error}
      readClipboard={paste.readClipboard}
      onSend={paste.send}
      onClose={onDone}
    />
  );
}
