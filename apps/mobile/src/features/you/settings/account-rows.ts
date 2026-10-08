/**
 * Settings > ACCOUNT: Download my data, Sign out and Delete account. The rows always show for a
 * signed-in person; they can be used once the server has answered for the account, and say
 * "Needs a connection" while it cannot be reached.
 */
import { useLingui } from '@lingui/react/macro';

import type { SettingsRow } from '@/ui/inputs/SettingsGroup';

/**
 * `ready`: the server answered for this account. `checking`: asked, not answered yet.
 * `unreachable`: no way to reach it. `none`: no account to sign out of (the rows are left out).
 */
export type AccountRowsState = 'ready' | 'checking' | 'unreachable' | 'none';

export function useAccountRows(
  account: AccountRowsState,
  dataExport: { readonly line: string; readonly enabled: boolean },
  handlers: {
    readonly onDataExport: () => void;
    readonly onSignOut: () => void;
    readonly onDeleteAccount: () => void;
  },
): Readonly<Record<string, SettingsRow | null>> {
  const { t } = useLingui();
  if (account === 'none') return {};
  const off = account !== 'ready';
  const why =
    account === 'unreachable'
      ? { subtitle: t({ id: 'you.settings.needsConnection', message: 'Needs a connection' }) }
      : {};
  return {
    'download-data': {
      key: 'download-data',
      kind: 'value',
      title: t({ id: 'you.settings.downloadData', message: 'Download my data' }),
      subtitle: why.subtitle ?? dataExport.line,
      value: '',
      disabled: off || !dataExport.enabled,
      onPress: handlers.onDataExport,
    },
    'sign-out': {
      key: 'sign-out',
      kind: 'value',
      title: t({ id: 'you.settings.signOut', message: 'Sign out' }),
      ...why,
      value: '',
      disabled: off,
      onPress: handlers.onSignOut,
    },
    'delete-account': {
      key: 'delete-account',
      kind: 'destructive',
      title: t({ id: 'you.settings.deleteAccount', message: 'Delete account' }),
      ...why,
      disabled: off,
      onPress: handlers.onDeleteAccount,
    },
  };
}
