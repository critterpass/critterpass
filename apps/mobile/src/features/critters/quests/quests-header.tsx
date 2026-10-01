/**
 * The crew quests header (3l-7): "BALI SIX · CREW LVL 7", CREW QUESTS with the guide's sticker, the
 * XP bar, "640 / 1000 XP" and "Level 8 unlocks a crew sticker".
 */
import type { CrewLevel } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { LinearBar } from '@/ui/data/LinearBar';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { QuestGuideArt } from './quest-card-view';

export function QuestsHeader({
  crewName,
  level,
  guide,
}: {
  readonly crewName: string;
  readonly level: CrewLevel;
  readonly guide: QuestGuideArt;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const lvl = level.level;
  const next = level.nextStickerLevel;
  const eyebrow =
    crewName === ''
      ? t({ id: 'quests.header.levelOnly', message: `Crew lvl ${lvl}` })
      : t({ id: 'quests.header.eyebrow', message: `${crewName} · Crew lvl ${lvl}` });
  const xp = t({ id: 'quests.header.xp', message: `${level.into} / ${level.need} XP` });
  const unlock = t({ id: 'quests.header.unlock', message: `Level ${next} unlocks a crew sticker` });
  return (
    <Stack gap="10" testID="quests-header">
      <Row gap="12" align="center">
        <Stack gap="4" flex={1}>
          <Text variant="eyebrow" testID="quests-level">
            {upper(eyebrow, locale)}
          </Text>
          <Text variant="h1" accessibilityRole="header">
            {upper(t({ id: 'quests.title', message: 'Crew quests' }), locale)}
          </Text>
        </Stack>
        <Sticker kind={guide.kind} name={guide.name} size={64} pose="cheer" />
      </Row>
      <LinearBar
        value={level.into}
        max={level.need}
        color={theme.semantic.action.primary}
        accessibilityLabel={`${xp}. ${unlock}`}
        testID="quests-xp-bar"
      />
      {/* On a narrow phone the unlock line drops under the XP, whole. */}
      <Row justify="space-between" align="center" gap="8" wrap>
        <Text variant="monoData" color={theme.semantic.text.secondary}>
          {xp}
        </Text>
        <Text variant="monoData" color={theme.semantic.text.secondary}>
          {unlock}
        </Text>
      </Row>
    </Stack>
  );
}
