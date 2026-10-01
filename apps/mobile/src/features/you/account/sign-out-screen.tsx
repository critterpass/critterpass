/** Sign out: confirm, then sign out on the server, clear this phone and restart at the welcome screen. */
/* eslint-disable lingui/no-unlocalized-strings -- result kinds, wire values and test ids, never copy. */
import { router } from 'expo-router';
import { useState } from 'react';

import { deviceAccountServices, type AccountServices } from './account-services';
import { SignOutView } from './sign-out-view';
import { usePassSaved } from './use-account';

const SAVE_PASS_ROUTE = '/onboarding/save';

export function SignOutScreen({
  services = deviceAccountServices,
}: {
  readonly services?: AccountServices;
}) {
  const saved = usePassSaved(services);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'incomplete' | 'restart_failed' | null>(null);

  const signOut = async () => {
    if (busy || saved === null) return;
    setBusy(true);
    setProblem(null);
    const result = await services.clearPhone('sign_out');
    if (result.kind === 'restarting') return;
    setProblem(result.kind);
    setBusy(false);
  };

  return (
    <SignOutView
      saved={saved}
      busy={busy}
      problem={problem}
      onSignOut={() => void signOut()}
      onSavePass={() => router.push(SAVE_PASS_ROUTE)}
    />
  );
}
