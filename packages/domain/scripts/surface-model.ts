/**
 * The zod → field model shared by the Swift and Kotlin emitters of gen-surfaces.ts: object fields
 * with their wire name, camelCase name, optionality and one of the supported field kinds.
 */
import type { z } from 'zod';

interface Def {
  readonly type: string;
  readonly format?: string;
  readonly shape?: Record<string, z.ZodType>;
  readonly innerType?: z.ZodType;
  readonly element?: z.ZodType;
  readonly valueType?: z.ZodType;
  readonly values?: readonly unknown[];
  readonly entries?: Record<string, string>;
}

export type Field =
  | { kind: 'string' | 'int' | 'double' | 'bool' | 'json' }
  | { kind: 'enum'; name: string; values: readonly string[] }
  | { kind: 'object'; name: string }
  | { kind: 'array' | 'record'; of: Field }
  | { kind: 'literal'; value: number | string };

export interface Prop {
  readonly wire: string;
  readonly name: string;
  readonly field: Field;
  readonly optional: boolean;
}

const def = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;
export const camel = (wire: string) =>
  wire.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pascal = (wire: string) => camel(wire).replace(/^./, (c) => c.toUpperCase());

let names = new Map<z.ZodType, string>();
let enums = new Map<string, readonly string[]>();

/** `z.int()` carries the format itself; `z.number().int()` adds it as a check. */
function isInteger(schema: z.ZodType): boolean {
  const { format } = schema as { format?: string | null };
  return format === 'safeint' || format === 'int32';
}

function fieldOf(schema: z.ZodType, owner: string, wire: string): Field {
  const d = def(schema);
  switch (d.type) {
    case 'string':
      return { kind: 'string' };
    case 'number':
      return { kind: isInteger(schema) ? 'int' : 'double' };
    case 'boolean':
      return { kind: 'bool' };
    case 'lazy':
      return { kind: 'json' };
    case 'literal': {
      const value = d.values?.[0];
      if (typeof value !== 'number' && typeof value !== 'string')
        throw new Error(`${owner}.${wire}`);
      return { kind: 'literal', value };
    }
    case 'enum': {
      const name = `${owner}${pascal(wire)}`;
      enums.set(name, Object.values(d.entries ?? {}));
      return { kind: 'enum', name, values: Object.values(d.entries ?? {}) };
    }
    case 'array':
      return { kind: 'array', of: fieldOf(d.element as z.ZodType, owner, wire) };
    case 'record':
      return { kind: 'record', of: fieldOf(d.valueType as z.ZodType, owner, wire) };
    case 'object': {
      const name = names.get(schema);
      if (name === undefined) throw new Error(`nested object ${owner}.${wire} needs a TYPES entry`);
      return { kind: 'object', name };
    }
    default:
      throw new Error(`unsupported zod type ${d.type} at ${owner}.${wire}`);
  }
}

function propsOf(name: string, schema: z.ZodType): Prop[] {
  return Object.entries(def(schema).shape ?? {}).map(([wire, fieldSchema]) => {
    const d = def(fieldSchema);
    const optional = d.type === 'optional' || d.type === 'nullable';
    const inner = optional ? (d.innerType as z.ZodType) : fieldSchema;
    return { wire, name: camel(wire), field: fieldOf(inner, name, wire), optional };
  });
}

export interface Model {
  readonly name: string;
  readonly props: readonly Prop[];
}

export interface SurfaceModels {
  readonly models: readonly Model[];
  /** Enum type name → wire values, named `<Type><Field>`. */
  readonly enums: ReadonlyMap<string, readonly string[]>;
}

/** Top-level types in output order; nested object schemas must be listed to get a name. */
export function buildModels(types: readonly (readonly [string, z.ZodType])[]): SurfaceModels {
  names = new Map(types.map(([name, schema]) => [schema, name]));
  enums = new Map();
  const models = types.map(([name, schema]) => ({ name, props: propsOf(name, schema) }));
  return { models, enums };
}
