/**
 * The api's Valhalla client: our self-hosted router on Railway's private network
 * (`http://valhalla.railway.internal:8002`, `VALHALLA_URL`), built from OpenStreetMap so its
 * answers may be stored. One client per URL per process, so every caller shares one circuit
 * breaker: when the router is down, the first few calls notice and the rest skip it at once.
 */
import { createValhallaClient, type ValhallaClient } from '@cp/suppliers';

const clients = new Map<string, ValhallaClient>();

/** `null` when no router is configured: planning falls back to straight-line estimates. */
export function apiValhalla(url: string | undefined): ValhallaClient | null {
  if (url === undefined || url.length === 0) return null;
  let client = clients.get(url);
  if (client === undefined) {
    client = createValhallaClient({ baseUrl: url });
    clients.set(url, client);
  }
  return client;
}
