/**
 * Derives form fields from a zod object schema so every catalogue kind gets an editor without
 * hand-written forms: strings → text, numbers → number, booleans → toggle, enums → select, and
 * anything structured (records, arrays, nested objects) → a JSON editor validated on submit.
 */
import { z } from 'zod';

export type FieldKind = 'text' | 'longtext' | 'number' | 'boolean' | 'select' | 'json';

export interface FormField {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly options: readonly string[];
  readonly readOnly: boolean;
}

const LONG_TEXT_MIN = 200;

function unwrap(schema: z.ZodType): { inner: z.ZodType; optional: boolean; nullable: boolean } {
  let inner = schema;
  let optional = false;
  let nullable = false;
  for (;;) {
    if (inner instanceof z.ZodOptional) {
      optional = true;
      inner = inner.unwrap() as z.ZodType;
    } else if (inner instanceof z.ZodNullable) {
      nullable = true;
      inner = inner.unwrap() as z.ZodType;
    } else if (inner instanceof z.ZodDefault) {
      optional = true;
      inner = inner.unwrap() as z.ZodType;
    } else {
      return { inner, optional, nullable };
    }
  }
}

function humanize(name: string): string {
  const words = name.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function kindOf(schema: z.ZodType): { kind: FieldKind; options: readonly string[] } {
  if (schema instanceof z.ZodString) {
    const max = schema.maxLength ?? 0;
    return { kind: max === 0 || max >= LONG_TEXT_MIN ? 'longtext' : 'text', options: [] };
  }
  if (schema instanceof z.ZodNumber) return { kind: 'number', options: [] };
  if (schema instanceof z.ZodBoolean) return { kind: 'boolean', options: [] };
  if (schema instanceof z.ZodEnum) {
    return { kind: 'select', options: (schema.options as readonly unknown[]).map(String) };
  }
  return { kind: 'json', options: [] };
}

export function fieldsFromSchema(
  schema: z.ZodObject,
  readOnly: readonly string[] = [],
): readonly FormField[] {
  return Object.entries(schema.shape).map(([name, field]) => {
    const { inner, optional, nullable } = unwrap(field as z.ZodType);
    const { kind, options } = kindOf(inner);
    return {
      name,
      label: (field as z.ZodType).description ?? inner.description ?? humanize(name),
      kind,
      required: !optional && !nullable,
      nullable,
      options,
      readOnly: readOnly.includes(name),
    };
  });
}

/** Form state is strings (inputs) and booleans (toggles); JSON fields hold their pretty text. */
export type FormState = Record<string, string | boolean>;

export function toFormState(
  fields: readonly FormField[],
  values: Record<string, unknown>,
): FormState {
  const state: FormState = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === 'boolean') state[field.name] = value === true;
    else if (field.kind === 'json') state[field.name] = JSON.stringify(value ?? null, null, 2);
    else
      state[field.name] =
        typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  }
  return state;
}

export type ParsedForm =
  | { readonly ok: true; readonly values: Record<string, unknown> }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

/** Converts form state back to typed values and validates them with the schema. */
export function parseFormState(
  schema: z.ZodObject,
  fields: readonly FormField[],
  state: FormState,
): ParsedForm {
  const raw: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    const value = state[field.name];
    if (field.kind === 'boolean') {
      raw[field.name] = value === true;
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') {
      if (field.nullable) raw[field.name] = null;
      continue;
    }
    if (field.kind === 'number') raw[field.name] = Number(text);
    else if (field.kind === 'json') {
      try {
        raw[field.name] = JSON.parse(text) as unknown;
      } catch {
        errors[field.name] = 'Not valid JSON';
      }
    } else raw[field.name] = text;
  }
  const editable = schema.omit(
    Object.fromEntries(fields.filter((f) => f.readOnly).map((f) => [f.name, true])) as never,
  );
  const parsed = editable.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      errors[key] ??= issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, values: parsed.data };
}
