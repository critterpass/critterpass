/**
 * Delete account over the real command path: review, hold, then the closed page in place. The
 * phone is cleared only from the closed page's buttons, which exist only after the server said
 * the account is closed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- result kinds, wire values and test ids, never copy. */
import type { DeletionReason } from '@cp/domain';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { requestAccountDeletionCommand, type ClosedAccount } from './account-api';
import { deviceAccountServices, type AccountServices } from './account-services';
import { closeAccount } from './close-account';
import { ClosedView, type ClosedProblem } from './closed-view';
import { DeleteView, type DeleteStep } from './delete-view';
import { useOnline } from './use-account';

const PASS_PLUS_SQL = 'SELECT pass_plus FROM user_entitlements WHERE user_id = ?';
const PASS_PLUS_TABLES = ['user_entitlements'];

export interface DeleteScreenProps {
  readonly services?: AccountServices;
  readonly now?: () => Date;
}

export function DeleteScreen({
  services = deviceAccountServices,
  now = () => new Date(),
}: DeleteScreenProps) {
  const { network } = useLocalFirst();
  const online = useOnline(network);
  const command = useCommand(requestAccountDeletionCommand);
  const uid = useOwnerUid();
  const passPlus = useLiveRows<{ pass_plus: number }>(
    PASS_PLUS_SQL,
    uid === null ? null : [uid],
    PASS_PLUS_TABLES,
  );
  const [step, setStep] = useState<DeleteStep>('review');
  const [reason, setReason] = useState<DeletionReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closed, setClosed] = useState<ClosedAccount | null>(null);
  const [clearProblem, setClearProblem] = useState<ClosedProblem | null>(null);

  const onDelete = async () => {
    if (busy || !online) return;
    setBusy(true);
    setFailed(false);
    const outcome = await closeAccount(
      (payload) => command.send(payload as Record<string, never>),
      reason,
    );
    if (outcome.kind === 'closed') setClosed(outcome.account);
    else setFailed(true);
    setBusy(false);
  };

  const clear = async (then?: 'sign_in') => {
    setBusy(true);
    setClearProblem(null);
    const result = await services.clearPhone('account_closed', then);
    if (result.kind === 'restarting') return;
    setClearProblem(result.kind);
    setBusy(false);
  };

  if (closed !== null) {
    return (
      <ClosedView
        mode={closed.purgeAt === null ? 'erased' : 'closed'}
        purgeAt={closed.purgeAt}
        closedOn={now()}
        busy={busy}
        problem={clearProblem}
        onKeep={() => void clear('sign_in')}
        onClose={() => void clear()}
      />
    );
  }
  return (
    <DeleteView
      step={step}
      online={online}
      busy={busy}
      passPlus={passPlus.rows[0]?.pass_plus === 1}
      reason={reason}
      problem={failed ? 'not_closed' : null}
      onContinue={() => setStep('hold')}
      onReason={setReason}
      onDelete={() => void onDelete()}
      onKeep={() => router.back()}
    />
  );
}
