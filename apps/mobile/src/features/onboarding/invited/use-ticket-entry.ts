/**
 * The invite ticket's working state, shared by the current and the premium ticket: the link from
 * the route, its preview, taking the seat (a first-time visitor makes their pass first; someone
 * with a pass joins at once), and which problem, if any, replaces the ticket.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { isOnboardingComplete } from '@/lib/links/pending';

import type { InviteProblemKind } from './invite-problem-copy';
import { useInviteServices } from './invite-services';
import { inviteSession } from './invite-session';
import { acceptInvite, problemCardOf, type JoinProblem } from './join';
import { INVITED_ROUTES } from './routes';
import { useInvitePreview } from './use-invite-preview';

export function useTicketEntry() {
  const services = useInviteServices();
  const localFirst = useContext(LocalFirstContext);
  const params = useLocalSearchParams<{ code?: string; seat?: string }>();
  const code = params.code ?? null;
  const seat = params.seat ?? null;
  const target = useMemo(
    () =>
      code === null ? null : { kind: 'invite' as const, code, ...(seat === null ? {} : { seat }) },
    [code, seat],
  );
  const { model, retry } = useInvitePreview(target);
  const [joinProblem, setJoinProblem] = useState<JoinProblem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code !== null) inviteSession.open(code, seat, services.now());
  }, [code, seat, services]);

  const take = () => {
    if (code === null) return;
    if (!isOnboardingComplete() || localFirst === null) {
      router.push(INVITED_ROUTES.pass);
      return;
    }
    setBusy(true);
    void acceptInvite(localFirst.commands, { code, ...(seat === null ? {} : { seat }) })
      .then((outcome) => {
        if (outcome.kind === 'joined') {
          inviteSession.setJoined(outcome.result);
          router.replace(INVITED_ROUTES.manifest);
        } else {
          setJoinProblem(outcome.problem);
        }
      })
      .finally(() => setBusy(false));
  };

  const problem: InviteProblemKind | null =
    joinProblem === null ? null : problemCardOf(joinProblem);
  const status = model.status;
  const seatOpen = problem === null && (status === 'active' || status === 'full');
  const shownProblem: InviteProblemKind | null =
    problem ?? (status === 'loading' || status === 'active' || status === 'full' ? null : status);

  return {
    code,
    model,
    busy,
    take,
    /** The preview has answered. */
    ready: status !== 'loading',
    seatOpen,
    shownProblem,
    retry: () => {
      setJoinProblem(null);
      retry();
    },
  };
}
