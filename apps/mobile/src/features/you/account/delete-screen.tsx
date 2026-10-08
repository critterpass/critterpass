/**
 * Delete account over the real command path: review, hold, then the closed page in place. The
 * phone is cleared only from the closed page's buttons, which exist only after the server said
 * the account is closed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- result kinds, wire values and test ids, never copy. */
import type { DeletionPreflight, DeletionReason } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { exportLine } from '../export/export-copy';
import { YOU_ROUTES } from '../routes';
import { useDataExport } from '../export/use-data-export';
import { requestAccountDeletionCommand, type ClosedAccount } from './account-api';
import { deviceAccountServices, type AccountServices } from './account-services';
import { closeAccount } from './close-account';
import { ClosedView, type ClosedProblem } from './closed-view';
import { DeleteView, type DeleteStep } from './delete-view';
import { useOnline } from './use-account';

const PASS_PLUS_SQL = 'SELECT pass_plus FROM user_entitlements WHERE user_id = ?';
const PASS_PLUS_TABLES = ['user_entitlements'];

/** Where each store lets someone cancel a subscription. */
const MANAGE_SUBSCRIPTION_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

function usePreflight(services: AccountServices): DeletionPreflight | null {
  const [preflight, setPreflight] = useState<DeletionPreflight | null>(null);
  useEffect(() => {
    let live = true;
    void services
      .readPreflight()
      .catch(() => null)
      .then((next) => {
        if (live) setPreflight(next);
      });
    return () => {
      live = false;
    };
  }, [services]);
  return preflight;
}

export interface DeleteScreenProps {
  readonly services?: AccountServices;
  readonly now?: () => Date;
  /**
   * Drawn with the closed page: the route turns its back gesture off here. The session has ended,
   * so the only ways on are the page's two buttons.
   */
  readonly whenClosed?: ReactNode;
}

export function DeleteScreen({
  services = deviceAccountServices,
  now = () => new Date(),
  whenClosed = null,
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
  const preflight = usePreflight(services);
  const dataExport = useDataExport(now);
  const locale = useLocale();
  const [step, setStep] = useState<DeleteStep>('review');
  const [reason, setReason] = useState<DeletionReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closed, setClosed] = useState<ClosedAccount | null>(null);
  const [clearProblem, setClearProblem] = useState<ClosedProblem | null>(null);

  const isClosed = closed !== null;
  useEffect(() => {
    if (!isClosed) return undefined;
    const held = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => held.remove();
  }, [isClosed]);

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
      <>
        {whenClosed}
        <ClosedView
          mode={closed.purgeAt === null ? 'erased' : 'closed'}
          purgeAt={closed.purgeAt}
          closedOn={now()}
          busy={busy}
          problem={clearProblem}
          onKeep={() => void clear('sign_in')}
          onClose={() => void clear()}
        />
      </>
    );
  }
  return (
    <DeleteView
      step={step}
      online={online}
      busy={busy}
      passPlus={passPlus.rows[0]?.pass_plus === 1}
      preflight={preflight}
      onSettle={() => {
        // Settle up (3i-5), by its design id: the money area registers the route.
        const settle = hrefFor('3i-5');
        if (settle !== undefined) router.push(settle);
      }}
      onManageSubscription={() => void Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
      download={{
        line: exportLine(dataExport.state, dataExport.problem, locale),
        onPress: dataExport.state.kind === 'ready' ? dataExport.open : dataExport.request,
      }}
      reason={reason}
      problem={failed ? 'not_closed' : null}
      onContinue={() => setStep('hold')}
      onReason={setReason}
      onDelete={() => void onDelete()}
      onKeep={() => goBackOr(YOU_ROUTES.settings)}
    />
  );
}
