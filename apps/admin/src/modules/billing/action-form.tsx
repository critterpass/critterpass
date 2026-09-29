/**
 * A small audited action form: named text fields, one button, the command's error inline. Used
 * for recording an Offer Code batch and giving a trip promotional Boost.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

export interface ActionField {
  readonly name: string;
  readonly label: string;
  readonly numeric?: boolean;
  readonly initial?: string;
}

export function ActionForm({
  title,
  command,
  fields,
  submit,
}: {
  title: string;
  command: string;
  fields: readonly ActionField[];
  submit: string;
}) {
  const me = useOperator();
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.name, field.initial ?? ''])),
  );
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const run = async () => {
    setError(null);
    setDone(false);
    const payload = Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.numeric ? Number(values[field.name]) : values[field.name],
      ]),
    );
    try {
      await runCommand(command, payload, me.uid);
      setDone(true);
      await client.invalidateQueries({ queryKey: ['billing'] });
    } catch (caught) {
      setError(caught);
    }
  };
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <div className="state-title">{title}</div>
      {fields.map((field) => (
        <div key={field.name} className="field">
          <label className="field-label" htmlFor={`${command}-${field.name}`}>
            {field.label}
          </label>
          <input
            id={`${command}-${field.name}`}
            type={field.numeric ? 'number' : 'text'}
            value={values[field.name]}
            onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
          />
        </div>
      ))}
      {error !== null && <ErrorState error={error} />}
      {done && (
        <span className="badge" data-tone="success">
          Done
        </span>
      )}
      <button type="submit" className="button">
        {submit}
      </button>
    </form>
  );
}
