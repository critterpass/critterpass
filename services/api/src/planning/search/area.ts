/**
 * The area a place is in ("Ubud", "Canggu"), read from its own address: the first comma part that
 * is a name rather than a street, a number, a postcode or an administrative unit, and not the
 * destination itself. Null when the address has no such part; nothing is guessed from coordinates.
 */
const STREET =
  /^(jl\.?|jalan|gang|gg\.?|đường|duong|ngõ|hẻm|street|st\.?|road|rd\.?|avenue|ave\.?|lane|calle|rua|av\.?)\s/iu;
const STREET_SUFFIX = /\s(street|st\.?|road|rd\.?|avenue|ave\.?|lane|boulevard|blvd\.?)$/iu;
const ADMIN =
  /\b(regency|province|kabupaten|kota|prefecture|county|state|provinsi|tỉnh|tinh|thành phố)\b/iu;
const ADMIN_PREFIX = /^(kecamatan|kec\.|kelurahan|kel\.|desa|phường|phuong|quận|quan|xã|xa)\s+/iu;

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase().trim();

export function areaFromAddress(
  address: string | null,
  destinationName?: string | null,
): string | null {
  if (address === null) return null;
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
