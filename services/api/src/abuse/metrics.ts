/**
 * `otp_sent_total{country,channel}` and `otp_verify_ratio`. No OpenTelemetry SDK/
 * exporter is wired anywhere in this service yet (no `@opentelemetry/*` dependency exists in
 * services/api/package.json), so this is a small facade with the shape a real OTel `Counter`/
 * `ObservableGauge` would have: services/api/src/auth/otp/router.ts and the verify path call it
 * unconditionally, and whichever later phase adds the real SDK only has to replace
 * `createInMemoryOtpMetrics`'s implementation, not every call site.
 */
export interface OtpMetrics {
  recordOtpSent(country: string, channel: string): void;
  recordOtpVerifyOutcome(success: boolean): void;
}

export interface OtpMetricsSnapshot {
  readonly sentByCountryAndChannel: ReadonlyMap<string, number>;
  readonly verifySuccessCount: number;
  readonly verifyFailureCount: number;
  readonly verifyRatio: number | undefined;
}

function sentKey(country: string, channel: string): string {
  return `${country}:${channel}`;
}

/** In-memory default: correct within one process, not a substitute for a real exporter once one exists. Exposes `snapshot()` for tests and for a future `/metrics`-style read. */
export function createInMemoryOtpMetrics(): OtpMetrics & { snapshot(): OtpMetricsSnapshot } {
  const sentByCountryAndChannel = new Map<string, number>();
  let verifySuccessCount = 0;
  let verifyFailureCount = 0;

  return {
    recordOtpSent(country, channel) {
      const key = sentKey(country, channel);
      sentByCountryAndChannel.set(key, (sentByCountryAndChannel.get(key) ?? 0) + 1);
    },
    recordOtpVerifyOutcome(success) {
      if (success) verifySuccessCount += 1;
      else verifyFailureCount += 1;
    },
    snapshot() {
      const total = verifySuccessCount + verifyFailureCount;
      return {
        sentByCountryAndChannel: new Map(sentByCountryAndChannel),
        verifySuccessCount,
        verifyFailureCount,
        verifyRatio: total > 0 ? verifySuccessCount / total : undefined,
      };
    },
  };
}

/** A metrics sink that discards everything — the default until a caller opts into `createInMemoryOtpMetrics()` or a real exporter. */
export function createNoopOtpMetrics(): OtpMetrics {
  return { recordOtpSent: () => undefined, recordOtpVerifyOutcome: () => undefined };
}
