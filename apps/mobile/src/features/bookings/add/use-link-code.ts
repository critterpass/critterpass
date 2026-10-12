/** The link-code send for any sheet: `verify_sender_email` for the crew the wallet is on. */
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { verifySenderEmailCommand } from '../data/commands';
import { linkCodeOutcome, linkCodePayload, type LinkCodeState } from '../link-code/link-code-model';

export function useLinkCode(crewId: string | null) {
  const verify = useCommand(verifySenderEmailCommand);
  const [state, setState] = useState<LinkCodeState>({ kind: 'idle' });
  return {
    state,
    link: (code: string) => {
      const payload = linkCodePayload(crewId, code);
      if (payload === null || state.kind === 'sending') return;
      setState({ kind: 'sending' });
      void verify.send(payload).then(
        (result) => setState(linkCodeOutcome(result)),
        () => setState({ kind: 'failed' }),
      );
    },
  };
}
