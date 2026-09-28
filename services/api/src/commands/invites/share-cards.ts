/**
 * Share-card upkeep for link codes (docs/api-contracts-async.md §2.2 `og.render`), queued in the
 * command's transaction: a code that has just been shared gets its card drawn before anyone
 * unfurls it, and a code that stopped resolving has its cached card purged now rather than on its
 * next request. The worker asks the web Worker, which decides from the code's live state.
 */
import { sendInTx } from '@cp/db';
import { OG_RENDER_QUEUE, ogRenderSingletonKey, type OgRenderKind } from '@cp/domain';
import type pg from 'pg';

export async function refreshShareCard(
  tx: pg.PoolClient,
  kind: OgRenderKind,
  code: string,
): Promise<void> {
  const job = { kind, token: code };
  await sendInTx(tx, OG_RENDER_QUEUE, job, { singletonKey: ogRenderSingletonKey(job) });
}
