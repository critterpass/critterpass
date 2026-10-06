/** Each guide theme's style, as the 3n-7 cards and the Settings Music row name it. */
import { t } from '@lingui/core/macro';

export function themeStyleName(guideId: string): string | null {
  switch (guideId) {
    case 'tokek':
      return t({ id: 'you.sound.theme.tokek', message: 'Gamelan lo-fi' });
    case 'pon':
      return t({ id: 'you.sound.theme.pon', message: 'Koto and rain' });
    case 'lundi':
      return t({ id: 'you.sound.theme.lundi', message: 'Slow sea shanty' });
    case 'ajo':
      return t({ id: 'you.sound.theme.ajo', message: 'Marimba lo-fi' });
    case 'sardi':
      return t({ id: 'you.sound.theme.sardi', message: 'Fado guitar waltz' });
    case 'paco':
      return t({ id: 'you.sound.theme.paco', message: 'Pan flute and charango' });
    case 'chava':
      return t({ id: 'you.sound.theme.chava', message: 'Đàn bầu lo-fi' });
    default:
      return null;
  }
}
