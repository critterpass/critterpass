import { formatValue, type FieldChange } from './diff';

export function DiffView({
  changes,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: {
  changes: readonly FieldChange[];
  beforeLabel?: string;
  afterLabel?: string;
}) {
  if (changes.length === 0) return <div className="muted">No changes.</div>;
  return (
    <div className="diff" aria-label="Changes">
      <div className="diff-row muted">
        <span>Field</span>
        <span>{beforeLabel}</span>
        <span>{afterLabel}</span>
      </div>
      {changes.map((change) => (
        <div key={change.field} className="diff-row">
          <span className="mono">{change.field}</span>
          <span className="diff-before mono">{formatValue(change.before)}</span>
          <span className="diff-after mono">{formatValue(change.after)}</span>
        </div>
      ))}
    </div>
  );
}
