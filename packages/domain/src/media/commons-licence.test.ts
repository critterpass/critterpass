import { describe, expect, it } from 'vitest';

import { commonsCredit, type CommonsPage } from './commons-licence';

const page = (
  licence: string,
  artist = '<a href="//commons.wikimedia.org/wiki/User:Ann">Ann Lee</a>',
): CommonsPage => ({
  pageid: 7,
  title: 'File:Quy Nhon beach.jpg',
  imageinfo: [
    {
      url: 'https://upload.wikimedia.org/a.jpg',
      width: 4000,
      height: 2600,
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Quy_Nhon_beach.jpg',
      mime: 'image/jpeg',
      extmetadata: {
        Artist: { value: artist },
        LicenseShortName: { value: licence },
        LicenseUrl: { value: 'http://creativecommons.org/licenses/by-sa/4.0' },
      },
    },
  ],
});

describe('commonsCredit', () => {
  it('builds the author and credit of a CC BY-SA file', () => {
    expect(commonsCredit(page('CC BY-SA 4.0'))).toEqual({
      licence: 'cc-by-sa-4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      author: 'Ann Lee',
      attributionRequired: true,
      credit: 'Ann Lee · CC BY-SA 4.0 · Wikimedia Commons',
      title: 'Quy Nhon beach.jpg',
    });
  });

  it('needs no attribution for public domain and CC0', () => {
    expect(commonsCredit(page('Public domain'))).toMatchObject({
      licence: 'public-domain',
      attributionRequired: false,
      credit: 'Ann Lee · Public domain · Wikimedia Commons',
    });
    expect(commonsCredit(page('CC0'))?.licence).toBe('cc0');
  });

  it('refuses NC, ND, GFDL-only and unknown licences, and files with no author', () => {
    for (const licence of ['CC BY-NC-SA 4.0', 'CC BY-ND 2.0', 'GFDL', '', 'Attribution']) {
      expect(commonsCredit(page(licence)), licence).toBeNull();
    }
    expect(commonsCredit(page('CC BY 4.0', '  '))).toBeNull();
  });
});
