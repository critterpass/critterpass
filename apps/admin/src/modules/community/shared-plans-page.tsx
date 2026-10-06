/**
 * Crew plans: what crews have published, most reported first, and what came down. Taking one down
 * asks for the reason kept in the audit log; the plan disappears for every crew at once and its own
 * crew is told in their chat. Reports are judged one by one in Moderation.
 */
import {
  ADMIN_SHARED_PLAN_STATUSES,
  adminSharedPlansResponseSchema,
  canRunAdminCommand,
  type AdminSharedPlan,
} from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ActionDialog, type SupportAction } from '../support/action-dialog';

type Status = AdminSharedPlan['status'];

const TAB_LABEL: Readonly<Record<Status, string>> = {
  published: 'Published',
  unpublished: 'Came down',
};

const day = (value: string | null) =>
  value === null
    ? '—'
    : new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

export function SharedPlansPage() {
  const me = useOperator();
  const client = useQueryClient();
  const [status, setStatus] = useState<Status>('published');
  const [action, setAction] = useState<SupportAction | null>(null);
  const plans = useQuery({
    queryKey: ['community', 'shared-plans', status],
    queryFn: () =>
      getJson(`/v1/admin/shared-plans?status=${status}`, adminSharedPlansResponseSchema),
    refetchInterval: POLL_MS,
  });
  const mayUnpublish = canRunAdminCommand(me.roles, 'admin_unpublish_shared_plan').ok;
  const takeDown = (plan: AdminSharedPlan) =>
    setAction({
      title: 'Take this plan down',
      body: `"${plan.title ?? 'Untitled plan'}" disappears from crew plans for everyone, and its read-only links stop working. Its crew is told in their chat.`,
      confirmLabel: 'Take down',
      run: async ({ reason }) => {
        await runCommand('admin_unpublish_shared_plan', { id: plan.id, reason }, me.uid);
        await client.invalidateQueries({ queryKey: ['community', 'shared-plans'] });
      },
    });
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Community"
        title="Shared plans"
        subtitle="Plans crews chose to share. Only what any traveller browsing them sees is listed."
      />
      <div className="chips" role="tablist" aria-label="Status">
        {ADMIN_SHARED_PLAN_STATUSES.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="chip"
            aria-selected={status === id}
            onClick={() => setStatus(id)}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>
      {plans.isPending ? (
        <LoadingState />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.items.length === 0 ? (
        <EmptyState
          title={status === 'published' ? 'No crew has shared a plan yet' : 'Nothing came down'}
        />
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label="Crew plans">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Trip</th>
                <th scope="col">Rating</th>
                <th scope="col">Copies · saves</th>
                <th scope="col">Open reports</th>
                <th scope="col">{status === 'published' ? 'Published' : 'Came down'}</th>
                <th scope="col">{status === 'published' ? '' : 'Reason'}</th>
              </tr>
            </thead>
            <tbody>
              {plans.data.items.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <strong>{plan.title ?? 'Untitled plan'}</strong>
                    <br />
                    <span className="muted">{plan.destination_name ?? '—'}</span>
                  </td>
                  <td>
                    {plan.days_count} days · crew of {plan.crew_size}
                  </td>
                  <td>
                    {plan.rating_avg === null
                      ? '—'
                      : `${plan.rating_avg.toFixed(1)} (${plan.rating_count})`}
                  </td>
                  <td>
                    {plan.copies_count} · {plan.saves_count}
                  </td>
                  <td>
                    {plan.open_reports > 0 ? (
                      <span className="badge" data-tone="urgent">
                        {plan.open_reports}
                      </span>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td>{day(status === 'published' ? plan.published_at : plan.unpublished_at)}</td>
                  <td>
                    {status === 'unpublished' ? (
                      (plan.unpublish_reason ?? '—')
                    ) : mayUnpublish ? (
                      <button type="button" className="btn btn-sm" onClick={() => takeDown(plan)}>
                        Take down
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </div>
  );
}
