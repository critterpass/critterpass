/** The link-code sheet with its send: `verify_sender_email` for the crew the wallet is on. */
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { verifySenderEmailCommand } from '../data/commands';
import { LinkCodeSheet } from '../link-code/LinkCodeSheet';
import { linkCodeOutcome, linkCodePayload, type LinkCodeState } from '../link-code/link-code-model';

export function LinkCodeFlow({
  crewId,
  onDone,
}: {
  readonly crewId: string | null;
  readonly onDone: () => void;
}) {
  const verify = useCommand(verifySenderEmailCommand);
  const [state, setState] = useState<LinkCodeState>({ kind: 'idle' });
  return (
    <LinkCodeSheet
      state={state}
      onLink={(code) => {
        const payload = linkCodePayload(crewId, code);
        if (payload === null || state.kind === 'sending') return;
        setState({ kind: 'sending' });
        void verify.send(payload).then(
          (result) => setState(linkCodeOutcome(result)),
          () => setState({ kind: 'failed' }),
        );
      }}
      onClose={onDone}
    />
  );
}
