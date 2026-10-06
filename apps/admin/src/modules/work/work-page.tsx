/**
 * My work (Ops-My-Work): everything assigned to me across queues, overdue / due in the next two
 * hours / later, filter chips per queue, up-for-grabs items in my areas with TAKE, and done today.
 * Keys: j/k move, enter opens, u hands the focused item back.
 */
import type { WorkItem } from '@cp/domain';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import gecko from '../../assets/stickers/gecko.webp';
import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { AREA_PATH, dueLabel, useAvailableWork, useMyWork, useWorkAction } from './work-data';

const SECTIONS = [
  { id: 'overdue', label: 'Overdue', tone: 'urgent' },
  { id: 'due_soon', label: 'Due in the next 2 hours', tone: 'warn' },
  { id: 'later', label: 'Later', tone: 'plain' },
] as const;

function WorkRow({
  item,
  focused,
  onOpen,
}: {
  item: WorkItem;
  focused: boolean;
  onOpen: () => void;
}) {
  const due = dueLabel(item.due_at, new Date());
  return (
    <div className="work-row" data-focused={focused} aria-current={focused ? 'true' : undefined}>
      <span className="queue-tag">{item.queue.replaceAll('_', ' ')}</span>
      <span className="work-title">{item.title}</span>
      <span className="work-due mono" data-late={due.endsWith('late')}>
        {due}
      </span>
      <button type="button" className="btn btn-primary" onClick={onOpen}>
        Open
      </button>
    </div>
  );
}

export function WorkPage() {
  const mine = useMyWork();
  const available = useAvailableWork();
  const act = useWorkAction();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);

  const all = useMemo(
    () => (mine.data ? [...mine.data.overdue, ...mine.data.due_soon, ...mine.data.later] : []),
    [mine.data],
  );
  const queues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of all) counts.set(item.queue, (counts.get(item.queue) ?? 0) + 1);
    return [...counts];
  }, [all]);
  const visible = all.filter((item) => queue === null || item.queue === queue);
  const open = (item: WorkItem) => void navigate({ to: AREA_PATH[item.area] ?? '/' });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const item = visible[focus];
      if (event.key === 'j') setFocus((index) => Math.min(index + 1, visible.length - 1));
      else if (event.key === 'k') setFocus((index) => Math.max(index - 1, 0));
      else if (event.key === 'Enter' && item !== undefined) open(item);
      else if (event.key === 'u' && item !== undefined) void act('release', item);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (mine.isPending) return <LoadingState />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="You"
        title="My work"
        subtitle="Everything assigned to you across queues, soonest due first."
        actions={
          <div className="chips" role="tablist" aria-label="Queues">
            <button
              type="button"
              role="tab"
              className="chip"
              aria-selected={queue === null}
              onClick={() => setQueue(null)}
            >
              All {all.length}
            </button>
            {queues.map(([name, count]) => (
              <button
                key={name}
                type="button"
                role="tab"
                className="chip"
                aria-selected={queue === name}
                onClick={() => setQueue(name)}
              >
                {name.replaceAll('_', ' ')} {count}
              </button>
            ))}
          </div>
        }
      />
      <div className="work-layout">
        <div className="stack">
          {all.length === 0 && (
            <div className="card">
              <EmptyState title="Nothing assigned to you">
                TAKE an item from up for grabs, or see what was handled today in the audit log.
              </EmptyState>
            </div>
          )}
          {SECTIONS.map((section) => {
            const items = mine.data[section.id].filter(
              (item) => queue === null || item.queue === queue,
            );
            if (items.length === 0) return null;
            return (
              <section key={section.id} className="stack" aria-label={section.label}>
                <div className="section-label" data-tone={section.tone}>
                  <span className="dot" aria-hidden="true" /> {section.label} {items.length}
                </div>
                <div className="card work-list">
                  {items.map((item) => (
                    <WorkRow
                      key={`${item.queue}:${item.item_id}`}
                      item={item}
                      focused={visible[focus] === item}
                      onOpen={() => open(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          <p className="muted keys">
            <kbd>j</kbd> <kbd>k</kbd> move · <kbd>enter</kbd> open · <kbd>u</kbd> hand back
          </p>
        </div>
        <aside className="stack">
          <section className="card stack" aria-label="Up for grabs">
            <div className="section-label">
              Up for grabs · your areas {available.data?.items.length ?? ''}
            </div>
            {available.data?.items.length === 0 && <p className="muted">Nothing unclaimed.</p>}
            {available.data?.items.slice(0, 8).map((item) => (
              <div key={`${item.queue}:${item.item_id}`} className="grab-row">
                <div>
                  <div className="section-label">{item.area}</div>
                  <div className="work-title">{item.title}</div>
                  <div className="mono muted">{dueLabel(item.due_at, new Date())}</div>
                </div>
                <button type="button" className="btn" onClick={() => void act('claim', item)}>
                  Take
                </button>
              </div>
            ))}
          </section>
          <section className="card done-card" aria-label="Done today">
            <img src={gecko} alt="" width={72} height={72} className="state-sticker" />
            <div>
              <div className="done-count">{mine.data.done_today} done today</div>
              <div className="scribble">
                {all.length === 0 ? 'All clear.' : `${all.length} more and you've cleared it.`}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
