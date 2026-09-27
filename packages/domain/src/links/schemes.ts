/**
 * Custom-scheme links (`critterpass://…`) used by notifications, widgets, Live Activities and other
 * extensions, which open the app directly and never go through the web. The part after `://` is
 * either a link-grammar path (`critterpass://i/ABC234`) or an in-app route
 * (`critterpass://trip/<id>/day/2`), which maps to the generic `app` kind.
 */
import { APP_LINK_PATH_PREFIXES, linkPath, parseLinkPath, type LinkTarget } from './grammar';
import { LINK_ENVIRONMENT_CONFIG, LINK_ENVIRONMENTS, type LinkEnvironment } from './hosts';

export const APP_SCHEMES: readonly string[] = LINK_ENVIRONMENTS.map(
  (env) => LINK_ENVIRONMENT_CONFIG[env].scheme,
);

const SCHEME_URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;

/** Parses `critterpass://…` (any variant's scheme); null for other schemes or unknown paths. */
export function parseSchemeUrl(input: string): LinkTarget | null {
  const match = SCHEME_URL_PATTERN.exec(input.trim());
  if (match === null) return null;
  const scheme = (match[1] ?? '').toLowerCase();
  if (!APP_SCHEMES.includes(scheme)) return null;
  const rest = (match[2] ?? '').split(/[?#]/)[0] ?? '';
  const path = `/${rest.replace(/^\/+/, '')}`;
  const first = path.split('/')[1] ?? '';
  if (APP_LINK_PATH_PREFIXES.includes(first)) return parseLinkPath(path);
  return parseLinkPath(`/app${path}`);
}

export function buildSchemeUrl(target: LinkTarget, env: LinkEnvironment): string {
  const scheme = LINK_ENVIRONMENT_CONFIG[env].scheme;
  // An in-app route is written bare unless its first segment would read as a link kind.
  const bareAppRoute =
    target.kind === 'app' && !APP_LINK_PATH_PREFIXES.includes(target.path.split('/')[0] ?? '');
  const path = bareAppRoute ? `/${target.path}` : linkPath(target);
  return `${scheme}:/${path}`;
}
