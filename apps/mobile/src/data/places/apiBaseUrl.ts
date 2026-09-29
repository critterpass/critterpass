/**
 * The real api service's base URL, shared by every api client in the app. `EXPO_PUBLIC_API_BASE_URL`
 * is inlined by Metro at build time; unset, the build's environment picks the default
 * (../app-session/endpoints.ts: production for production builds, staging for every other).
 */
import {
  currentAppEnvironment,
  defaultEndpoints,
  endpointOr,
  type AppEnvironment,
} from '../app-session/endpoints';

export function resolveApiBaseUrl(env: AppEnvironment = currentAppEnvironment()): string {
  return endpointOr(process.env['EXPO_PUBLIC_API_BASE_URL'], defaultEndpoints(env).api);
}
