/**
 * Generates the Swift `ActivityAttributes` types from the zod contracts, so the widget extension,
 * the app's native module and the server all decode the same shapes. ActivityKit pairs an app's
 * activity with the extension's `ActivityConfiguration` by the attributes type's name, which is
 * why both targets compile an identical copy (apps/mobile writes both from `renderLaSwift()`).
 *
 * Covers the zod subset the contracts use: objects, strings, integers, numbers, booleans, string
 * enums, arrays and nullable fields.
 */
import type { z } from 'zod';

export interface LaSwiftType {
  /** Swift type name, e.g. `LeaveByActivityAttributes`. */
  readonly name: string;
  /** Prefix for the nested enums and structs, e.g. `LALeaveBy`. */
  readonly prefix: string;
  readonly attributes: z.ZodType;
  readonly contentState: z.ZodType;
}

interface Def {
  readonly type: string;
  readonly shape?: Record<string, z.ZodType>;
  readonly element?: z.ZodType;
  readonly innerType?: z.ZodType;
  readonly entries?: Record<string, string>;
}

const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;

const SWIFT_KEYWORDS = new Set([
  'default',
  'case',
  'in',
  'is',
  'as',
  'return',
  'where',
  'switch',
  'public',
  'private',
  'internal',
  'open',
  'self',
  'static',
  'struct',
  'enum',
  'let',
  'var',
  'func',
  'init',
]);

export const swiftCamel = (wire: string): string =>
  wire.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());

const pascal = (wire: string): string => {
  const camel = swiftCamel(wire);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

const ident = (name: string): string => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name);

const singular = (wire: string): string => {
  if (wire.endsWith('ies')) return `${wire.slice(0, -3)}y`;
  if (wire.endsWith('s')) return wire.slice(0, -1);
  return wire;
};

interface Emitter {
  readonly nested: string[];
  /**
   * Reader mode (the widget snapshot): enums as plain `String`, so one unknown value never fails
   * the whole decode, and defaulted fields optional, so a file written before they existed reads.
   */
  readonly lenientEnums?: boolean;
}

function swiftType(schema: z.ZodType, prefix: string, field: string, out: Emitter): string {
  const def = defOf(schema);
  switch (def.type) {
    case 'nullable':
    case 'optional':
      return `${swiftType(def.innerType as z.ZodType, prefix, field, out)}?`;
    case 'default': {
      // A reader of a file a newer writer extends may meet a file written before the field
      // existed: the field is optional there.
      const inner = swiftType(def.innerType as z.ZodType, prefix, field, out);
      return out.lenientEnums === true && !inner.endsWith('?') ? `${inner}?` : inner;
    }
    case 'string':
      return 'String';
    case 'boolean':
      return 'Bool';
    case 'number':
      return (schema as unknown as { isInt?: boolean }).isInt === true ? 'Int' : 'Double';
    case 'literal': {
      const values = (def as unknown as { values: readonly unknown[] }).values;
      const first = values[0];
      if (typeof first === 'number') return Number.isInteger(first) ? 'Int' : 'Double';
      if (typeof first === 'boolean') return 'Bool';
      return 'String';
    }
    case 'enum': {
      if (out.lenientEnums === true) return 'String';
      const name = `${prefix}${pascal(field)}`;
      const cases = Object.values(def.entries ?? {}).map(
        (value) => `    case ${ident(swiftCamel(value))} = "${value}"`,
      );
      out.nested.push(
        [`public enum ${name}: String, Codable, Hashable, Sendable {`, ...cases, '}'].join('\n'),
      );
      return name;
    }
    case 'array':
      return `[${swiftType(def.element as z.ZodType, prefix, singular(field), out)}]`;
    case 'object': {
      const name = `${prefix}${pascal(field)}`;
      out.nested.push(renderStruct(name, schema, prefix, out, '', 'Codable, Hashable, Sendable'));
      return name;
    }
    default:
      throw new Error(`renderLaSwift: unsupported zod type "${def.type}" at ${field}`);
  }
}

function renderStruct(
  name: string,
  schema: z.ZodType,
  prefix: string,
  out: Emitter,
  indent: string,
  conformances: string,
  inner: string[] = [],
): string {
  const shape = defOf(schema).shape ?? {};
  const props = Object.entries(shape).map(([wire, child]) => ({
    wire,
    name: swiftCamel(wire),
    type: swiftType(child, prefix, wire, out),
  }));
  const lines = [`${indent}public struct ${name}: ${conformances} {`, ...inner];
  for (const prop of props) lines.push(`${indent}    public var ${ident(prop.name)}: ${prop.type}`);
  lines.push('', `${indent}    enum CodingKeys: String, CodingKey {`);
  for (const prop of props)
    lines.push(`${indent}        case ${ident(prop.name)} = "${prop.wire}"`);
  lines.push(`${indent}    }`, `${indent}}`);
  return lines.join('\n');
}

/** One Swift file declaring every activity's attributes, ContentState and nested types. */
export function renderLaSwift(types: readonly LaSwiftType[], header: string): string {
  const blocks: string[] = [];
  for (const type of types) {
    const out: Emitter = { nested: [] };
    const state = renderStruct(
      'ContentState',
      type.contentState,
      type.prefix,
      out,
      '    ',
      'Codable, Hashable, Sendable',
    );
    const attributes = renderStruct(
      type.name,
      type.attributes,
      type.prefix,
      out,
      '',
      'ActivityAttributes, Hashable, Sendable',
      [state, ''],
    );
    blocks.push(...out.nested, attributes);
  }
  return [header, '', 'import ActivityKit', 'import Foundation', '', blocks.join('\n\n'), ''].join(
    '\n',
  );
}

/**
 * One Swift file declaring a plain `Decodable` document type (and its nested types) from a zod
 * object, for App Group files an extension only reads. Enums decode as `String`, and a field the
 * Swift type does not name is ignored by `JSONDecoder`, so a newer writer never breaks an older
 * reader.
 */
export function renderSwiftDocument(
  name: string,
  schema: z.ZodType,
  prefix: string,
  header: string,
): string {
  const out: Emitter = { nested: [], lenientEnums: true };
  const root = renderStruct(name, schema, prefix, out, '', 'Codable, Hashable, Sendable');
  return [header, '', 'import Foundation', '', [...out.nested, root].join('\n\n'), ''].join('\n');
}
