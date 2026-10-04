/**
 * Runs an import (7d-3): streams `POST /v1/trips/{id}/imports` for a link or a screenshot's text
 * into the link import state, and starts over on retry. Leaving the screen aborts the stream.
 */
/* eslint-disable lingui/no-unlocalized-strings -- cache keys, never copy. */
import { useCallback, useEffect, useReducer, useState } from 'react';

import { useSearchServices, type ImportBody } from './data/search-services';
import { LINK_IMPORT_START, linkImportReducer } from './link-import-model';

export function useLinkImport(tripId: string, body: ImportBody | null) {
  const services = useSearchServices();
  const [state, dispatch] = useReducer(linkImportReducer, LINK_IMPORT_START);
  const [attempt, setAttempt] = useState(0);
  const key = body === null ? null : 'url' in body ? `url:${body.url}` : `text:${body.text}`;

  useEffect(() => {
    if (body === null || key === null) return undefined;
    const controller = new AbortController();
    dispatch({ type: 'restart' });
    services
      .streamImport(tripId, body, (event) => dispatch({ type: 'event', event }), controller.signal)
      .then(
        () => {
          // A stream that ended without `done` or `error` lost its connection.
          if (!controller.signal.aborted) dispatch({ type: 'unreachable' });
        },
        () => {
          if (!controller.signal.aborted) dispatch({ type: 'unreachable' });
        },
      );
    return () => controller.abort();
    // `key` stands for `body`: a new object with the same link must not restart the import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, tripId, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, dispatch, retry };
}
