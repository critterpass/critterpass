/**
 * Work-queue view for a `defineQueue` definition: status tabs, optional filter chips with counts,
 * a keyset list, the focused item's detail with its actions, and an optional side column.
 * Keyboard-first: `j`/`k` move the focus, each action's shortcut runs it (or opens its confirm).
 * Actions an item does not support are hidden for that item.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ConfirmDialog } from './confirm';
import type { QueueAction, QueueDefinition } from './registry';
import { EmptyState, ErrorState, LoadingState } from './states';
import { POLL_MS } from './table';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

const total = (counts: Readonly<Record<string, number>>) =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

export function QueueView<Item>({ queue }: { queue: QueueDefinition<Item> }) {
  const [status, setStatus] = useState(queue.statuses[0] ?? '');
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<QueueAction<Item> | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const client = useQueryClient();
  const key = ['queue', queue.kind, status, filter ?? ''] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => queue.load(status, undefined, filter),
    refetchInterval: POLL_MS,
  });
  const items = query.data?.items ?? [];
  const counts = query.data?.counts;
  const current = items[Math.min(focus, items.length - 1)];
  const actions =
    current === undefined
      ? []
      : queue.actions.filter((action) => action.available?.(current) ?? true);

  const run = (action: QueueAction<Item>, item: Item) => {
    setBusy(true);
    setFailure(null);
    void action
      .run(item)
      .then(() => client.invalidateQueries({ queryKey: ['queue', queue.kind] }))
      .catch((error: unknown) => setFailure(error))
      .finally(() => {
        setBusy(false);
        setPending(null);
      });
  };
  const start = (action: QueueAction<Item>, item: Item) => {
    if (action.confirm) setPending(action);
    else run(action, item);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || busy || pending) return;
      if (event.key === 'j') setFocus((index) => Math.min(index + 1, items.length - 1));
      else if (event.key === 'k') setFocus((index) => Math.max(index - 1, 0));
      else {
        const action = actions.find((candidate) => candidate.shortcut === event.key);
        if (action && current !== undefined) start(action, current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const prompt = pending && current !== undefined ? pending.confirm?.(current) : undefined;
  const aside = current !== undefined ? queue.aside?.(current) : undefined;
  const chips = queue.filterLabel !== undefined && counts !== undefined ? counts : null;
  return (
    <div className="stack">
      <div className="queue-bar">
        {chips !== null ? (
          <div className="chips" role="group" aria-label="Kind">
            <button
              type="button"
              className="chip"
              aria-pressed={filter === undefined}
              onClick={() => {
                setFilter(undefined);
                setFocus(0);
              }}
            >
              All <span className="chip-count">{total(chips)}</span>
            </button>
            {Object.entries(chips)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id, count]) => (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={filter === id}
                  onClick={() => {
                    setFilter(id);
                    setFocus(0);
                  }}
                >
                  {queue.filterLabel?.(id) ?? id} <span className="chip-count">{count}</span>
                </button>
              ))}
          </div>
        ) : (
          <span />
        )}
        <div className="tabs queue-tabs" role="tablist" aria-label="Status">
          {queue.statuses.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={candidate === status}
              className={candidate === status ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setStatus(candidate);
                setFocus(0);
              }}
            >
              {queue.statusLabel?.(candidate) ?? candidate.replaceAll('_', ' ')}
              {candidate === status && counts !== undefined && (
                <span className="chip-count"> {total(counts)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={queue.emptyTitle ?? 'Nothing waiting'} />
      ) : (
        <div className="queue-layout" data-aside={aside !== undefined}>
          <div className="stack">
            {queue.listLabel !== undefined && (
              <div className="section-label queue-list-label">
                <span>{queue.listLabel}</span>
                <span>{items.length} shown</span>
              </div>
            )}
            <ul className="stack queue-list" aria-label={`${queue.kind} queue`}>
              {items.map((item, index) => (
                <li key={queue.itemId(item)}>
                  <button
                    type="button"
                    className="card queue-item"
                    data-selected={item === current}
                    onClick={() => setFocus(index)}
                  >
                    {queue.title(item)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {current !== undefined && (
            <div className="card stack queue-detail">
              {queue.preview(current)}
              {actions.length > 0 && (
                <div className="row queue-actions">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={busy}
                      className="btn verdict"
                      data-tone={action.tone ?? 'default'}
                      aria-label={
                        action.shortcut ? `${action.label} (${action.shortcut})` : action.label
                      }
                      onClick={() => start(action, current)}
                    >
                      {action.label}
                      {action.shortcut !== undefined && <kbd>{action.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              )}
              {failure !== null && <ErrorState error={failure} title="That didn’t go through" />}
            </div>
          )}
          {aside !== undefined && <div className="stack queue-aside">{aside}</div>}
        </div>
      )}
      <ConfirmDialog
        open={prompt !== undefined}
        title={prompt?.title ?? ''}
        confirmLabel={prompt?.label ?? 'Confirm'}
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (pending && current !== undefined) run(pending, current);
        }}
        onCancel={() => setPending(null)}
      >
        <div className="muted">{prompt?.body}</div>
      </ConfirmDialog>
    </div>
  );
}
