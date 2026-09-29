/**
 * `import_paste` (docs/api-contracts.md §4.10): pasted confirmation text, or a link the worker
 * fetches once through the supplier allow-list (never stored), becomes a candidate to ADD.
 */
import { importPastePayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requestImport } from './import-request';

export const importPasteCommand = defineCommand({
  name: 'import_paste',
  v: 1,
  schema: importPastePayloadSchema,
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
        kind: 'paste',
        ...(payload.text === undefined ? {} : { text: payload.text }),
        ...(payload.url === undefined ? {} : { url: payload.url }),
      },
    }),
});
