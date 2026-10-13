import { t } from '@lingui/core/macro';

import { confirmAlert } from '@/ui/premium/shell';

/** Asks before a saved list goes: its places stay in Saved. */
export function confirmDeleteList(name: string): Promise<boolean> {
  return confirmAlert({
    title: t({ id: 'explore.saved.deleteTitle', message: `Delete the list "${name}"?` }),
    message: t({ id: 'explore.saved.deleteKeeps', message: 'Its places stay in Saved.' }),
    confirm: t({ id: 'explore.saved.deleteList', message: 'Delete list' }),
    cancel: t({ id: 'explore.saved.cancel', message: 'Cancel' }),
  });
}
