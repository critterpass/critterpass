/**
 * `import_scan` (docs/api-contracts.md §4.10): the device's OCR lines of a scanned confirmation or
 * boarding pass, and the pass's PDF417/Aztec barcode when it read one, become a candidate to ADD.
 * The parser reads the lines up to its text limit: a longer scan is read from its first page.
 */
import { importScanPayloadSchema, scanText } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requestImport } from './import-request';

export const importScanCommand = defineCommand({
  name: 'import_scan',
  v: 1,
  schema: importScanPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    requestImport(tx, {
      uid: ctx.uid,
      candidateId: payload.candidate_id,
      tripId: payload.trip_id,
      job: {
        candidate_id: payload.candidate_id,
        kind: 'scan',
        ...(payload.ocr_lines.length === 0 ? {} : { text: scanText(payload.ocr_lines) }),
        ...(payload.barcode === undefined ? {} : { barcode: payload.barcode }),
      },
    }),
});
