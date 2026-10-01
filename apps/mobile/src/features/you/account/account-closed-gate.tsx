/**
 * Mounted once at the root, drawing nothing. When a session is up it asks the server for the
 * account's state once: a closed account goes to the restore page instead of a Home where every
 * action would be refused. On the first launch after "keep my account" it opens the sign-in.
 */
import { router } from 'expo-router';
import { useContext, useEffect } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { deviceAccountServices, type AccountServices } from './account-services';
import { takeResumeSignIn } from './device-wipe';

/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
export const ACCOUNT_CLOSED_ROUTE = '/account-closed';
const RETURNING_SIGN_IN_ROUTE = '/onboarding/phone?mode=returning';
/* eslint-enable lingui/no-unlocalized-strings */

export interface AccountClosedGateProps {
  readonly services?: AccountServices;
  readonly resumeSignIn?: () => boolean;
}

export function AccountClosedGate({
  services = deviceAccountServices,
  resumeSignIn = takeResumeSignIn,
}: AccountClosedGateProps) {
  const localFirst = useContext(LocalFirstContext);

  useEffect(() => {
    if (resumeSignIn()) router.push(RETURNING_SIGN_IN_ROUTE);
    // Once per launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A new session (a first launch, or signing back in) brings a new local stack: ask again.
    if (localFirst === null) return undefined;
    let live = true;
    void services.readAccount().then((read) => {
      if (live && read.kind === 'ok' && read.state.status === 'closed') {
        router.replace(ACCOUNT_CLOSED_ROUTE);
      }
    });
    return () => {
      live = false;
    };
  }, [localFirst, services]);

  return null;
}
