/**
 * Client spec for asking the server to build a failed recap again. Online only: a retry waiting in
 * the queue would leave the page saying it failed, so without signal the page says so instead.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export interface RetryRecapPayload {
  readonly trip_id: string;
}

export const retryRecapCommand = defineClientCommand<RetryRecapPayload>({
  name: 'retry_recap',
  offline: false,
  summarize: () => msg({ id: 'recap.queued.retry', message: 'Building the recap again' }),
});
