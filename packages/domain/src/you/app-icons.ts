/**
 * The alternate app icon catalogue (3n-5, docs/design-system.md "alternate icons row"): four styles
 * (FACE free, PASSPORT default, STAMP Pass+, STICKER free) in four appearances, plus earned icons
 * that are never sold. Ids match the icon bake (`packages/critter-bake` `APP_ICON_IDS`) and the
 * native alternate-icon names; an appearance other than AUTO is a forced variant shipped as its
 * own alternate icon (`passport.dark`).
 */
import { z } from 'zod';

export const APP_ICON_STYLES = ['face', 'passport', 'stamp', 'sticker'] as const;
export const EARNED_APP_ICONS = [
  'temple',
  'sardi',
  'home-set',
  'pon',
  'golden',
  'bali-six',
] as const;
export const APP_ICON_BASE_IDS = [...APP_ICON_STYLES, ...EARNED_APP_ICONS] as const;
export type AppIconBaseId = (typeof APP_ICON_BASE_IDS)[number];

export const APP_ICON_APPEARANCES = ['auto', 'light', 'dark', 'tinted'] as const;
export type AppIconAppearance = (typeof APP_ICON_APPEARANCES)[number];

export const DEFAULT_APP_ICON: AppIconBaseId = 'passport';

export type AppIconGate = 'free' | 'pass_plus' | 'earned';

export interface AppIconEntry {
  readonly id: AppIconBaseId;
  readonly gate: AppIconGate;
  /** How an earned icon unlocks (`app_icon_unlocks.source`); styles have none. */
  readonly unlockSource?: AppIconUnlockSource;
}

export const APP_ICON_UNLOCK_SOURCES = ['form_found', 'crew_achievement', 'home_set'] as const;
export type AppIconUnlockSource = (typeof APP_ICON_UNLOCK_SOURCES)[number];

export const APP_ICON_CATALOGUE: readonly AppIconEntry[] = [
  { id: 'face', gate: 'free' },
  { id: 'passport', gate: 'free' },
  { id: 'stamp', gate: 'pass_plus' },
  { id: 'sticker', gate: 'free' },
  { id: 'temple', gate: 'earned', unlockSource: 'form_found' },
  { id: 'sardi', gate: 'earned', unlockSource: 'form_found' },
  { id: 'home-set', gate: 'earned', unlockSource: 'home_set' },
  { id: 'pon', gate: 'earned', unlockSource: 'form_found' },
  { id: 'golden', gate: 'earned', unlockSource: 'form_found' },
  { id: 'bali-six', gate: 'earned', unlockSource: 'crew_achievement' },
];

/**
 * What a verified find opens: a named form (Temple Tokek, Golden Tokek, Sakura Pon) by its
 * catalogue key, or any form of a critter (Sardi). Keys are the content release's (`cp-112:rare`,
 * `cp-076`).
 */
export interface AppIconFormUnlock {
  readonly icon: AppIconBaseId;
  readonly formKey?: string;
  readonly critterKey?: string;
}

export const APP_ICON_FORM_UNLOCKS: readonly AppIconFormUnlock[] = [
  { icon: 'temple', formKey: 'cp-112:rare' },
  { icon: 'golden', formKey: 'cp-112:legendary' },
  { icon: 'pon', formKey: 'cp-061:legendary' },
  { icon: 'sardi', critterKey: 'cp-076' },
];

/** The earned icons a find of this form opens (none for most forms). */
export function appIconsForFind(find: {
  readonly formKey: string;
  readonly critterKey: string;
}): readonly AppIconBaseId[] {
  return APP_ICON_FORM_UNLOCKS.filter(
    (rule) => rule.formKey === find.formKey || rule.critterKey === find.critterKey,
  ).map((rule) => rule.icon);
}

const BY_ID = new Map(APP_ICON_CATALOGUE.map((entry) => [entry.id, entry]));

export function appIconEntry(id: AppIconBaseId): AppIconEntry {
  const entry = BY_ID.get(id);
  if (entry === undefined) throw new Error(`unknown app icon ${id}`);
  return entry;
}

/** `passport` for AUTO, `passport.dark` for a forced appearance: the stored and native name. */
export function appIconKey(id: AppIconBaseId, appearance: AppIconAppearance): string {
  return appearance === 'auto' ? id : `${id}.${appearance}`;
}

export function parseAppIconKey(
  key: string,
): { readonly id: AppIconBaseId; readonly appearance: AppIconAppearance } | null {
  const [id, appearance = 'auto', extra] = key.split('.');
  if (extra !== undefined) return null;
  if (!(APP_ICON_BASE_IDS as readonly string[]).includes(id ?? '')) return null;
  if (!(APP_ICON_APPEARANCES as readonly string[]).includes(appearance)) return null;
  if (appearance === 'auto' && key.includes('.')) return null;
  return { id: id as AppIconBaseId, appearance: appearance as AppIconAppearance };
}

export interface AppIconAccess {
  readonly passPlus: boolean;
  /** Earned icon ids in `app_icon_unlocks` for the user. */
  readonly unlocked: ReadonlySet<string>;
}

export type AppIconDenial = 'pass_plus_required' | 'not_unlocked';

/** Why the icon may not be chosen, or `null` when it may. Avatars are never gated; icons are. */
export function appIconDenial(id: AppIconBaseId, access: AppIconAccess): AppIconDenial | null {
  const entry = appIconEntry(id);
  if (entry.gate === 'pass_plus' && !access.passPlus) return 'pass_plus_required';
  if (entry.gate === 'earned' && !access.unlocked.has(id)) return 'not_unlocked';
  return null;
}

/** "k of n unlocked" on 3n-3: free styles, Pass+ styles while active, and earned unlocks. */
export function appIconUnlockedCount(access: AppIconAccess): {
  readonly unlocked: number;
  readonly total: number;
} {
  const unlocked = APP_ICON_CATALOGUE.filter((entry) => appIconDenial(entry.id, access) === null);
  return { unlocked: unlocked.length, total: APP_ICON_CATALOGUE.length };
}

/**
 * The icon to fall back to on foreground when a Pass+ style is showing and Pass+ has expired
 * (paused keeps styles), or `null` when the current icon may stay.
 */
export function lapsedAppIconFallback(
  current: string | null,
  passPlusExpired: boolean,
): AppIconBaseId | null {
  if (current === null || !passPlusExpired) return null;
  const parsed = parseAppIconKey(current);
  if (parsed === null) return DEFAULT_APP_ICON;
  return appIconEntry(parsed.id).gate === 'pass_plus' ? DEFAULT_APP_ICON : null;
}

export const setAppIconPayloadSchema = z
  .object({
    icon_id: z.enum(APP_ICON_BASE_IDS),
    appearance: z.enum(APP_ICON_APPEARANCES).default('auto'),
  })
  .strict();
export type SetAppIconPayload = z.infer<typeof setAppIconPayloadSchema>;
