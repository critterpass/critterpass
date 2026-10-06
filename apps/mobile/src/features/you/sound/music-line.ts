/** Settings' Music row line: the theme that plays and whether it follows the guide, or "Off". */
import { useLingui } from '@lingui/react/macro';

import { useActiveGuide } from '@/lib/navigation/active-guide';
import { music } from '@/motion/music';
import { guidesOfSameCountry } from '@/ui/avatar/guides';

import { themeStyleName } from './theme-names';
import { themeToPlay, useThemeChoice } from './theme-choice';

export function useMusicLine(enabled: boolean): string {
  const { t } = useLingui();
  const { choice } = useThemeChoice();
  const { guideId } = useActiveGuide();
  if (!enabled) return t({ id: 'you.settings.musicOff', message: 'Off' });
  const followed = music.themedGuideFor(guideId, guidesOfSameCountry(guideId));
  const theme = themeToPlay(choice, followed);
  const name = theme === undefined ? null : themeStyleName(theme);
  if (name === null) return t({ id: 'you.settings.musicOn', message: 'On' });
  return choice.mode === 'pinned'
    ? name
    : t({ id: 'you.settings.musicFollows', message: `${name}, follows your guide` });
}
