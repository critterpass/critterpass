/**
 * Audit log: every console action, newest first, read-only. Owners can export the filtered log
 * as CSV and manage operator roles below it.
 */
import { auditExportSchema, auditPageSchema, type AuditEntry } from '@cp/domain';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { ErrorState } from '../../kit/states';
import { DataTable } from '../../kit/table';
import { getJson } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { FilterBar, toQuery, type AuditFilters } from './filters';
import { TargetLink } from './target-link';

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function detailText(entry: AuditEntry): string {
  if (entry.detail === null) return '';
  return Object.entries(entry.detail)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}

export function AuditPage() {
  const me = useOperator();
  const owner = me.roles.includes('owner');
  const [filters, setFilters] = useState<AuditFilters>({});
  const [exportError, setExportError] = useState<unknown>(null);
  const query = toQuery(filters);

  const exportCsv = async () => {
    setExportError(null);
    try {
      const file = await getJson(`/v1/admin/audit/export?${query}`, auditExportSchema);
      download(file.filename, file.csv);
    } catch (caught) {
      setExportError(caught);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Audit log"
        subtitle="Every console action, as it happened. Rows can never be changed or deleted."
        actions={
          owner ? (
            <button type="button" className="btn" onClick={() => void exportCsv()}>
              Export CSV
            </button>
          ) : undefined
        }
      />
      {exportError !== null && <ErrorState error={exportError} title="Export failed" />}
      <FilterBar onApply={setFilters} />
      <DataTable<AuditEntry>
        key={query}
        label="Audit entries"
        queryKey={['audit', query]}
        load={(cursor) =>
          getJson(
            `/v1/admin/audit?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            auditPageSchema,
          )
        }
        rowId={(entry) => entry.id}
        emptyTitle="No matching actions"
        columns={[
          { id: 'at', label: 'When', render: (entry) => new Date(entry.at).toLocaleString() },
          { id: 'admin', label: 'Operator', render: (entry) => entry.admin },
          {
            id: 'action',
            label: 'Action',
            render: (entry) => <span className="mono">{entry.action}</span>,
          },
          {
            id: 'target',
            label: 'Target',
            render: (entry) => (
              <span>
                {entry.target_kind} <TargetLink entry={entry} />
              </span>
            ),
          },
          { id: 'reason', label: 'Reason', render: (entry) => entry.reason ?? '' },
          {
            id: 'detail',
            label: 'Detail',
            render: (entry) => <span className="muted">{detailText(entry)}</span>,
          },
        ]}
      />
    </div>
  );
}
