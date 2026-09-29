/** What the billing console says about its numbers (pure, so the rules are tested). */
import { EXTEND_RENEWAL_MAX_PER_YEAR, type BillingHealth } from '@cp/domain';

export type Tone = 'danger' | 'warn' | 'success' | undefined;

export interface Tile {
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
}

export function healthTiles(health: BillingHealth): Tile[] {
  const lag = health.webhook_lag_p95_ms;
  const run = health.reconcile;
  return [
    {
      label: 'Webhook lag p95 (24 h)',
      value: lag === null ? '—' : lag < 1000 ? `${lag} ms` : `${(lag / 1000).toFixed(1)} s`,
      tone: lag !== null && lag > 60_000 ? 'warn' : undefined,
    },
    {
      label: 'Failed webhooks (24 h)',
      value: String(health.failed_24h),
      tone: health.failed_24h > 0 ? 'danger' : 'success',
    },
    {
      label: 'Reconcile drift',
      value: run === null ? 'never run' : `${run.drifted} of ${run.checked}`,
      tone: run === null || run.failed > 0 ? 'warn' : run.drifted > 0 ? 'warn' : 'success',
    },
    {
      label: 'First trip free to review',
      value: String(health.ftf_to_review),
      tone: health.ftf_to_review > 0 ? 'warn' : undefined,
    },
  ];
}

/** "1 of 2 used": App Store extensions left for a customer this year. */
export function extensionQuota(used: number): { label: string; left: number } {
  const capped = Math.min(used, EXTEND_RENEWAL_MAX_PER_YEAR);
  return {
    label: `${capped} of ${EXTEND_RENEWAL_MAX_PER_YEAR} used`,
    left: EXTEND_RENEWAL_MAX_PER_YEAR - capped,
  };
}
