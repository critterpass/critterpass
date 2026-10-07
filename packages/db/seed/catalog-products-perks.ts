/**
 * Products, perks and the `ops_config` entitlement/fair-use keys (docs/product-decisions.md §3
 * "Products and codes"; the phase's own `ops_config keys` list). Idempotent: every insert is
 * `ON CONFLICT DO UPDATE`, so re-running keeps existing rows current with this file rather than
 * skipping (unlike the throwaway crew/trip seeds, this is real catalogue data every environment,
 * including staging and production, needs seeded the same way).
 */
import type pg from 'pg';

import { withSystem } from '../src/tx';

interface SeedProduct {
  readonly key: string;
  readonly type: 'auto_renew_sub' | 'consumable' | 'non_renewing';
  /** Capability keys (`@cp/domain` `CapabilityKey`) this product's paywall copy lists as unlocked. */
  readonly grants: readonly string[];
}

const PASS_PLUS_GRANTS = [
  'pass_plus',
  'icon_styles_all',
  'next_flight_widget',
  'mailbox_import',
  'spoken_readout',
  'printed_postcard_sender',
  'guide_unlimited',
] as const;

const BOOST_GRANTS = ['boost_active', 'guide_unlimited', 'live_map'] as const;

/** The closed product set (docs/product-decisions.md §3); store ids arrive once RevenueCat/
 * StoreKit/Play are wired up (`products.store_ids` stays `{}` until then). */
const PRODUCTS: readonly SeedProduct[] = [
  { key: 'pass_monthly', type: 'auto_renew_sub', grants: PASS_PLUS_GRANTS },
  { key: 'pass_yearly', type: 'auto_renew_sub', grants: PASS_PLUS_GRANTS },
  { key: 'boost_trip', type: 'consumable', grants: BOOST_GRANTS },
  // Crew yearly's buyer gets Pass+ everywhere plus Boost-equivalent on the crew's own trips.
  {
    key: 'boost_crew_year',
    type: 'auto_renew_sub',
    grants: [...PASS_PLUS_GRANTS, ...BOOST_GRANTS],
  },
  { key: 'gift_pass_3m', type: 'non_renewing', grants: PASS_PLUS_GRANTS },
];

interface SeedPerk {
  readonly key: string;
  readonly tier: 'pass_plus' | 'boost' | 'ftf' | 'crew_year';
  readonly copyKey: string;
  readonly sort: number;
}

/** The perk lines the app has words for (the same rows the perks catalogue migration writes, so a
 * seeded database and a migrated one agree); every perk ships at launch, so `is_shipped` is true. */
const perk = (key: string, tier: SeedPerk['tier'], sort: number): SeedPerk => ({
  key,
  tier,
  copyKey: `monetize.perks.${key}`,
  sort,
});

const PERKS: readonly SeedPerk[] = [
  perk('pass_plus_guide_unlimited', 'pass_plus', 10),
  perk('pass_plus_mailbox_import', 'pass_plus', 20),
  perk('pass_plus_icon_styles', 'pass_plus', 30),
  perk('pass_plus_no_sponsored', 'pass_plus', 40),
  perk('pass_plus_next_flight', 'pass_plus', 50),
  perk('pass_plus_read_out', 'pass_plus', 60),
  perk('pass_plus_postcard', 'pass_plus', 70),
  perk('boost_redrafts', 'boost', 110),
  perk('boost_live_map', 'boost', 120),
  perk('boost_seats', 'boost', 130),
  perk('boost_guide_unlimited', 'boost', 140),
  perk('boost_no_sponsored', 'boost', 150),
  perk('ftf_first_trip_free', 'ftf', 210),
  perk('crew_year_everywhere', 'crew_year', 310),
];

interface SeedOpsConfig {
  readonly key: string;
  readonly value: unknown;
  /** Client-visible via `client_config` (visible limits the app renders); fair-use caps stay
   * server-only, matching docs/product-decisions.md §3's "never shown as a limit". */
  readonly isPublic: boolean;
}

const OPS_CONFIG: readonly SeedOpsConfig[] = [
  { key: 'guide.free_daily_limit', value: 30, isPublic: true },
  { key: 'seat.cap_free', value: 6, isPublic: true },
  { key: 'seat.cap_boost', value: 16, isPublic: true },
  { key: 'redraft.limit_free', value: 3, isPublic: true },
  { key: 'billing.grace_days', value: 7, isPublic: false },
  { key: 'fair_use.guide_turns_per_user_day', value: 300, isPublic: false },
  { key: 'fair_use.crew_chat_per_crew_day', value: 400, isPublic: false },
  { key: 'fair_use.redrafts_per_trip_day', value: 20, isPublic: false },
  { key: 'fair_use.system_jobs_per_trip_day', value: 40, isPublic: false },
  { key: 'fair_use.search_parse_per_day', value: 100, isPublic: false },
  { key: 'fair_use.link_import_per_day', value: 30, isPublic: false },
  { key: 'fair_use.place_compromise_per_day', value: 20, isPublic: false },
];

async function seedProducts(tx: pg.PoolClient): Promise<void> {
  for (const product of PRODUCTS) {
    await tx.query(
      `INSERT INTO products (key, type, grants) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (key) DO UPDATE SET type = EXCLUDED.type, grants = EXCLUDED.grants`,
      [product.key, product.type, JSON.stringify(product.grants)],
    );
  }
}

async function seedPerks(tx: pg.PoolClient): Promise<void> {
  for (const perk of PERKS) {
    await tx.query(
      `INSERT INTO perks (key, tier, copy_key, is_shipped, sort) VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (key) DO UPDATE SET
         tier = EXCLUDED.tier, copy_key = EXCLUDED.copy_key, is_shipped = true, sort = EXCLUDED.sort`,
      [perk.key, perk.tier, perk.copyKey, perk.sort],
    );
  }
}

async function seedOpsConfig(tx: pg.PoolClient): Promise<void> {
  for (const entry of OPS_CONFIG) {
    await tx.query(
      `INSERT INTO ops.ops_config (key, value, is_public) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_public = EXCLUDED.is_public`,
      [entry.key, JSON.stringify(entry.value), entry.isPublic],
    );
  }
}

export async function seedCatalogProductsPerks(pool: pg.Pool): Promise<void> {
  await withSystem(pool, async (tx) => {
    await seedProducts(tx);
    await seedPerks(tx);
    await seedOpsConfig(tx);
  });
  console.log(
    `seed: catalog products/perks/ops_config up to date (${PRODUCTS.length} products, ${PERKS.length} perks, ${OPS_CONFIG.length} config keys)`,
  );
}
