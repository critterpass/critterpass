import type { DeskTask } from '@cp/domain';

function span(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d`;
}

/** "due in 1 h 20 min" / "overdue by 5 min" / "no due time". */
export function dueLabel(task: DeskTask, now: Date = new Date()): string {
  if (task.due_at === null) return 'no due time';
  const left = new Date(task.due_at).getTime() - now.getTime();
  return left < 0 ? `overdue by ${span(left)}` : `due in ${span(left)}`;
}
