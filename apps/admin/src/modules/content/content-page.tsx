/**
 * Content batches: factory output waiting for review. The stage strip shows where the selected
 * batch is; the list shows every batch with its status, founder gate and cost; the panel is where
 * reviewers mark items and the owner approves. Undesigned states follow docs/undesigned-states.md.
 */
import {
  contentBatchDetailSchema,
  contentBatchListSchema,
  type ContentBatchSummary,
} from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { BatchPanel } from './batch-panel';
import { formatUsd, GATE_LABEL, STAGES } from './items';
import './content.css';

const STATUS_TONE: Readonly<Record<string, string | undefined>> = {
  review: 'review',
  blocked: 'urgent',
  published: 'success',
  approved: 'success',
  rejected: 'rejected',
};

function StageStrip({ stage }: { stage: ContentBatchSummary['stage'] | undefined }) {
  const reached = stage === undefined ? -1 : STAGES.indexOf(stage);
  return (
    <ol className="cb-stages" aria-label="Pipeline stage">
      {STAGES.map((name, index) => (
        <li
          key={name}
          data-state={index < reached ? 'done' : index === reached ? 'current' : 'todo'}
        >
          {index < reached && <span aria-hidden="true">✓</span>}
          {name}
        </li>
      ))}
    </ol>
  );
}

function BatchCard({
  batch,
  selected,
  onSelect,
}: {
  batch: ContentBatchSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const detail =
    batch.status === 'blocked' && batch.blocked_reason !== null
      ? batch.blocked_reason
      : batch.status === 'rejected' && batch.notes !== null
        ? `“${batch.notes}”`
        : `${batch.item_count} items${batch.severity.warn > 0 ? ` · ${batch.severity.warn} validator warnings` : ''}${batch.cost_micros > 0 ? ` · ${formatUsd(batch.cost_micros)}` : ''}`;
  return (
    <button type="button" className="cb-batch" aria-pressed={selected} onClick={onSelect}>
      <span className="row cb-batch-top">
        <span className="cb-status" data-tone={STATUS_TONE[batch.status]}>
          {batch.status}
        </span>
        <span className="muted cb-gate">
          {batch.status === 'published'
            ? `v${batch.version}`
            : (GATE_LABEL[batch.gate ?? ''] ?? '')}
        </span>
      </span>
      <span className="cb-batch-title">
        {batch.kind.replaceAll('_', ' ')} · {batch.title}
      </span>
      <span className="muted cb-batch-detail">{detail}</span>
    </button>
  );
}

export function ContentPage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['content-batches'],
    queryFn: () => getJson('/v1/admin/content/batches', contentBatchListSchema),
    refetchInterval: POLL_MS,
  });
  const current = selected ?? list.data?.items[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ['content-batch', current],
    enabled: current !== null,
    queryFn: () => getJson(`/v1/admin/content/batches/${current ?? ''}`, contentBatchDetailSchema),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['content-batches'] });
    await client.invalidateQueries({ queryKey: ['content-batch'] });
  };
  const summary = list.data?.items.find((batch) => batch.id === current);

  return (
    <div className="stack">
      <PageHeader
        title="Content batches"
        subtitle="Factory output waits here. Reviewers mark items; only an owner approves a batch, and approval publishes a new release."
      />
      <StageStrip stage={summary?.stage} />
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No batches yet">
          <p className="muted">Run the content factory to queue a batch for review.</p>
        </EmptyState>
      ) : (
        <div className="cb-layout">
          <nav className="stack cb-list" aria-label="Batches">
            {list.data.items.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                selected={batch.id === current}
                onSelect={() => setSelected(batch.id)}
              />
            ))}
          </nav>
          {detail.isPending ? (
            <LoadingState rows={6} />
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
          ) : (
            <BatchPanel key={detail.data.id} batch={detail.data} onChanged={refresh} />
          )}
        </div>
      )}
    </div>
  );
}
