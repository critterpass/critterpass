/**
 * Merges the per-category DTCG source files into one raw tree and resolves `{path.to.token}`
 * alias strings to their target token's own resolved value, depth-first with cycle detection.
 * Schema validation (schema.ts) happens on the *output* of this module, never on raw aliases.
 */

export interface RawTokenNode {
  readonly $type: string;
  readonly $value: unknown;
  readonly $description?: string;
}

export type RawTree = { readonly [key: string]: RawTree | RawTokenNode };
type MutableRawTree = { [key: string]: RawTree | RawTokenNode };

export interface DeclaredToken {
  readonly path: string;
  readonly type: string;
  readonly value: unknown;
  readonly description: string | undefined;
}

export interface ResolveResult {
  readonly tree: Record<string, unknown>;
  readonly declarations: readonly DeclaredToken[];
}

const ALIAS_PATTERN = /^\{([a-zA-Z0-9_.]+)\}$/;

export function isTokenNode(node: unknown): node is RawTokenNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    Object.hasOwn(node, '$type') &&
    Object.hasOwn(node, '$value') &&
    typeof (node as Record<string, unknown>)['$type'] === 'string'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges raw category trees; later files win on a literal key clash (none expected today). */
export function mergeRawTrees(trees: readonly RawTree[]): RawTree {
  const out: MutableRawTree = {};
  for (const tree of trees) {
    for (const [key, value] of Object.entries(tree)) {
      const existing = out[key];
      if (isPlainObject(existing) && !isTokenNode(existing) && isPlainObject(value) && !isTokenNode(value)) {
        out[key] = mergeRawTrees([existing, value]);
      } else {
        out[key] = value;
      }
    }
  }
  return out;
}

function getNodeAtPath(tree: RawTree, path: string): RawTree | RawTokenNode | undefined {
  let node: RawTree | RawTokenNode | undefined = tree;
  for (const part of path.split('.')) {
    if (node === undefined || isTokenNode(node)) return undefined;
    node = (node as Record<string, RawTree | RawTokenNode | undefined>)[part];
  }
  return node;
}

class AliasResolver {
  private readonly cache = new Map<string, unknown>();
  private readonly resolving = new Set<string>();

  constructor(private readonly tree: RawTree) {}

  /** Resolves a `{path}` alias string, looking the target node up by splitting `path` on `.`. */
  resolvePath(path: string): unknown {
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;
    const node = getNodeAtPath(this.tree, path);
    if (node === undefined) {
      throw new Error(`design-tokens: unresolved alias "{${path}}" (no token at that path)`);
    }
    if (!isTokenNode(node)) {
      throw new Error(`design-tokens: alias "{${path}}" points to a group of tokens, not a single token`);
    }
    return this.resolveKnownNode(path, node);
  }

  /**
   * Resolves a token whose node the caller already has in hand (from a tree walk), so it never
   * re-derives the node by splitting `path` on `.` — object keys may themselves contain literal
   * dots (e.g. the sound cue id `"thud.heavy"`), which would make that split ambiguous.
   */
  resolveKnownNode(path: string, node: RawTokenNode): unknown {
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;
    if (this.resolving.has(path)) {
      throw new Error(`design-tokens: alias cycle detected at "${path}"`);
    }
    this.resolving.add(path);
    const resolved = this.resolveValue(node.$value);
    this.resolving.delete(path);
    this.cache.set(path, resolved);
    return resolved;
  }

  resolveValue(raw: unknown): unknown {
    if (typeof raw === 'string') {
      const match = ALIAS_PATTERN.exec(raw);
      const aliasPath = match?.[1];
      return aliasPath !== undefined ? this.resolvePath(aliasPath) : raw;
    }
    if (Array.isArray(raw)) return raw.map((item) => this.resolveValue(item));
    if (isPlainObject(raw)) {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) out[key] = this.resolveValue(value);
      return out;
    }
    return raw;
  }
}

const TOKEN_MARKER_KEYS = ['$type', '$value', '$description'] as const;

/** Catches authoring mistakes (e.g. a `$value` with no `$type`) that would otherwise silently vanish. */
function hasAnyTokenMarker(node: Record<string, unknown>): boolean {
  return TOKEN_MARKER_KEYS.some((key) => Object.hasOwn(node, key));
}

/** Resolves every alias in `tree`, returning a plain value tree plus a flat list of declared tokens. */
export function resolveTokenTree(tree: RawTree): ResolveResult {
  const resolver = new AliasResolver(tree);
  const declarations: DeclaredToken[] = [];

  function walk(node: unknown, path: readonly string[]): unknown {
    if (isTokenNode(node)) {
      const fullPath = path.join('.');
      const value = resolver.resolveKnownNode(fullPath, node);
      declarations.push({ path: fullPath, type: node.$type, value, description: node.$description });
      return value;
    }
    const label = path.length > 0 ? path.join('.') : '(root)';
    if (!isPlainObject(node)) {
      throw new Error(`design-tokens: expected a token or a group of tokens at "${label}", got ${typeof node}`);
    }
    if (hasAnyTokenMarker(node)) {
      throw new Error(`design-tokens: malformed token at "${label}" (has $type/$value/$description partially set)`);
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) out[key] = walk(child, [...path, key]);
    return out;
  }

  const plainTree = walk(tree, []) as Record<string, unknown>;
  return { tree: plainTree, declarations };
}

/** Reads a dot path out of a resolved plain value tree (used by callers that need one leaf value). */
export function getResolvedValue(tree: Record<string, unknown>, path: string): unknown {
  let node: unknown = tree;
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) return undefined;
    node = node[part];
  }
  return node;
}
