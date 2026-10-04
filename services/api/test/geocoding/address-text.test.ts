import { describe, expect, it } from 'vitest';

import { looksLikeAddress } from '../../src/geocoding/address-text';

describe('looksLikeAddress', () => {
  it.each([
    '12 Trần Phú',
    'K12/5 Lê Duẩn',
    'đường Bạch Đằng',
    'Duong Bach Dang',
    'hẻm Hoàng Diệu',
    'kiệt Ông Ích Khiêm',
    'Sukhumvit Soi Eleven',
    'Jl. Raya Ubud',
    'Baker St',
    'Abbey Road',
  ])('takes "%s" for an address', (text) => {
    expect(looksLikeAddress(text)).toBe(true);
  });

  it.each(['Chợ Hàn', 'Marble Mountains', 'Stella coffee', 'Broadway', 'bánh mì Phượng'])(
    'takes "%s" for a place name',
    (text) => {
      expect(looksLikeAddress(text)).toBe(false);
    },
  );
});
