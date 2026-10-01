import type { SurfaceTone } from '../surface/Scaffold';
import type { Theme } from '../theme';

/** Surface fills a card can take: dark raised/sunken, paper, or one of the guide accents. */
export type CardTone =
  'raised' | 'sunken' | 'paper' | 'yellow' | 'orange' | 'pink' | 'blue' | 'green' | 'cream' | 'red';

export function cardBackground(theme: Theme, tone: CardTone): string {
  switch (tone) {
    case 'raised':
      return theme.semantic.bg.raised;
    case 'sunken':
      return theme.semantic.bg.sunken;
    case 'paper':
      return theme.color.paper.base;
    case 'yellow':
      return theme.color.yellow;
    case 'orange':
      return theme.color.orange;
    case 'pink':
      return theme.color.pink;
    case 'blue':
      return theme.color.blue;
    case 'green':
      return theme.color.green.base;
    case 'cream':
      return theme.color.paper.warm;
    case 'red':
      return theme.color.red;
  }
}

export function surfaceToneOf(tone: CardTone): SurfaceTone {
  if (tone === 'raised' || tone === 'sunken') return 'dark';
  if (tone === 'paper') return 'paper';
  return 'accent';
}
