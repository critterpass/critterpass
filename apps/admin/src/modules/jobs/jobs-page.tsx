/**
 * Jobs & DLQ (Ops-Jobs): every queue with its counts and retry policy, dead letters with select +
 * redrive (one audited `redrive_jobs` per queue), crons with their last result, and live workers.
 * The panel's shape is the api's `GET /v1/admin/jobs` read.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { PageHeader } from '../../app/shell';
import { ErrorState, EmptyState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { showSavedToast } from '../../kit/toast';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const iso = z.iso.datetime({ offset: true });
const jobsPanelSchema = z.object({
  queues: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      policy: z.string(),
      queued: z.number(),
      active: z.number(),
      deferred: z.number(),
      total: z.number(),
      dead_letter: z.string().nullable(),
      dead_letters: z.number(),
    }),
  ),
  dead_letters: z.array(
    z.object({
      queue: z.string(),
      id: z.uuid(),
      original_id: z.string().nullable(),
      failed_at: iso,
      attempts: z.number().nullable(),
      error: z.string().nullable(),
    }),
  ),
  crons: z.array(
    z.object({
      queue: z.string(),
      expr: z.string(),
      tz: z.string(),
      last_state: z.string().nullable(),
      last_run_at: iso.nullable(),
      summary: z.string().nullable(),
    }),
  ),
  workers: z.number(),
});

const time = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function JobsPage() {
  const me = useOperator();
  const client = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const query = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: () => getJson('/v1/admin/jobs', jobsPanelSchema),
    refetchInterval: POLL_MS,
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const panel = query.data;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const redrive = async () => {
    setBusy(true);
    setError(null);
    try {
      const byQueue = new Map<string, string[]>();
      for (const letter of panel.dead_letters) {
        if (!selected.has(letter.id)) continue;
        byQueue.set(letter.queue, [...(byQueue.get(letter.queue) ?? []), letter.id]);
      }
      for (const [queue, ids] of byQueue) {
        const result = await runCommand('redrive_jobs', { queue, job_ids: ids }, me.uid);
        showSavedToast({ label: `Redrove ${ids.length} from ${queue}`, opId: result.op_id });
      }
      setSelected(new Set());
      await client.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Platform"
        title="Jobs & DLQ"
        subtitle={`Background queues, dead letters and crons. ${panel.workers} worker${panel.workers === 1 ? '' : 's'} live.`}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.size === 0 || busy}
            onClick={() => void redrive()}
          >
            Redrive {selected.size || ''}
          </button>
        }
      />
      {error !== null && <ErrorState error={error} title="Redrive failed" />}
      <section className="card stack" aria-label="Dead letters">
        <div className="section-label">Dead letters · {panel.dead_letters.length}</div>
        {panel.dead_letters.length === 0 ? (
          <EmptyState title="No dead letters" />
        ) : (
          <div className="table-wrap">
            <table className="table" aria-label="Dead letters">
              <tbody>
                {panel.dead_letters.map((letter) => (
                  <tr key={letter.id} data-selected={selected.has(letter.id)}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${letter.queue} ${letter.id}`}
                        checked={selected.has(letter.id)}
                        onChange={() => toggle(letter.id)}
                      />
                    </td>
                    <td className="mono">{letter.queue}</td>
                    <td>{letter.error ?? '—'}</td>
                    <td className="mono">{letter.attempts ?? '—'} tries</td>
                    <td className="mono">{time(letter.failed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card stack" aria-label="Queues">
        <div className="section-label">Queues · {panel.queues.length}</div>
        <div className="table-wrap">
          <table className="table" aria-label="Queues">
            <thead>
              <tr>
                <th>Queue</th>
                <th>Queued</th>
                <th>Active</th>
                <th>Deferred</th>
                <th>Dead</th>
                <th>Retry policy</th>
              </tr>
            </thead>
            <tbody>
              {panel.queues.map((queue) => (
                <tr key={queue.name}>
                  <td>
                    <span className="mono">{queue.name}</span>
                    {queue.description !== null && <div className="muted">{queue.description}</div>}
                  </td>
                  <td>{queue.queued}</td>
                  <td>{queue.active}</td>
                  <td>{queue.deferred}</td>
                  <td>{queue.dead_letters}</td>
                  <td className="muted">{queue.policy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card stack" aria-label="Crons">
        <div className="section-label">Crons · {panel.crons.length}</div>
        <div className="table-wrap">
          <table className="table" aria-label="Crons">
            <tbody>
              {panel.crons.map((cron) => (
                <tr key={cron.queue}>
                  <td className="mono">{cron.queue}</td>
                  <td className="mono">
                    {cron.expr} {cron.tz}
                  </td>
                  <td>
                    <span
                      className="state-pill"
                      data-state={
                        cron.last_state === 'failed'
                          ? 'down'
                          : cron.last_state === null
                            ? 'unknown'
                            : 'ok'
                      }
                    >
                      {cron.last_state ?? 'never ran'}
                    </span>
                  </td>
                  <td className="muted">
                    {cron.last_run_at === null ? '' : time(cron.last_run_at)} {cron.summary ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
