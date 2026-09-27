import { readFileSync } from 'node:fs';

import { canonicalTz, TZ_ALIASES } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  buildTzAliases,
  OUTPUT_PATH,
  readVendoredTzdata,
  renderTzAliases,
} from './generate-canonical-tz';

const tzdata = readVendoredTzdata();
const aliases = buildTzAliases(tzdata.backward, tzdata.etcetera);

describe('canonical time zone table', () => {
  it('is regenerated from the vendored tzdata (run generate-canonical-tz.ts after updating it)', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf-8')).toBe(renderTzAliases(tzdata.version, aliases));
  });

  it('maps the CLDR ids Apple and Android report to canonical IANA ids', () => {
    const reported: Record<string, string> = {
      'Asia/Saigon': 'Asia/Ho_Chi_Minh',
      'Asia/Calcutta': 'Asia/Kolkata',
      'Asia/Katmandu': 'Asia/Kathmandu',
      'Asia/Rangoon': 'Asia/Yangon',
      'Asia/Dacca': 'Asia/Dhaka',
      'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
      'Europe/Kiev': 'Europe/Kyiv',
      'Atlantic/Faeroe': 'Atlantic/Faroe',
      'America/Godthab': 'America/Nuuk',
      'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
      'America/Indianapolis': 'America/Indiana/Indianapolis',
      'America/Louisville': 'America/Kentucky/Louisville',
      'Pacific/Truk': 'Pacific/Chuuk',
      'Pacific/Ponape': 'Pacific/Pohnpei',
      'Pacific/Enderbury': 'Pacific/Kanton',
      'Africa/Asmera': 'Africa/Asmara',
      'Australia/ACT': 'Australia/Sydney',
      'US/Eastern': 'America/New_York',
      UTC: 'Etc/UTC',
      GMT: 'Etc/GMT',
    };
    for (const [alias, canonical] of Object.entries(reported)) {
      expect(canonicalTz(alias), alias).toBe(canonical);
    }
  });

  it('keeps current zone.tab locations that IANA folds into another city', () => {
    for (const location of [
      'Europe/Oslo',
      'Europe/Amsterdam',
      'Asia/Kuala_Lumpur',
      'Atlantic/Reykjavik',
    ]) {
      expect(TZ_ALIASES.has(location), location).toBe(false);
    }
    expect(canonicalTz('Iceland')).toBe('Atlantic/Reykjavik');
  });

  it('resolves every alias to a name that is not itself an alias', () => {
    for (const [alias, canonical] of aliases) {
      expect(aliases.has(canonical), `${alias} -> ${canonical}`).toBe(false);
    }
  });

  it('covers every non-canonical id the platform ICU (CLDR) lists', () => {
    // ICU keeps CLDR's ids, which are IANA backward links wherever IANA renamed a zone.
    const unresolved = Intl.supportedValuesOf('timeZone').filter((id) => {
      const canonical = canonicalTz(id);
      return canonical !== id ? aliases.has(canonical) : /^(?:US|Canada|Brazil|Mexico)\//.test(id);
    });
    expect(unresolved).toEqual([]);
  });
});
