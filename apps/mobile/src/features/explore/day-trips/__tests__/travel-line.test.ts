import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { loadCatalog } from '@cp/i18n';

import { travelLegLabel, travelLine } from '@/data/areas/travel-line';

describe('travelLine', () => {
  it('says "about", the length, the mode and "each way" in English', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'explore') });
    expect(travelLine({ minutes: 45, mode: 'bus' })).toBe('about 45 min by bus each way');
    expect(travelLine({ minutes: 210, mode: 'train' })).toBe('about 3 h 30 by train each way');
    expect(travelLine({ minutes: 600, mode: 'boat' })).toBe('about 10 h by boat each way');
    expect(travelLine({ minutes: 125, mode: 'tour' })).toBe('about 2 h 05 on a tour each way');
    expect(travelLegLabel({ minutes: 210, mode: 'train' })).toBe('Train · about 3 h 30');
  });

  it('keeps the Vietnamese word order', async () => {
    i18n.loadAndActivate({ locale: 'vi', messages: await loadCatalog('vi', 'explore') });
    expect(travelLine({ minutes: 45, mode: 'bus' })).toBe('mỗi chiều khoảng 45 phút đi xe khách');
    expect(travelLine({ minutes: 210, mode: 'train' })).toBe('mỗi chiều khoảng 3 giờ 30 đi tàu');
    expect(travelLine({ minutes: 600, mode: 'boat' })).toBe('mỗi chiều khoảng 10 giờ đi thuyền');
  });
});
