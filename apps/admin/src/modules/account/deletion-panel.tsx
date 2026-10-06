/**
 * The deletion panel on a traveller's support page: where their deletion stands (none, requested
 * with its purge date, restored, purged), their last data export, and for an owner the button
 * that ends the grace window early for a legal erasure request.
 */
import { adminUserDeletionSchema, canRunAdminCommand } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ActionDialog, type SupportAction } from '../support/action-dialog';
import { day, DELETION_STEPS, STEP_OF } from './format';

export function DeletionPanel({ uid }: { uid: string }) {
  const me = useOperator();
  const client = useQueryClient();
  const [action, setAction] = useState<SupportAction | null>(null);
  const queryKey = ['account', 'deletion', uid];
  const deletion = useQuery({
    queryKey,
    queryFn: () => getJson(`/v1/admin/users/${uid}/deletion`, adminUserDeletionSchema),
    refetchInterval: POLL_MS,
  });
  if (deletion.isPending) return <LoadingState rows={2} />;
  if (deletion.isError) {
    return <ErrorState error={deletion.error} onRetry={() => void deletion.refetch()} />;
  }
  const { state, deletions, last_export: lastExport } = deletion.data;
  const latest = deletions[0];
  const mayForce = canRunAdminCommand(me.roles, 'force_purge_account').ok;
  const current = STEP_OF[state];
  return (
    <div className="stack">
      <ol className="row" aria-label="Deletion state" style={{ listStyle: 'none', padding: 0 }}>
        {DELETION_STEPS.map((step) => (
          <li key={step.id}>
            <span
              className="badge"
              data-tone={step.id === current ? step.tone : undefined}
              aria-current={step.id === current ? 'step' : undefined}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      {latest !== undefined && (
        <div className="mono muted">
          asked {day(latest.requested_at)} from the {latest.source}
          {latest.state === 'requested' && ` · can be restored until ${day(latest.purge_at)}`}
          {latest.restored_at !== null && ` · restored ${day(latest.restored_at)}`}
          {latest.purged_at !== null && ` · purged ${day(latest.purged_at)}`}
        </div>
      )}
      <div className="muted">
        {lastExport === null
          ? 'No data export asked for.'
          : `Last data export ${day(lastExport.requested_at)}, ${lastExport.status}.`}{' '}
        Force-purge is for legal requests only and needs a reason.
      </div>
      {state === 'requested' && mayForce && (
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setAction({
                title: 'Purge this account now',
                body: 'Ends the 30 days in which this traveller could come back. The account is erased within the hour and cannot be restored. Only for a legal erasure request.',
                confirmLabel: 'Purge now',
                run: async ({ reason }) => {
                  await runCommand('force_purge_account', { uid, reason }, me.uid);
                  await client.invalidateQueries({ queryKey });
                },
              })
            }
          >
            Purge now
          </button>
        </div>
      )}
      {/* Mounted only while open: the page has its own reason dialog with the same field. */}
      {action !== null && <ActionDialog action={action} onClose={() => setAction(null)} />}
    </div>
  );
}
