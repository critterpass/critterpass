/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import type { SetTastePayload } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';

/** New this-or-that answers overwrite the old ones (queued offline). */
export const setTasteCommand = defineClientCommand<SetTastePayload>({
  name: 'set_taste',
  offline: true,
});
