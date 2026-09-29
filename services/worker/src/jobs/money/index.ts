/** Money jobs: the ledger re-rate after a settlement currency change and the daily auto-confirm. */
import type { AnyJobDefinition } from '../../boss';
import { autoconfirmJob } from './autoconfirm';
import { rerateJob } from './rerate';

export { registerMoneyPushes } from './pushes';

export function moneyJobs(): AnyJobDefinition[] {
  return [rerateJob(), autoconfirmJob()];
}
