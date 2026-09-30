/**
 * SCAN (3h-2): the platform document scanner captures a printed voucher or a boarding pass on
 * another screen; `cp-ocr` reads its lines and any PDF417 / Aztec / QR code on the phone, and
 * `import_scan` sends the lines and the code (never the photo) to be read into a candidate, which
 * appears as "parsing" at once and fills in.
 */
import { generateUuidV7 } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { importScanCommand } from '../data/commands';
import type { DocumentReader } from '../data/services';

export type ScanState =
  'idle' | 'scanning' | 'sent' | 'nothing' | 'denied' | 'offline' | 'failed' | 'unsupported';

/** The lines and code of one scanned page, or null when nothing was read. */
export async function readPage(
  reader: DocumentReader,
  uri: string,
): Promise<{
  lines: string[];
  barcode: { format: 'pdf417' | 'aztec' | 'qr'; payload: string } | null;
}> {
  const [text, codes] = await Promise.all([
    reader.recognize(uri).catch(() => null),
    reader.scanBarcode(uri).catch(() => []),
  ]);
  const lines = (text?.lines ?? []).map((line) => line.text.trim()).filter((line) => line !== '');
  const code = codes[0];
  return {
    lines: lines.slice(0, 400).map((line) => line.slice(0, 500)),
    barcode:
      code === undefined ? null : { format: code.format, payload: code.value.slice(0, 4000) },
  };
}

export function useBookingScan(reader: DocumentReader | null, tripId: string | null) {
  const command = useCommand(importScanCommand);
  const [state, setState] = useState<ScanState>('idle');
  const scan = async () => {
    if (reader === null) {
      setState('unsupported');
      return;
    }
    setState('scanning');
    let uri: string | undefined;
    try {
      const captured = await reader.scanDocument({ pageLimit: 1 });
      if (captured.status === 'cancelled') {
        setState('idle');
        return;
      }
      uri = captured.uris[0];
    } catch {
      setState('denied');
      return;
    }
    if (uri === undefined) {
      setState('idle');
      return;
    }
    const page = await readPage(reader, uri);
    if (page.lines.length === 0 && page.barcode === null) {
      setState('nothing');
      return;
    }
    const result = await command.send({
      candidate_id: generateUuidV7(),
      ...(tripId === null ? {} : { trip_id: tripId }),
      ocr_lines: page.lines,
      ...(page.barcode === null ? {} : { barcode: page.barcode }),
    });
    setState(
      result.kind === 'unavailable' ? 'offline' : result.kind === 'rejected' ? 'failed' : 'sent',
    );
  };
  return { state, scan };
}
