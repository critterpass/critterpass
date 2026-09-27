import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { formatError } from '../shared/format-error';

import { createSSyncHarness } from './harness';
import { testChatLatency, testOfflineReplay, testReplicationAndReject } from './scenario';

function progress(step: string): void {
  console.error(JSON.stringify({ msg: 's-sync progress', step, at: new Date().toISOString() }));
}

/**
 * Free, always-rerunnable regression probe against S-SYNC's own local stack (harness.ts):
 * replication + reject-path correctness, a small-sample chat-latency sanity check, and offline
 * replay convergence. The pass-criteria numbers recorded in the ADR (real Railway SG /
 * PlanetScale network distance, 1k connections) come from `load.ts` against a deployed target.
 */
async function main(): Promise<void> {
  progress('starting harness');
  const harness = await createSSyncHarness();
  const clientDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-spike-s-sync-'));
  try {
    const ctx = {
      appUrl: harness.appUrl,
      syncEndpoint: harness.syncEndpoint,
      pool: harness.pool,
      clientDir,
    };

    progress('testReplicationAndReject');
    const replicationAndReject = await testReplicationAndReject(ctx);

    progress('testChatLatency');
    const chatLatency = await testChatLatency(ctx, 20);

    progress('testOfflineReplay');
    const offlineReplay = await testOfflineReplay(ctx, 50);

    console.log(
      JSON.stringify({
        msg: 's-sync report',
        report: { target: 'local', replicationAndReject, chatLatency, offlineReplay },
      }),
    );
  } finally {
    progress('closing harness');
    await harness.close();
    await fs.rm(clientDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-sync run failed', error: formatError(error) }));
  process.exitCode = 1;
});
