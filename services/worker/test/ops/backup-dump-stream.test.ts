/**
 * How the backup reads pg_dump's output. A real child process stands in for pg_dump (its exit and
 * output timing is the behaviour under test); the object store is an in-memory stand-in for R2.
 */
import { describe, expect, it } from 'vitest';

import { runBackup } from '../../src/jobs/ops/backup';
import type { ObjectStore } from '../../src/jobs/ops/object-store';

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
const NOW = new Date('2026-09-29T20:00:00Z');
const URL_WITHOUT_SERVER = 'postgres://backup:secret@127.0.0.1:1/app';

function memoryStore(failUpload?: Error): ObjectStore & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putStream(key, body) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) {
        if (failUpload !== undefined) throw failUpload;
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      objects.set(key, bytes);
      return bytes.byteLength;
    },
    list: (prefix) => Promise.resolve([...objects.keys()].filter((key) => key.startsWith(prefix))),
    get: (key) => Promise.resolve(objects.get(key) ?? new Uint8Array()),
    delete: (key) => Promise.resolve(void objects.delete(key)),
  };
}

/** A pg_dump stand-in running `script` in sh (the appended `-Fc --no-password` become $1 $2). */
function fakeDump(script: string): string[] {
  return ['sh', '-c', script, 'pg_dump'];
}

describe('backup dump stream', () => {
  it('waits for a pg_dump that closes its output before it exits', async () => {
    // pg_dump closes stdout, then disconnects from the server, then exits 0.
    const store = memoryStore();
    const result = await runBackup({
      databaseUrl: URL_WITHOUT_SERVER,
      store,
      logger: silent,
      now: NOW,
      pgDump: fakeDump('printf dump-bytes; exec 1>&-; sleep 0.3; exit 0'),
    });
    expect(result.bytes).toBe('dump-bytes'.length);
    expect(Buffer.from(store.objects.get(result.key) ?? []).toString()).toBe('dump-bytes');
  });

  it("reports the upload's own error when the upload fails mid-dump", async () => {
    const store = memoryStore(new Error('object store upload part 1 failed: HTTP 400'));
    await expect(
      runBackup({
        databaseUrl: URL_WITHOUT_SERVER,
        store,
        logger: silent,
        now: NOW,
        pgDump: fakeDump('printf chunk; exec sleep 5'),
      }),
    ).rejects.toThrow('object store upload part 1 failed: HTTP 400');
  });

  it('names the abort, not pg_dump, when the job is aborted', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('attempt expired')), 200);
    await expect(
      runBackup({
        databaseUrl: URL_WITHOUT_SERVER,
        store: memoryStore(),
        logger: silent,
        now: NOW,
        signal: controller.signal,
        pgDump: fakeDump('printf chunk; exec sleep 5'),
      }),
    ).rejects.toThrow('backup aborted: Error: attempt expired');
  });

  it('still fails with pg_dump stderr when pg_dump itself fails', async () => {
    await expect(
      runBackup({
        databaseUrl: URL_WITHOUT_SERVER,
        store: memoryStore(),
        logger: silent,
        now: NOW,
        pgDump: fakeDump('echo "pg_dump: error: connection failed" >&2; exit 1'),
      }),
    ).rejects.toThrow('pg_dump exited with 1: pg_dump: error: connection failed');
  });
});
