/**
 * The closed vocabulary the entitlement engine enforces against (docs/product-decisions.md's final
 * entitlement matrix): each key names one boolean gate `packages/entitlements` computes and
 * `entitle(ctx, {kind: 'capability', ...})` checks. This is deliberately narrower and code-owned,
 * unlike the server-driven `perks` rows (marketing copy the app renders, which stay withdrawable
 * without an app release) — a paywall references one of these keys to say *what* was required, and
 * a `perks` row to say *how it is described*.
 */
import { z } from 'zod';

export const CAPABILITY_KEYS = [
  'pass_plus',
  'boost_active',
  'guide_unlimited',
  'icon_styles_all',
  'next_flight_widget',
  'mailbox_import',
  'spoken_readout',
  'printed_postcard_sender',
  'live_map',
  'help_map',
] as const;

export const capabilityKeySchema = z.enum(CAPABILITY_KEYS);
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;
