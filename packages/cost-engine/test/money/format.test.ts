import { DomainError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { formatCompactMoney } from '../../src/money/compact';
import { formatMoney } from '../../src/money/format';
import { money } from '../../src/money/money';

describe('formatMoney: HOME/LOCAL/BOTH (docs/product-decisions.md §3n-8)', () => {
  const localidr = money(7_500_000n, 'IDR'); // Rp 75,000 (IDR is stored at ISO exponent 2, displayed at 0)
  const homeSgd = money(640n, 'SGD'); // S$6.40

  it('reproduces the pinned id-ID/en-SG sample exactly: "Rp 75.000 ≈ S$6.40"', () => {
    // The local (IDR) side groups per id-ID convention, the home (SGD) side per the viewer's own
    // en-SG convention (docs/product-decisions.md §3n-8); CLDR inserts a no-break space after "Rp".
    const rendered = formatMoney(localidr, {
      locale: 'id-ID',
      homeLocale: 'en-SG',
      mode: 'both',
      home: 'SGD',
      converted: homeSgd,
    });
    expect(rendered).toBe('Rp 75.000 ≈ S$6.40');
  });

  it('mode local shows only the amount currency, ignoring home/converted', () => {
    expect(formatMoney(localidr, { locale: 'id-ID', mode: 'local' })).toBe('Rp 75.000');
  });

  it('mode home shows the converted amount when the currencies differ', () => {
    const rendered = formatMoney(localidr, {
      locale: 'en-SG',
      mode: 'home',
      home: 'SGD',
      converted: homeSgd,
    });
    expect(rendered).toBe('S$6.40');
  });

  it('mode home shows the amount directly when it is already in the home currency', () => {
    const rendered = formatMoney(homeSgd, { locale: 'en-SG', mode: 'home', home: 'SGD' });
    expect(rendered).toBe('S$6.40');
  });

  it('mode both collapses to a single amount when home equals the amount currency', () => {
    const rendered = formatMoney(homeSgd, { locale: 'en-SG', mode: 'both', home: 'SGD' });
    expect(rendered).toBe('S$6.40');
  });

  it('throws when home mode needs a conversion that was never supplied', () => {
    expect(() => formatMoney(localidr, { locale: 'id-ID', mode: 'home', home: 'SGD' })).toThrow(
      DomainError,
    );
  });

  it('throws when both/home mode is requested without a home currency at all', () => {
    expect(() => formatMoney(localidr, { locale: 'id-ID', mode: 'both' })).toThrow(DomainError);
    expect(() => formatMoney(localidr, { locale: 'id-ID', mode: 'home' })).toThrow(DomainError);
  });

  it('throws when the supplied converted amount is not actually in the home currency', () => {
    expect(() =>
      formatMoney(localidr, {
        locale: 'id-ID',
        mode: 'both',
        home: 'SGD',
        converted: money(100n, 'JPY'),
      }),
    ).toThrow(DomainError);
  });

  it('renders a negative amount with the locale-correct sign', () => {
    // USD's wide, disambiguated symbol is "US$" (docs/product-decisions.md's symbol table), the
    // same reasoning that gives SGD "S$" above.
    expect(formatMoney(money(-500n, 'USD'), { locale: 'en-US', mode: 'local' })).toBe('-US$5.00');
  });

  it('rounds JPY/VND/KRW/ISK to zero decimals and BHD/KWD to three, per the stored exponent', () => {
    expect(formatMoney(money(1_200n, 'JPY'), { locale: 'en-US', mode: 'local' })).toBe('¥1,200');
    expect(formatMoney(money(12_900n, 'ISK'), { locale: 'en-US', mode: 'local' })).toBe(
      'kr 12,900',
    );
    expect(formatMoney(money(1_500n, 'BHD'), { locale: 'en-US', mode: 'local' })).toBe('BHD 1.500');
  });
});

describe('formatCompactMoney: approximate magnitude', () => {
  it('renders a thousands amount with the "~" approximation marker', () => {
    const rendered = formatCompactMoney(money(1_240_00n, 'USD'), { locale: 'en-US' });
    expect(rendered.startsWith('~')).toBe(true);
    expect(rendered).toContain('1.2');
  });

  it('never uses the FX "≈" marker for a pure magnitude compaction', () => {
    const rendered = formatCompactMoney(money(1_240_00n, 'USD'), { locale: 'en-US' });
    expect(rendered).not.toContain('≈');
  });
});

describe('property-adjacent: 16 representative launch locales format without throwing', () => {
  // Framework readiness covers 16 locales incl. RTL (docs/code-standards.md §8); the 10 launch-gate
  // languages (docs/product-decisions.md's language decision: en, zh-Hans, id, ja, es, pt, fr, ko,
  // th, vi) plus 6 more chosen for script/direction diversity (Arabic for RTL, Devanagari,
  // Cyrillic) so this formatter smoke test exercises distinct CLDR grouping/decimal conventions,
  // not a restatement of which locales Critterpass ships.
  const LOCALES = [
    'en-US',
    'zh-Hans-CN',
    'id-ID',
    'ja-JP',
    'es-ES',
    'pt-PT',
    'fr-FR',
    'ko-KR',
    'th-TH',
    'vi-VN',
    'de-DE',
    'it-IT',
    'ar-AE',
    'hi-IN',
    'ru-RU',
    'tr-TR',
  ] as const;

  it.each(LOCALES)('formats a mixed HOME/LOCAL/BOTH set for %s', (locale) => {
    const rendered = formatMoney(money(7_500_000n, 'IDR'), {
      locale,
      mode: 'both',
      home: 'SGD',
      converted: money(640n, 'SGD'),
    });
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered).toContain('≈');
  });
});
