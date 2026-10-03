/**
 * Climate normals in the worker: the usual chance of rain by month and hour per destination,
 * from WeatherAPI history. Without `WEATHERAPI_KEY` the job is not registered and fit and the plan
 * check read forecasts only.
 */
import type { AnyJobDefinition } from '../../../boss';
import type { JobRegistryDeps } from '../../../job-registry';
import { createAuditedSupplierHttp } from '../../../travel-data';
import { fetchHistory } from '../../../travel-data/weatherapi-client';
import { climateNormalsJob } from './job';

export { climateNormalsJob, fillClimateNormals, type HistorySource } from './job';

export function climateJobs(deps: JobRegistryDeps): readonly AnyJobDefinition[] {
  const key = deps.env.WEATHERAPI_KEY;
  if (key === undefined) {
    deps.logger.warn({}, 'climate.normals is disabled: WEATHERAPI_KEY is unset');
    return [];
  }
  const http = createAuditedSupplierHttp(deps.pool, deps.logger);
  return [climateNormalsJob((query, signal) => fetchHistory(http, { key }, query, signal))];
}
