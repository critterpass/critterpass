/** `set_app_icon`: the account's copy of the icon the device shows (needs a connection). */
import type { SetAppIconPayload } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';

export const setAppIconCommand = defineClientCommand<SetAppIconPayload>({
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a command name, never copy
  name: 'set_app_icon',
  offline: false,
});
