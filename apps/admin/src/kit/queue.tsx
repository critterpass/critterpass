/**
 * Work-queue view for a `defineQueue` definition: status tabs, a keyset list, the focused item's
 * preview and its actions. Keyboard-first: `j`/`k` move the focus, each action's shortcut runs it.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { QueueDefinition } from './registry';
import { EmptyState, ErrorState, LoadingState } from './states';
import { POLL_MS } from './table';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function QueueView<Item>({ queue }: { queue: QueueDefinition<Item> }) {
  const [status, setStatus] = useState(queue.statuses[0] ?? '');
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const key = ['queue', queue.kind, status] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => queue.load(status, undefined),
    refetchInterval: POLL_MS,
  });
  const items = query.data?.items ?? [];
  const current = items[Math.min(focus, items.length - 1)];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || busy) return;
      if (event.key === 'j') setFocus((index) => Math.min(index + 1, items.length - 1));
      else if (event.key === 'k') setFocus((index) => Math.max(index - 1, 0));
      else {
        const action = queue.actions.find((candidate) => candidate.shortcut === event.key);
        if (action && current !== undefined) {
          setBusy(true);
          void action
            .run(current)
            .then(() => client.invalidateQueries({ queryKey: key }))
            .finally(() => setBusy(false));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="Status">
        {queue.statuses.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={candidate === status}
            className={candidate === status ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStatus(candidate);
              setFocus(0);
            }}
          >
            {candidate.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="split">
          <ul
            className="stack"
            aria-label={`${queue.kind} queue`}
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
          >
            {items.map((item, index) => (
              <li key={queue.itemId(item)}>
                <button
                  type="button"
                  className="card"
                  data-selected={item === current}
                  style={{ width: '100%', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
                  onClick={() => setFocus(index)}
                >
                  {queue.title(item)}
                </button>
              </li>
            ))}
          </ul>
          {current !== undefined && (
            <div className="card stack">
              {queue.preview(current)}
              <div className="row">
                {queue.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    className={action.tone === 'danger' ? 'btn btn-danger' : 'btn'}
                    onClick={() => {
                      setBusy(true);
                      void action
                        .run(current)
                        .then(() => client.invalidateQueries({ queryKey: key }))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {action.label}
                    {action.shortcut ? ` (${action.shortcut})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
