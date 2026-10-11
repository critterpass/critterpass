/**
 * "Ask for a new code" on an invite that ran out: one request to whoever shared it (the server
 * finds them, or the organiser once they have left), once a day per code. The state says whether
 * it went, was already sent today, or could not be sent.
 */
import { useContext, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { REQUEST_FRESH_INVITE } from './join';

export type FreshInviteState = 'idle' | 'sending' | 'sent' | 'already' | 'failed';

export function useFreshInvite(code: string | null) {
  const localFirst = useContext(LocalFirstContext);
  const [state, setState] = useState<FreshInviteState>('idle');
  const ask = () => {
    if (state === 'sending') return;
    if (code === null || localFirst === null) {
      setState('failed');
      return;
    }
    setState('sending');
    void localFirst.commands
      .send(REQUEST_FRESH_INVITE, { code })
      .then((sent) => {
        if (sent.kind !== 'applied') {
          setState('failed');
          return;
        }
        const result = sent.result as { readonly sent?: boolean } | null;
        setState(result?.sent === false ? 'already' : 'sent');
      })
      .catch(() => setState('failed'));
  };
  return { state, ask, canAsk: code !== null };
}
