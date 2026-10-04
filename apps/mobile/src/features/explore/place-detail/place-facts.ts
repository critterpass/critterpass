/**
 * Facts about a place the page reads from what it already has: the area it is in, from its own
 * address (the same rule the server's search uses), whether its kind is one that sells tickets or
 * tours at all, and whose saves keep it in the trip's Ideas.
 */

const STREET =
  /^(jl\.?|jalan|gang|gg\.?|đường|duong|ngõ|hẻm|street|st\.?|road|rd\.?|avenue|ave\.?|lane|calle|rua|av\.?)\s/iu;
const STREET_SUFFIX = /\s(street|st\.?|road|rd\.?|avenue|ave\.?|lane|boulevard|blvd\.?)$/iu;
const ADMIN =
  /\b(regency|province|kabupaten|kota|prefecture|county|state|provinsi|tỉnh|tinh|thành phố)\b/iu;
const ADMIN_PREFIX = /^(kecamatan|kec\.|kelurahan|kel\.|desa|phường|phuong|quận|quan|xã|xa)\s+/iu;

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase().trim();

/**
 * "Ubud" from "Jl. Hanoman 10, Ubud, Gianyar Regency, Bali": the first comma part that is a name
 * rather than a street, a number or an administrative unit, and not the destination itself. Null
 * when the address has no such part; nothing is guessed from coordinates.
 */
export function areaFromAddress(
  address: string | null | undefined,
  destinationName?: string | null,
): string | null {
  if (address === null || address === undefined) return null;
  const destination =
    destinationName === undefined || destinationName === null ? '' : fold(destinationName);
  for (const raw of address.split(',')) {
    const part = raw.trim().replace(ADMIN_PREFIX, '');
    if (part === '' || part.length > 40 || /\d/u.test(part)) continue;
    if (STREET.test(part) || STREET_SUFFIX.test(part) || ADMIN.test(part)) continue;
    if (destination !== '' && fold(part) === destination) continue;
    return part;
  }
  return null;
}

/** Kinds of place nobody sells a ticket or a tour for: a bar, a meal, a shop, a bed, a ride. */
const NO_TICKETS = new Set([
  'food',
  'market',
  'nightlife',
  'shopping',
  'stay',
  'transit',
  'health',
]);

/** Whether a place of this kind gets the TICKETS AND TOURS card. */
export function sellsTickets(category: string): boolean {
  return !NO_TICKETS.has(category);
}

/** The crewmates who still back an idea once `me` leaves it, by first name where known. */
export function othersBacking(
  backerIds: readonly string[],
  me: string | null,
  firstName: (uid: string) => string | null,
): { readonly count: number; readonly first: string | null } {
  const others = backerIds.filter((uid) => uid !== me);
  const named = others.flatMap((uid) => firstName(uid) ?? []);
  return { count: others.length, first: named[0] ?? null };
}
