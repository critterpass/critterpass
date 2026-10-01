import { describe, expect, it } from 'vitest';

import { siteTranslator } from '../components/site/i18n';
import { aroundSlot, pageStrings } from './coming-soon-strings';
import { comingSoonCopy } from '../components/site/copy/coming-soon';
import { HATCH_POOL } from './hatch-pool';
import { SITE_LOCALE_CODES } from './locale';

describe('coming-soon page strings', () => {
  it.each(SITE_LOCALE_CODES)(
    '%s keeps every placeholder the scripts fill in the browser',
    async (locale) => {
      const strings = pageStrings(await siteTranslator(locale), locale);
      expect(strings.navJoined).toContain('{position}');
      expect(strings.savingSeat).toContain('{name}');
      expect(strings.savingSeat).toContain('{place}');
      expect(strings.shareText).toContain('{url}');
      expect(strings.hatchedNumber).toContain('{num}');
      expect(strings.hatchedNumber).toContain('{city}');
      expect(strings.hatchedNumber).not.toContain('{total}');
      for (const unit of ['{days}', '{hours}', '{minutes}', '{seconds}']) {
        expect(strings.countdown).toContain(unit);
      }
    },
  );

  it.each(SITE_LOCALE_CODES)('%s introduces every local in the hatch pool', async (locale) => {
    const strings = pageStrings(await siteTranslator(locale), locale);
    for (const local of HATCH_POOL) {
      expect(strings.hatchLines[local.id], local.id).toMatch(/\S/u);
    }
  });

  it('is translated in every language but the source', async () => {
    const english = pageStrings(await siteTranslator('en'), 'en');
    for (const locale of SITE_LOCALE_CODES.filter((code) => code !== 'en')) {
      const strings = pageStrings(await siteTranslator(locale), locale);
      expect(strings.typedLine, locale).not.toBe(english.typedLine);
      expect(strings.emailInvalid, locale).not.toBe(english.emailInvalid);
    }
  });

  it('cuts a sentence around its live count wherever the language puts it', async () => {
    expect(aroundSlot(await siteTranslator('en'), comingSoonCopy.inLine, 'count')).toEqual([
      '',
      ' IN LINE',
    ]);
    expect(aroundSlot(await siteTranslator('vi'), comingSoonCopy.waveLeft, 'count')).toEqual([
      'ĐỢT ĐẦU · CÒN ',
      ' CHỖ',
    ]);
  });
});
