/**
 * Signed back in to a closed account: restore it (it reopens exactly as it was) or leave it closed
 * (this phone is cleared and the account is erased on its date).
 */
/* eslint-disable lingui/no-unlocalized-strings -- result kinds, wire values and test ids, never copy. */
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { restoreAccountCommand } from './account-api';
import { deviceAccountServices, type AccountServices } from './account-services';
import { ClosedView, type ClosedProblem } from './closed-view';
import { useAccountRead } from './use-account';

export function RestoreScreen({
  services = deviceAccountServices,
}: {
  readonly services?: AccountServices;
}) {
  const read = useAccountRead(services);
  const command = useCommand(restoreAccountCommand);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ClosedProblem | null>(null);
  const deletion = read?.kind === 'ok' ? read.state.deletion : null;

  const restore = async () => {
    setBusy(true);
    setProblem(null);
    const result = await command.send({}).catch(() => null);
    if (result?.kind === 'applied') {
      router.replace('/');
      return;
    }
    setProblem('not_restored');
    setBusy(false);
  };

  const leave = async () => {
    setBusy(true);
    setProblem(null);
    const result = await services.clearPhone('sign_out');
    if (result.kind === 'restarting') return;
    setProblem(result.kind);
    setBusy(false);
  };

  return (
    <ClosedView
      mode="restore"
      purgeAt={deletion?.purge_at ?? null}
      closedOn={
        deletion === null || deletion === undefined ? new Date() : new Date(deletion.requested_at)
      }
      busy={busy || read === null}
      problem={problem}
      onKeep={() => void restore()}
      onClose={() => void leave()}
    />
  );
}
