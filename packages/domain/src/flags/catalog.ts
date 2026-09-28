/**
 * Typed PostHog feature flags and experiments. Each flag has a safe hard-coded default that
 * applies whenever PostHog is unreachable, the flag is missing, or it returns a value outside the
 * catalog, so a PostHog outage is a kill switch, never an error.
 *
 * What lives where: business configuration (free guide limit, seat cap, supplier flags, perk
 * lists) is `ops_config`, changed with `set_feature_flag` from the ops console; UX experiments and
 * rollout switches live here in PostHog; paywall price and offering tests run in RevenueCat
 * Experiments.
 */
export type FlagOwner = 'analytics' | 'app' | 'guide' | 'growth' | 'trip';

export interface BooleanFlagDefinition {
  readonly kind: 'boolean';
  readonly default: boolean;
  readonly owner: FlagOwner;
  readonly description: string;
}

export interface VariantFlagDefinition<V extends string = string> {
  readonly kind: 'variant';
  readonly variants: readonly [V, ...V[]];
  /** Always the control variant. */
  readonly default: V;
  readonly owner: FlagOwner;
  readonly description: string;
}

export type FlagDefinition = BooleanFlagDefinition | VariantFlagDefinition;
export type FlagCatalog = Readonly<Record<string, FlagDefinition>>;

export const FLAG_CATALOG = {
  'analytics.replay': {
    kind: 'boolean',
    default: false,
    owner: 'analytics',
    description:
      'Masked, sampled session replay of onboarding and paywall; off until counsel review.',
  },
  'location.always_upsell': {
    kind: 'boolean',
    default: true,
    owner: 'trip',
    description:
      'Offer the Always location upgrade after a first encounter or turning on the crew map; off = While-In-Use sessions only (kill switch if review pushes back).',
  },
  'location.android_background_geofences': {
    kind: 'boolean',
    default: false,
    owner: 'trip',
    description:
      'Android background geofences (needs "Allow all the time"); off until the Play background-location declaration is approved. The foreground-service session ships regardless.',
  },
} as const satisfies FlagCatalog;

export type FlagKey = keyof typeof FLAG_CATALOG;
export type FlagValueOf<D extends FlagDefinition> =
  D extends VariantFlagDefinition<infer V> ? V : boolean;
export type FlagValues<C extends FlagCatalog = typeof FLAG_CATALOG> = {
  readonly [K in keyof C]: FlagValueOf<C[K]>;
};

export const FLAG_KEYS = Object.keys(FLAG_CATALOG) as FlagKey[];

function definitionOf(catalog: FlagCatalog, key: string): FlagDefinition {
  const definition = catalog[key];
  if (definition === undefined) throw new Error(`unknown flag ${key}`);
  return definition;
}

/** The catalog default for `key`. */
export function flagDefault<C extends FlagCatalog, K extends keyof C & string>(
  key: K,
  catalog: C,
): FlagValueOf<C[K]> {
  return definitionOf(catalog, key).default as FlagValueOf<C[K]>;
}

/** Validates one PostHog value against the flag's definition; anything unexpected → default. */
export function coerceFlag<C extends FlagCatalog, K extends keyof C & string>(
  key: K,
  raw: unknown,
  catalog: C,
): FlagValueOf<C[K]> {
  const definition = definitionOf(catalog, key);
  if (definition.kind === 'boolean') {
    return (typeof raw === 'boolean' ? raw : definition.default) as FlagValueOf<C[K]>;
  }
  const valid = typeof raw === 'string' && (definition.variants as readonly string[]).includes(raw);
  return (valid ? raw : definition.default) as FlagValueOf<C[K]>;
}

/** Every catalog flag resolved from PostHog's evaluated values (undefined = unreachable). */
export function resolveFlags<C extends FlagCatalog = typeof FLAG_CATALOG>(
  evaluated: Readonly<Record<string, unknown>> | undefined,
  catalog: C = FLAG_CATALOG as unknown as C,
): FlagValues<C> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(catalog)) out[key] = coerceFlag(key, evaluated?.[key], catalog);
  return out as FlagValues<C>;
}

export function isFlagKey(key: string): key is FlagKey {
  return Object.hasOwn(FLAG_CATALOG, key);
}
