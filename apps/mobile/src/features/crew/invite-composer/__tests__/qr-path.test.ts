import { describe, expect, it } from '@jest/globals';
import { encode } from 'uqr';

import { qrChannelLink, qrPath, QR_QUIET_ZONE } from '../qr-path';

describe('join link QR path', () => {
  const url = 'https://critterpass.app/i/K7M2QX?c=qr';

  it('fills exactly the dark modules, quiet zone included', () => {
    const { path, size } = qrPath(url);
    const { data } = encode(url, { ecc: 'M', border: QR_QUIET_ZONE });
    const dark = data.flat().filter(Boolean).length;
    const filled = [...path.matchAll(/h(\d+)v1/gu)].reduce((sum, m) => sum + Number(m[1]), 0);
    expect(filled).toBe(dark);
    expect(size).toBe(data.length);
    // The top-left finder pattern starts right after the quiet zone: seven dark modules.
    expect(path.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h7v1h-7z`)).toBe(true);
  });

  it('draws the same link the same way every time', () => {
    expect(qrPath(url)).toEqual(qrPath(url));
    expect(qrPath(url).path).not.toEqual(qrPath('https://critterpass.app/i/WYNST8').path);
  });

  it('tags a link as scanned', () => {
    expect(qrChannelLink('https://critterpass.app/i/K7M2QX')).toBe(
      'https://critterpass.app/i/K7M2QX?c=qr',
    );
  });
});
