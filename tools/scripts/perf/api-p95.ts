/**
 * Server latency from Grafana's Prometheus (the same metrics the dashboards use): command round
 * trip p95 and api → database p50 over a window on one environment.
 */
export const QUERIES = {
  commandP95Ms: (env: string, window: string) =>
    `histogram_quantile(0.95, sum by (le) (rate(cp_cmd_duration_ms_milliseconds_bucket{deployment_environment_name="${env}"}[${window}])))`,
  dbP50Ms: (env: string, window: string) =>
    `histogram_quantile(0.5, sum by (le) (rate(db_client_operation_duration_seconds_bucket{service_name="api",deployment_environment_name="${env}"}[${window}]))) * 1000`,
} as const;

/** Reads an instant vector's single value; undefined when the series is empty or NaN. */
export function scalarFrom(body: unknown): number | undefined {
  const result = (body as { data?: { result?: { value?: [number, string] }[] } }).data?.result;
  const raw = result?.[0]?.value?.[1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function queryGrafana(
  grafanaUrl: string,
  token: string,
  datasourceUid: string,
  expr: string,
): Promise<number | undefined> {
  const url = `${grafanaUrl.replace(/\/$/u, '')}/api/datasources/proxy/uid/${datasourceUid}/api/v1/query?query=${encodeURIComponent(expr)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`grafana query failed: ${response.status}`);
  return scalarFrom(await response.json());
}
