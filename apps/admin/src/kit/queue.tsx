/**
 * Work-queue view for a `defineQueue` definition: status tabs, a keyset list, the focused item's
 * preview and its actions. Keyboard-first: `j`/`k` move the focus, each action's shortcut runs it
 * (or opens its confirm). Actions an item does not support are hidden for that item.
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

export function QueueView<Item>({ queue }: { queue: QueueDefinition<Item> }) {
  const [status, setStatus] = useState(queue.statuses[0] ?? '');
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<QueueAction<Item> | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const client = useQueryClient();
  const key = ['queue', queue.kind, status] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => queue.load(status, undefined),
    refetchInterval: POLL_MS,
  });
  const items = query.data?.items ?? [];
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
        <EmptyState title={queue.emptyTitle ?? 'Nothing waiting'} />
      ) : (
        <div className="split">
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
          {current !== undefined && (
            <div className="card stack">
              {queue.preview(current)}
              {actions.length > 0 && (
                <div className="row">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={busy}
                      className={action.tone === 'danger' ? 'btn btn-danger' : 'btn'}
                      onClick={() => start(action, current)}
                    >
                      {action.label}
                      {action.shortcut ? ` (${action.shortcut})` : ''}
                    </button>
                  ))}
                </div>
              )}
              {failure !== null && <ErrorState error={failure} />}
            </div>
          )}
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
