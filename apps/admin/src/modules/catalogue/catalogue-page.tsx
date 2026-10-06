/**
 * Catalogue editor: pick a kind, search and page its items, edit one in a form generated from its
 * schema with a diff preview, and save through `upsert_catalogue_item`. A save against a stale
 * version shows the server's values beside the operator's edit and lets them re-apply it.
 */
import {
  CATALOGUE_KINDS,
  adminPageSchema,
  catalogueItemSchema,
  type CatalogueItem,
  type CatalogueKind,
} from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useState } from 'react';

import { PageHeader } from '../../app/shell';
import { diffValues, type FieldChange } from '../../kit/diff';
import { SchemaForm } from '../../kit/form';
import { ConflictState, ErrorState, LoadingState } from '../../kit/states';
import { DataTable } from '../../kit/table';
import { getJson, isApiError, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { CATALOGUES, blankValues } from './definitions';

const pageSchema = adminPageSchema(catalogueItemSchema);

type Selection = { kind: 'existing'; id: string } | { kind: 'new' } | null;

interface Conflict {
  changes: readonly FieldChange[];
  draft: Record<string, unknown>;
  cause: unknown;
}

function Editor({
  kind,
  selection,
  onSaved,
}: {
  kind: CatalogueKind;
  selection: Exclude<Selection, null>;
  onSaved: (id: string) => void;
}) {
  const me = useOperator();
  const client = useQueryClient();
  const catalogue = CATALOGUES[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | undefined>(undefined);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const itemId = selection.kind === 'existing' ? selection.id : null;
  const item = useQuery({
    queryKey: ['catalogue', kind, 'item', itemId],
    queryFn: () => getJson(`/v1/admin/catalogue/${kind}/${itemId ?? ''}`, catalogueItemSchema),
    enabled: itemId !== null,
  });

  if (itemId !== null && item.isPending) return <LoadingState />;
  if (itemId !== null && item.isError) {
    return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  }
  const current: CatalogueItem | undefined = item.data;
  const initial = current ? catalogue.values(current) : blankValues(catalogue.schema);
  const Preview = catalogue.preview;

  const save = async (values: Record<string, unknown>, mine: readonly FieldChange[]) => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await runCommand(
        'upsert_catalogue_item',
        {
          kind,
          ...(current ? { id: current.id } : {}),
          version: current?.version ?? null,
          data: values,
        },
        me.uid,
      );
      const saved = (outcome.result as { id?: string } | undefined)?.id ?? current?.id ?? '';
      setDraft(undefined);
      await client.invalidateQueries({ queryKey: ['catalogue', kind] });
      onSaved(saved);
    } catch (caught) {
      if (isApiError(caught, 'VERSION_CONFLICT')) {
        const server = (caught.detail as { current?: Record<string, unknown> } | undefined)
          ?.current;
        // Re-apply only the fields this operator changed, on top of whatever the server has now.
        const draft = Object.fromEntries(mine.map((change) => [change.field, change.after]));
        setConflict({ changes: diffValues(server ?? {}, values), draft, cause: caught });
      } else setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (conflict !== null) {
    return (
      <ConflictState
        changes={conflict.changes}
        cause={conflict.cause}
        onReload={() => {
          setDraft(conflict.draft);
          setConflict(null);
          void item.refetch();
        }}
      />
    );
  }

  return (
    <div className="card stack">
      <div className="state-title">{current ? current.title : `New ${catalogue.label}`}</div>
      {current && <div className="mono muted">version {current.version}</div>}
      {Preview && (
        <Suspense fallback={<LoadingState rows={2} />}>
          <Preview values={preview ?? { ...initial, ...draft }} />
        </Suspense>
      )}
      <SchemaForm
        key={`${current?.version ?? 'new'}:${draft ? 'draft' : 'clean'}`}
        schema={catalogue.schema}
        readOnly={catalogue.readOnly ?? []}
        initial={initial}
        draft={draft}
        submitLabel="Save"
        busy={busy}
        onChange={setPreview}
        onSubmit={(values, changes) => void save(values, changes)}
      />
      {error !== null && <ErrorState error={error} />}
    </div>
  );
}

export function CataloguePage() {
  const [kind, setKind] = useState<CatalogueKind>('guides');
  const [q, setQ] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const catalogue = CATALOGUES[kind];

  return (
    <div className="stack">
      <PageHeader
        title="Catalogue"
        subtitle="Guides, destinations and places the app ships with."
        actions={
          catalogue.creatable ? (
            <button type="button" className="btn" onClick={() => setSelection({ kind: 'new' })}>
              New {catalogue.label.replace(/s$/, '')}
            </button>
          ) : undefined
        }
      />
      <div className="tabs" role="tablist" aria-label="Catalogue kind">
        {CATALOGUE_KINDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={candidate === kind}
            className={candidate === kind ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setKind(candidate);
              setSelection(null);
            }}
          >
            {CATALOGUES[candidate].label}
          </button>
        ))}
      </div>
      <div className="split">
        <div className="stack">
          <input
            className="input"
            type="search"
            placeholder={`Search ${catalogue.label.toLowerCase()} by name`}
            aria-label="Search by name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <DataTable
            label={catalogue.label}
            queryKey={['catalogue', kind, 'list', q]}
            load={(cursor) => {
              const params = new URLSearchParams({ limit: '25' });
              if (q.trim() !== '') params.set('q', q.trim());
              if (cursor !== undefined) params.set('cursor', cursor);
              return getJson(`/v1/admin/catalogue/${kind}?${params.toString()}`, pageSchema);
            }}
            columns={catalogue.columns.map((column) => ({
              id: column.id,
              label: column.label,
              render: column.value,
            }))}
            rowId={catalogue.itemId}
            selectedId={selection?.kind === 'existing' ? selection.id : undefined}
            onSelect={(item) => setSelection({ kind: 'existing', id: item.id })}
            emptyTitle={`No ${catalogue.label.toLowerCase()} yet`}
          />
        </div>
        {selection === null ? (
          <div className="card state">Pick a row to edit it.</div>
        ) : (
          <Editor
            key={`${kind}:${selection.kind === 'existing' ? selection.id : 'new'}`}
            kind={kind}
            selection={selection}
            onSaved={(id) => setSelection({ kind: 'existing', id })}
          />
        )}
      </div>
    </div>
  );
}
