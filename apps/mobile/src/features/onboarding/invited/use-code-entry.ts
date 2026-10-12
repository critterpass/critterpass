/**
 * Typing a crew code, shared by the current and the premium code page: the six characters, a
 * pasted link or code (only ever from a tap on the paste control; a personal link goes to its own
 * ticket), the preview of a complete code, whether it is found or wrong, which problem shows, and
 * joining (a first-time visitor makes their pass first).
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { normalizeJoinCode } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { isOnboardingComplete } from '@/lib/links/pending';
import { parseIncomingLink } from '@/lib/links/router';

import type { InviteProblemKind } from './invite-problem-copy';
import { useInviteServices } from './invite-services';
import { inviteSession } from './invite-session';
import { acceptInvite, canRetryJoin, problemCardOf, type JoinProblem } from './join';
import { INVITED_ROUTES } from './routes';
import { ticketProblem } from './ticket-model';
import { useInvitePreview } from './use-invite-preview';

export const CODE_LENGTH = 6;

export function useCodeEntry() {
  const services = useInviteServices();
  const localFirst = useContext(LocalFirstContext);
  const params = useLocalSearchParams<{ notice?: string; pasted?: string }>();
  const [typed, setTypedRaw] = useState('');
  const [pastedFrom, setPastedFrom] = useState<string | null>(null);
  const [joinProblem, setJoinProblem] = useState<JoinProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const code = typed.length === CODE_LENGTH ? normalizeJoinCode(typed) : null;
  const target = useMemo(() => (code === null ? null : { kind: 'invite' as const, code }), [code]);
  const { model, retry } = useInvitePreview(target);

  useEffect(() => {
    if (code !== null) inviteSession.open(code, null, services.now());
  }, [code, services]);

  const onPaste = (text: string, via: 'paste' | 'scan' = 'paste') => {
    const link = parseIncomingLink(text.trim());
    if (link?.kind === 'invite' && link.seat !== undefined) {
      router.replace({
        pathname: INVITED_ROUTES.ticket,
        params: { code: link.code, seat: link.seat },
      });
      return;
    }
    const pastedCode = link?.kind === 'invite' ? link.code : normalizeJoinCode(text.trim());
    if (pastedCode !== null) {
      setTypedRaw(pastedCode);
      setPastedFrom(
        via === 'scan'
          ? t({ id: 'onboarding.invite.code.scannedFrom', message: 'Read from the QR code' })
          : t({ id: 'onboarding.invite.code.pastedFrom', message: 'Pasted from your clipboard' }),
      );
    }
  };

  useEffect(() => {
    // The link the router handed over on arrival is pasted once, as if tapped.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.pasted !== undefined) onPaste(params.pasted);
    // Only the link handed over on arrival, never a later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const found = code !== null && (model.status === 'active' || model.status === 'full');
  useEffect(() => {
    // The code is in: the keyboard makes way so the whole crew card shows above JOIN.
    if (found) Keyboard.dismiss();
  }, [found]);
  const wrong = typed.length === CODE_LENGTH && (code === null || model.status === 'not_found');

  const problem: InviteProblemKind | null =
    joinProblem !== null
      ? problemCardOf(joinProblem)
      : code !== null && model.status !== 'not_found'
        ? ticketProblem(model.status)
        : null;

  const join = () => {
    if (code === null || busy) return;
    if (!isOnboardingComplete() || localFirst === null) {
      router.push(INVITED_ROUTES.pass);
      return;
    }
    setBusy(true);
    setJoinProblem(null);
    void acceptInvite(localFirst.commands, { code })
      .then((outcome) => {
        if (outcome.kind === 'joined') {
          inviteSession.setJoined(outcome.result);
          router.replace(INVITED_ROUTES.manifest);
        } else setJoinProblem(outcome.problem);
      })
      .finally(() => setBusy(false));
  };

  return {
    typed,
    setTyped: (next: string) => {
      setJoinProblem(null);
      setPastedFrom(null);
      setTypedRaw(next.toUpperCase());
    },
    clear: () => setTypedRaw(''),
    onPaste,
    pastedFrom,
    code,
    model,
    retry,
    found,
    wrong,
    problem,
    /** A join that failed, so the problem card has no action of its own. */
    joinFailed: joinProblem !== null,
    busy,
    join,
    // A join that never arrived (or was told to wait) keeps JOIN: pressing it sends the same code again.
    joinable: found && (problem === null || (joinProblem !== null && canRetryJoin(joinProblem))),
  };
}
