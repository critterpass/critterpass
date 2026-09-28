import { useEffect, useState } from 'react';

import { registerPrimerPresenter, type PrimerAnswer, type PrimerRequest } from '@/lib/permissions';

import { PrimerSheet } from './PrimerSheet';

interface Pending {
  readonly request: PrimerRequest;
  readonly resolve: (answer: PrimerAnswer) => void;
}

/**
 * Mounted once near the app root: the orchestrator's primer presenter. Requests queue so two
 * features asking at once show one sheet after the other, never two at a time.
 */
export function PrimerSheetHost() {
  const [queue, setQueue] = useState<readonly Pending[]>([]);

  useEffect(
    () =>
      registerPrimerPresenter(
        (request) =>
          new Promise<PrimerAnswer>((resolve) => {
            setQueue((current) => [...current, { request, resolve }]);
          }),
      ),
    [],
  );

  const current = queue[0];
  if (current === undefined) return null;
  return (
    <PrimerSheet
      key={`${current.request.kind}:${current.request.trigger}`}
      request={current.request}
      onAnswer={(answer) => {
        current.resolve(answer);
        setQueue((items) => items.slice(1));
      }}
    />
  );
}
