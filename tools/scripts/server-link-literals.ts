import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  APP_SCHEMES,
  appRoutePattern,
  ROUTE_PARAM,
  ROUTE_REST,
  type AppRoutePattern,
} from '@cp/domain';
import ts from 'typescript';

/**
 * Finds in-app links a service writes by hand. Services link the app's screens only through the
 * builders in `packages/domain/src/links/app-links.ts`, whose samples the app checks against its
 * route files; a path typed into a push, an inbox row or a redirect skips that check and can name
 * a screen that does not exist.
 *
 * A string or template literal is a hand-written link when it
 * - sits in a `deepLink` / `deep_link` / `deeplink` field as a path or a URL,
 * - is a URL under the app's scheme (`critterpass://getting-around`, `${scheme}://setup/…`),
 * - starts with `/app/`, the web form of an in-app route, or
 * - is a path that one of the app's route files matches (`/crew/${id}/chat`).
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const APP_DIR = path.join(REPO_ROOT, 'apps/mobile/src/app');

/** Stands for a `${…}` in a template. */
const HOLE = '\u0000';
const LINK_FIELD = /^(?:deepLink|deep_link|deeplink)$/u;
const SCHEME_URL = new RegExp(`^(${APP_SCHEMES.join('|')}|${HOLE}):/(/[^/].*)$`, 'u');

export interface LinkLiteral {
  readonly file: string;
  readonly line: number;
  /** The literal as written, `${…}` for each expression. */
  readonly text: string;
  readonly why: 'link field' | 'app scheme' | 'web app path' | 'app route';
}

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const file = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), file) : [file];
  });
}

/** The app's screens, read from its route files. */
export function appRoutes(): AppRoutePattern[] {
  return listFiles(APP_DIR)
    .map(appRoutePattern)
    .filter((route): route is AppRoutePattern => route !== null);
}

/**
 * Whether a route file matches a written path. An expression fills a route parameter only; a typed
 * segment fills a static segment, or a parameter after the first segment (`/guide/new`), so
 * `/v1/places` is never read as a trip's `/<trip id>/places`.
 */
function namesRoute(routes: readonly AppRoutePattern[], written: string): boolean {
  const cut = written.search(/[?#]/u);
  const segments = (cut === -1 ? written : written.slice(0, cut))
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => (segment.includes(HOLE) ? HOLE : segment));
  if (!segments.some((segment) => segment !== HOLE)) return false;
  return routes.some((route) => {
    const rest = route.segments[route.segments.length - 1] === ROUTE_REST;
    const fixed = rest ? route.segments.slice(0, -1) : route.segments;
    if (rest ? segments.length <= fixed.length : segments.length !== fixed.length) return false;
    if (!fixed.some((segment) => segment !== ROUTE_PARAM)) return false;
    return fixed.every((segment, index) => {
      const part = segments[index];
      if (segment !== ROUTE_PARAM) return part === segment;
      return part === HOLE || index > 0;
    });
  });
}

function reasonFor(text: string, routes: readonly AppRoutePattern[]): LinkLiteral['why'] | null {
  const url = SCHEME_URL.exec(text);
  if (url !== null) {
    // An expression for the scheme may be any URL: it is a link when the rest names a screen.
    return url[1] !== HOLE || namesRoute(routes, url[2] ?? '') ? 'app scheme' : null;
  }
  if (/^\/app\/./u.test(text)) return 'web app path';
  if (text.startsWith('/') && namesRoute(routes, text)) return 'app route';
  return null;
}

function textOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => HOLE + span.literal.text).join('');
  }
  return null;
}

/** The literals an expression can evaluate to, not those it passes to a function. */
function valueLiterals(node: ts.Node, found: ts.Node[] = []): ts.Node[] {
  if (textOf(node) !== null) found.push(node);
  else if (!ts.isCallExpression(node) && !ts.isFunctionLike(node)) {
    node.forEachChild((child) => {
      valueLiterals(child, found);
    });
  }
  return found;
}

function fieldName(node: ts.Node): string | null {
  if (ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node)) {
    const name = node.name;
    return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
  }
  return null;
}

/** The hand-written in-app links of one source file. */
export function linkLiteralsIn(
  file: string,
  source: string,
  routes: readonly AppRoutePattern[],
): LinkLiteral[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found = new Map<number, LinkLiteral>();
  const report = (node: ts.Node, why: LinkLiteral['why']) => {
    if (found.has(node.getStart())) return;
    found.set(node.getStart(), {
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      text: (textOf(node) ?? '').replaceAll(HOLE, '${…}'),
      why,
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const name = fieldName(node);
    if (name !== null && LINK_FIELD.test(name)) {
      const value = (node as ts.PropertyAssignment | ts.VariableDeclaration).initializer;
      for (const literal of value === undefined ? [] : valueLiterals(value)) {
        const text = textOf(literal) ?? '';
        if (text.startsWith('/') || text.includes('://')) report(literal, 'link field');
      }
    }
    const text = textOf(node);
    const why = text === null ? null : reasonFor(text, routes);
    if (why !== null) report(node, why);
    node.forEachChild(visit);
  };
  visit(tree);
  return [...found.values()];
}

const SOURCE_FILE = /^services\/[^/]+\/src\/.+\.tsx?$/u;
const TEST_FILE = /(?:^|\/)(?:__tests__|test-support|fixtures)\/|\.test\.tsx?$/u;

/** Whether the guard reads a file: a service's source, its tests aside. */
export function isServiceSource(file: string): boolean {
  return SOURCE_FILE.test(file) && !TEST_FILE.test(file);
}

/** Every hand-written in-app link under `services/<service>/src`. */
export function serverLinkLiterals(): LinkLiteral[] {
  const routes = appRoutes();
  return listFiles(path.join(REPO_ROOT, 'services'), 'services')
    .filter(isServiceSource)
    .flatMap((file) =>
      linkLiteralsIn(file, readFileSync(path.join(REPO_ROOT, file), 'utf8'), routes),
    );
}
