/**
 * The offline day bundle (docs/api-contracts.md §5.5 `/v1/trips/{id}/offline-bundle`): per trip and
 * local date, the files a phone downloads (booking documents, phrase audio, the map region) and the
 * small facts it keeps (FX rates with their date, labels for the day's places, point forecasts).
 * The manifest is crew-visible, so it only names crew-visible bookings; the caller's own documents
 * and barcodes come in the bundle's `bookings` section.
 */
import { z } from 'zod';

export const BUNDLE_ASSET_KINDS = ['attachment', 'phrase_audio', 'map_region'] as const;
export type BundleAssetKind = (typeof BUNDLE_ASSET_KINDS)[number];

export const bundleAssetSchema = z.object({
  kind: z.enum(BUNDLE_ASSET_KINDS),
  /** Media key the api signs a download URL for. */
  key: z.string().min(1).max(300),
  bytes: z.number().int().nonnegative().nullable(),
  /** What the offline card lists ("Hot spring tickets", "Phrase cards"). */
  label: z.string().max(120),
  ref_id: z.uuid().nullable(),
});
export type BundleAsset = z.infer<typeof bundleAssetSchema>;

export const bundleManifestSchema = z.object({
  local_date: z.iso.date(),
  assets: z.array(bundleAssetSchema),
  map_region_ref: z
    .object({ region_id: z.uuid(), key: z.string(), version: z.string(), bytes: z.number() })
    .nullable(),
  fx: z.array(
    z.object({ base: z.string(), quote: z.string(), rate: z.string(), as_of: z.iso.date() }),
  ),
  places: z.array(
    z.object({
      poi_id: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      lat: z.number(),
      lng: z.number(),
    }),
  ),
  forecasts: z.array(
    z.object({ point_key: z.string(), elevation_m: z.number().nullable(), hourly: z.unknown() }),
  ),
});
export type BundleManifest = z.infer<typeof bundleManifestSchema>;

/** A booking document or phrase clip goes first on low storage; the map comes last. */
export const BUNDLE_ASSET_PRIORITY: Readonly<Record<BundleAssetKind, number>> = {
  attachment: 0,
  phrase_audio: 1,
  map_region: 2,
};

/** The phrase language spoken at a destination, by ISO country code. */
const COUNTRY_LANGUAGE: Readonly<Record<string, string>> = {
  ID: 'id',
  JP: 'ja',
  VN: 'vi',
  TH: 'th',
  KR: 'ko',
  MY: 'ms',
  PH: 'fil',
  CN: 'zh',
  TW: 'zh',
  FR: 'fr',
  ES: 'es',
  IT: 'it',
  DE: 'de',
  PT: 'pt',
  MX: 'es',
};

export function phraseLanguageFor(country: string | null): string | null {
  return country === null ? null : (COUNTRY_LANGUAGE[country.toUpperCase()] ?? null);
}

/** Canonical JSON (sorted keys) so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
