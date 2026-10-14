/**
 * One result of Nominatim's `format=jsonv2` search with `addressdetails`, `namedetails` and
 * `extratags`: the shape the server's OpenStreetMap lookups (`@cp/suppliers` asks, `@cp/planner`
 * accepts) share.
 */
export interface NominatimResult {
  readonly osm_type: string;
  readonly osm_id: number;
  readonly lat: string;
  readonly lon: string;
  readonly category: string;
  readonly type: string;
  readonly name?: string | null;
  readonly address?: Readonly<Record<string, string>> | null;
  readonly namedetails?: Readonly<Record<string, string>> | null;
  readonly extratags?: Readonly<Record<string, string>> | null;
}

export interface NominatimBox {
  readonly minLat: number;
  readonly minLng: number;
  readonly maxLat: number;
  readonly maxLng: number;
}

export interface NominatimQuery {
  readonly q: string;
  readonly box: NominatimBox;
}
