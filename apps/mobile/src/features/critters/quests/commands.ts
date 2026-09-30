/**
 * Client spec for joining an optional quest. It may wait in the offline queue: the sign-up only
 * counts on the server, and the card shows it pending until its row syncs.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { SignupQuestPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const signupQuestCommand = defineClientCommand<SignupQuestPayload>({
  name: 'signup_quest',
  offline: true,
  summarize: () => msg({ id: 'quests.queued.signup', message: 'Joining a quest' }),
});
