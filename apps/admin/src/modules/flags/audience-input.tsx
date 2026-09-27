/**
 * Audience picker: everyone, a cohort, a list of user ids, or an app-version range. Scoped
 * audiences are resolved server-side and never reach `client_config`.
 */
import type { FlagAudience } from '@cp/domain';

const KINDS: ReadonlyArray<{ kind: FlagAudience['kind']; label: string }> = [
  { kind: 'all', label: 'Everyone' },
  { kind: 'cohort', label: 'Cohort' },
  { kind: 'uids', label: 'User ids' },
  { kind: 'app_version', label: 'App versions' },
];

function switchKind(kind: FlagAudience['kind']): FlagAudience {
  switch (kind) {
    case 'all':
      return { kind: 'all' };
    case 'cohort':
      return { kind: 'cohort', cohort: '' };
    case 'uids':
      return { kind: 'uids', uids: [] };
    case 'app_version':
      return { kind: 'app_version', min: '1.0.0' };
  }
}

export function describeAudience(audience: FlagAudience): string {
  switch (audience.kind) {
    case 'all':
      return 'Everyone';
    case 'cohort':
      return `Cohort ${audience.cohort}`;
    case 'uids':
      return `${audience.uids.length} user${audience.uids.length === 1 ? '' : 's'}`;
    case 'app_version':
      return `App ${audience.min ?? 'any'} – ${audience.max ?? 'any'}`;
  }
}

export function AudienceInput({
  value,
  onChange,
}: {
  value: FlagAudience;
  onChange: (audience: FlagAudience) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor="flag-audience">
        Audience
      </label>
      <select
        id="flag-audience"
        className="select"
        value={value.kind}
        onChange={(event) => onChange(switchKind(event.target.value as FlagAudience['kind']))}
      >
        {KINDS.map((option) => (
          <option key={option.kind} value={option.kind}>
            {option.label}
          </option>
        ))}
      </select>
      {value.kind === 'cohort' && (
        <input
          className="input"
          aria-label="Cohort name"
          value={value.cohort}
          onChange={(event) => onChange({ kind: 'cohort', cohort: event.target.value })}
        />
      )}
      {value.kind === 'uids' && (
        <textarea
          className="textarea"
          aria-label="User ids, one per line"
          value={value.uids.join('\n')}
          onChange={(event) =>
            onChange({
              kind: 'uids',
              uids: event.target.value
                .split(/\s+/)
                .map((uid) => uid.trim())
                .filter((uid) => uid.length > 0),
            })
          }
        />
      )}
      {value.kind === 'app_version' && (
        <div className="row">
          <input
            className="input"
            aria-label="Minimum app version"
            placeholder="min, e.g. 1.4.0"
            value={value.min ?? ''}
            onChange={(event) =>
              onChange({
                kind: 'app_version',
                ...(event.target.value ? { min: event.target.value } : {}),
                ...(value.max !== undefined ? { max: value.max } : {}),
              })
            }
          />
          <input
            className="input"
            aria-label="Maximum app version"
            placeholder="max, optional"
            value={value.max ?? ''}
            onChange={(event) =>
              onChange({
                kind: 'app_version',
                ...(value.min !== undefined ? { min: value.min } : {}),
                ...(event.target.value ? { max: event.target.value } : {}),
              })
            }
          />
        </div>
      )}
    </div>
  );
}
