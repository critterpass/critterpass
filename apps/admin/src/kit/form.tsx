/**
 * Form generated from a zod object schema (./zod-fields). Shows a diff preview of the pending
 * changes before the operator saves; the caller decides what saving means (a command).
 */
import { useMemo, useState } from 'react';
import type { z } from 'zod';

import { diffValues, type FieldChange } from './diff';
import { DiffView } from './diff-view';
import {
  fieldsFromSchema,
  parseFormState,
  toFormState,
  type FormField,
  type FormState,
} from './zod-fields';

export interface SchemaFormProps {
  schema: z.ZodObject;
  readOnly?: readonly string[];
  initial: Record<string, unknown>;
  /** Pending values to start from (re-applying an edit after a conflict); diffed against `initial`. */
  draft?: Record<string, unknown> | undefined;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: Record<string, unknown>, changes: readonly FieldChange[]) => void;
  onChange?: (values: Record<string, unknown>) => void;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const id = `field-${field.name}`;
  if (field.kind === 'boolean') {
    return (
      <label className="toggle" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          disabled={field.readOnly}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  const common = {
    id,
    name: field.name,
    value: typeof value === 'string' ? value : '',
    readOnly: field.readOnly,
    'aria-required': field.required,
  };
  if (field.kind === 'select') {
    return (
      <select
        {...common}
        className="select"
        disabled={field.readOnly}
        onChange={(event) => onChange(event.target.value)}
      >
        {!field.required && <option value="">—</option>}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === 'json' || field.kind === 'longtext') {
    return (
      <textarea
        {...common}
        className="textarea"
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <input
      {...common}
      className="input"
      inputMode={field.kind === 'number' ? 'decimal' : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function SchemaForm(props: SchemaFormProps) {
  const fields = useMemo(
    () => fieldsFromSchema(props.schema, props.readOnly),
    [props.schema, props.readOnly],
  );
  const [state, setState] = useState<FormState>(() =>
    toFormState(fields, { ...props.initial, ...props.draft }),
  );
  const parsed = parseFormState(props.schema, fields, state);
  const baseline = useMemo(() => {
    const editable = fields.filter((field) => !field.readOnly).map((field) => field.name);
    return Object.fromEntries(editable.map((name) => [name, props.initial[name] ?? null]));
  }, [fields, props.initial]);
  const changes = parsed.ok ? diffValues(baseline, withNulls(parsed.values, baseline)) : [];

  const update = (name: string, value: string | boolean) => {
    const next = { ...state, [name]: value };
    setState(next);
    const result = parseFormState(props.schema, fields, next);
    if (result.ok) props.onChange?.(result.values);
  };

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed.ok && changes.length > 0) props.onSubmit(parsed.values, changes);
      }}
    >
      {fields.map((field) => (
        <div key={field.name} className="field">
          {field.kind !== 'boolean' && (
            <label className="field-label" htmlFor={`field-${field.name}`}>
              {field.label}
              {field.readOnly ? ' (locked)' : ''}
            </label>
          )}
          <FieldInput
            field={field}
            value={state[field.name] ?? ''}
            onChange={(value) => update(field.name, value)}
          />
          {!parsed.ok && parsed.errors[field.name] !== undefined && (
            <span className="field-error">{parsed.errors[field.name]}</span>
          )}
        </div>
      ))}
      <div className="card stack">
        <div className="field-label">Changes to save</div>
        <DiffView changes={changes} />
      </div>
      <div className="row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!parsed.ok || changes.length === 0 || props.busy === true}
        >
          {props.submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Fields the operator cleared are sent as absent; compare them to the baseline as null. */
function withNulls(
  values: Record<string, unknown>,
  baseline: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.keys(baseline).map((key) => [key, values[key] ?? null]));
}
