/**
 * The manifest the Valhalla service reads at boot (`ROUTING_TILES_MANIFEST_URL`): which tile tar
 * to download, its checksum, the boxes it covers and how old the OpenStreetMap data is. The serve
 * script reads `build`, `tiles.url` and `tiles.sha256` with jq; the rest is for people.
 */
import { z } from 'zod';

export const VALHALLA_VERSION = '3.8.3';

export const manifestSchema = z.object({
  /** UTC build time, `20261004T013005Z`: sortable and safe in an asset name. */
  build: z.string().regex(/^\d{8}T\d{6}Z$/),
  createdAt: z.string(),
  valhalla: z.literal(VALHALLA_VERSION),
  /** OSM replication timestamp of each extract the tiles were cut from. */
  osm: z.record(z.string(), z.string()),
  boxes: z.array(
    z.object({ slug: z.string(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  ),
  tiles: z.object({
    url: z.url(),
    /** gzip of the Valhalla tile tar; the service unpacks it before mmap. */
    encoding: z.literal('gzip'),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  attribution: z.string(),
});

export type TileManifest = z.infer<typeof manifestSchema>;

export const ODBL_ATTRIBUTION =
  'Routing tiles built from OpenStreetMap data © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0: https://www.openstreetmap.org/copyright';

export function createManifest(
  input: Omit<TileManifest, 'valhalla' | 'attribution'>,
): TileManifest {
  return manifestSchema.parse({
    ...input,
    valhalla: VALHALLA_VERSION,
    attribution: ODBL_ATTRIBUTION,
  });
}
