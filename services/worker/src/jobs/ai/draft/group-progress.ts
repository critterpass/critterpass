/**
 * A step of a draft planned in day groups keeps each group's result the moment that group
 * finishes, so a step that stopped mid-way resumes at the group it stopped on: the groups already
 * done are read back, and only the others are asked of the guide again.
 *
 * The results wait in `agent_jobs.partial` under `<step>_groups` (by the group's position) while
 * the step runs. When the step finishes the runner stores the step's own result and this entry
 * goes with it. A group's result depends only on the steps before it, so one kept by an earlier
 * try is as good as one made now.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

export interface GroupProgress {
  /** The results kept so far, by the group's position. */
  readonly read: <T>() => Promise<ReadonlyMap<number, T>>;
  readonly keep: (index: number, result: unknown) => Promise<void>;
}

/**
 * Every group's result, in group order: a kept one is used as it is, the others are run together
 * and each is kept as it lands. When a group fails the others still finish and are kept, and the
 * first failure is thrown once they have.
 */
export async function eachGroup<T>(
  count: number,
  progress: GroupProgress | undefined,
  run: (index: number) => Promise<T>,
): Promise<T[]> {
  const kept = progress === undefined ? new Map<number, T>() : await progress.read<T>();
  const settled = await Promise.allSettled(
    Array.from({ length: count }, async (_, index) => {
      const done = kept.get(index);
      if (done !== undefined) return done;
      const result = await run(index);
      await progress?.keep(index, result);
      return result;
    }),
  );
  return settled.map((outcome) => {
    if (outcome.status === 'rejected') throw outcome.reason;
    return outcome.value;
  });
}

/** One step's group results on its job row; a job that is no longer live keeps nothing. */
export function groupProgress(pool: pg.Pool, jobId: string, step: string): GroupProgress {
  const key = `${step}_groups`;
  return {
    read: async <T>() => {
      const { rows } = await withSystem(pool, (tx) =>
        tx.query<{ kept: Record<string, T> | null }>(
          'SELECT partial->$2 AS kept FROM agent_jobs WHERE id = $1',
          [jobId, key],
        ),
      );
      return new Map(
        Object.entries(rows[0]?.kept ?? {}).map(([index, result]) => [Number(index), result]),
      );
    },
    keep: async (index, result) => {
      await withSystem(pool, (tx) =>
        tx.query(
          `UPDATE agent_jobs
              SET partial = jsonb_set(coalesce(partial, '{}'::jsonb), ARRAY[$2::text],
                    coalesce(partial->$2, '{}'::jsonb) || jsonb_build_object($3::text, $4::jsonb))
            WHERE id = $1 AND status IN ('queued', 'running')`,
          [jobId, key, String(index), JSON.stringify(result)],
        ),
      );
    },
  };
}
