/** Money jobs: the ledger re-rate after a settlement currency change. */
import type { AnyJobDefinition } from '../../boss';
import { rerateJob } from './rerate';

export function moneyJobs(): AnyJobDefinition[] {
  return [rerateJob()];
}
