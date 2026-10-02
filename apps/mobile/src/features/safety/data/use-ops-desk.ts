/**
 * Whether a person staffs the ops desk (`client_config` `safety.ops_desk`, off unless the server
 * switches it on). Help never offers, and an SOS never shows, a desk call nobody will make.
 */
import { useLiveRows } from './live-rows';
import { isOn } from './ops-desk-flag';

/* eslint-disable lingui/no-unlocalized-strings -- SQL and a table name, never copy. */
const FLAG_SQL = "SELECT value FROM client_config WHERE key = 'safety.ops_desk'";
const FLAG_TABLES = ['client_config'] as const;
/* eslint-enable lingui/no-unlocalized-strings */

export function useOpsDesk(): boolean {
  return isOn(useLiveRows<{ value: string | null }>(FLAG_SQL, [], FLAG_TABLES).rows[0]?.value);
}
