/**
 * Keyset-paginated table: pages are fetched by opaque cursor (`{items, next_cursor}`), with a
 * cursor stack for going back. Polls every 20 s while visible (the console has no realtime channel).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from './states';

export interface Column<Item> {
  readonly id: string;
  readonly label: string;
  readonly render: (item: Item) => ReactNode;
}

export interface KeysetPage<Item> {
  readonly items: readonly Item[];
  readonly next_cursor: string | null;
}

export interface DataTableProps<Item> {
  queryKey: readonly unknown[];
  load: (cursor: string | undefined) => Promise<KeysetPage<Item>>;
  columns: readonly Column<Item>[];
  rowId: (item: Item) => string;
  onSelect?: (item: Item) => void;
  selectedId?: string | undefined;
  emptyTitle?: string;
  label: string;
}

export const POLL_MS = 20_000;

export function DataTable<Item>(props: DataTableProps<Item>) {
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const query = useQuery({
    queryKey: [...props.queryKey, cursor ?? null],
    queryFn: () => props.load(cursor),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const page = query.data;
  if (page.items.length === 0 && cursors.length === 1) {
    return <EmptyState title={props.emptyTitle ?? 'Nothing waiting'} />;
  }

  return (
    <div className="table-wrap">
      <table className="table" aria-label={props.label}>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column.id} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.items.map((item) => {
            const id = props.rowId(item);
            return (
              <tr
                key={id}
                data-selected={props.selectedId === id}
                tabIndex={props.onSelect ? 0 : undefined}
                onClick={props.onSelect ? () => props.onSelect?.(item) : undefined}
                onKeyDown={(event) => {
                  if (props.onSelect && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    props.onSelect(item);
                  }
                }}
                style={props.onSelect ? { cursor: 'pointer' } : undefined}
              >
                {props.columns.map((column) => (
                  <td key={column.id}>{column.render(item)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="table-foot">
        <span>
          Page {cursors.length}
          {query.isFetching ? ' · refreshing' : ''}
        </span>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={cursors.length === 1}
            onClick={() => setCursors((stack) => stack.slice(0, -1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn"
            disabled={page.next_cursor === null}
            onClick={() => {
              const next = page.next_cursor;
              if (next !== null) setCursors((stack) => [...stack, next]);
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
