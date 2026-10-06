/**
 * Editor for one typed config key: a value input shaped by the key's schema, the audience, a diff
 * preview, and a typed two-step confirm for critical keys. Saves with `set_feature_flag` at the
 * version the operator read; a stale version shows what changed on the server.
 */
import { configKey, flagAudienceSchema, type AdminFlag, type FlagAudience } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { ConfirmDialog } from '../../kit/confirm';
import { diffValues, formatValue, type FieldChange } from '../../kit/diff';
import { DiffView } from '../../kit/diff-view';
import { ConflictState, ErrorState } from '../../kit/states';
import { fieldsFromSchema } from '../../kit/zod-fields';
import { isApiError, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { AudienceInput } from './audience-input';

function parseValue(kind: string, raw: string | boolean): unknown {
  if (kind === 'boolean') return raw === true;
  if (kind === 'number') return raw === '' ? Number.NaN : Number(raw);
  return raw;
}

export function FlagEditor({ flag, onSaved }: { flag: AdminFlag; onSaved: () => void }) {
  const me = useOperator();
  const client = useQueryClient();
  const definition = configKey(flag.key);
  const field = definition
    ? fieldsFromSchema(z.object({ value: definition.schema }))[0]
    : undefined;
  const [raw, setRaw] = useState<string | boolean>(
    typeof flag.value === 'boolean'
      ? flag.value
      : flag.value === null
        ? ''
        : formatValue(flag.value),
  );
  const [audience, setAudience] = useState<FlagAudience>(flag.audience);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState<{
    changes: readonly FieldChange[];
    cause: unknown;
  } | null>(null);

  if (definition === undefined || field === undefined) return null;
  const value = parseValue(field.kind, raw);
  const valid =
    definition.schema.safeParse(value).success && flagAudienceSchema.safeParse(audience).success;
  const changes = diffValues({ value: flag.value, audience: flag.audience }, { value, audience });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await runCommand(
        'set_feature_flag',
        { key: flag.key, value, audience, version: flag.version },
        me.uid,
      );
      setConfirming(false);
      await client.invalidateQueries({ queryKey: ['flags'] });
      onSaved();
    } catch (caught) {
      setConfirming(false);
      if (isApiError(caught, 'VERSION_CONFLICT')) {
        const server = (caught.detail as { current?: Record<string, unknown> } | undefined)
          ?.current;
        setConflict({ changes: diffValues(server ?? {}, { value, audience }), cause: caught });
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
          setConflict(null);
          void client.invalidateQueries({ queryKey: ['flags'] });
        }}
      />
    );
  }

  if (flag.managed_by === 'partners') {
    return (
      <div className="card stack">
        <div className="state-title mono">{flag.key}</div>
        <div className="muted">
          This switch follows its partner adapter. Change it on the Partners page so the adapter and
          the app copy stay in step.
        </div>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="state-title mono">{flag.key}</div>
      <div className="muted">{flag.description}</div>
      <div className="field">
        <label className="field-label" htmlFor="flag-value">
          Value
        </label>
        {field.kind === 'boolean' ? (
          <label className="toggle">
            <input
              id="flag-value"
              type="checkbox"
              checked={raw === true}
              onChange={(event) => setRaw(event.target.checked)}
            />
            {raw === true ? 'On' : 'Off'}
          </label>
        ) : field.kind === 'select' ? (
          <select
            id="flag-value"
            className="select"
            value={String(raw)}
            onChange={(event) => setRaw(event.target.value)}
          >
            {field.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            id="flag-value"
            className="input"
            inputMode={field.kind === 'number' ? 'numeric' : undefined}
            value={String(raw)}
            onChange={(event) => setRaw(event.target.value)}
          />
        )}
      </div>
      <AudienceInput value={audience} onChange={setAudience} />
      {!definition.isPublic && <div className="muted">Server-only: never synced to the app.</div>}
      <div className="card stack">
        <div className="field-label">Changes to save</div>
        <DiffView changes={changes} />
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || changes.length === 0 || busy}
          onClick={() => (definition.critical ? setConfirming(true) : void save())}
        >
          Save
        </button>
      </div>
      {error !== null && <ErrorState error={error} />}
      <ConfirmDialog
        open={confirming}
        title="Change a critical setting"
        confirmLabel="Change it"
        tone="danger"
        requireText={flag.key}
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setConfirming(false)}
      >
        <div className="muted">This changes the live app for everyone it applies to.</div>
        <DiffView changes={changes} />
      </ConfirmDialog>
    </div>
  );
}
