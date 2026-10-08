/**
 * Taking the seat from the issued pass: one join at a time, its progress and how it ended. A join
 * that fails leaves everything as it was (the code, the seat, the pass page), so it can be sent
 * again in place; this phone is past onboarding only once the seat is taken or given up.
 */
import { router } from 'expo-router';
import { useContext, useRef, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { clearPendingLink } from '@/lib/links/pending';

import { markOnboardingComplete } from '../flow-controller/completion';
import { updateDraft } from '../flow-controller/draft-store';
import { inviteSession } from './invite-session';
import { acceptInvite, type JoinProblem } from './join';
import { HANDOFF_ROUTES, INVITED_ROUTES } from './routes';

export function useSeatJoin() {
  const localFirst = useContext(LocalFirstContext);
  const inFlight = useRef(false);
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState<JoinProblem | null>(null);

  /** The pass exists now: with the seat taken or given up, onboarding is over. */
  const finish = () => {
    updateDraft((d) => ({ ...d, step: 'saved' }));
    markOnboardingComplete();
    clearPendingLink();
  };

  const join = async () => {
    if (inFlight.current) return;
    const { code, seat } = inviteSession.read();
    if (code === null || localFirst === null) {
      setProblem('offline');
      return;
    }
    inFlight.current = true;
    setProblem(null);
    setJoining(true);
    const outcome = await acceptInvite(localFirst.commands, {
      code,
      ...(seat === null ? {} : { seat }),
    });
    inFlight.current = false;
    setJoining(false);
    if (outcome.kind === 'joined') {
      finish();
      inviteSession.setJoined(outcome.result);
      router.replace(INVITED_ROUTES.manifest);
    } else setProblem(outcome.problem);
  };

  /** Home without the crew: the pass is theirs either way. */
  const giveUp = () => {
    finish();
    router.replace(HANDOFF_ROUTES.home);
  };

  return { joining, problem, join, giveUp };
}
