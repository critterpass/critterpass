/**
 * The redraft's thinking beat (3c-12): the guide thinking, "{GUIDE} is redrafting day N" and the
 * typing dots. Past the usual time it says so and that she can leave; with no signal it says the
 * result shows once she is back online.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideColour, guideSticker } from '@/ui/avatar/guides';
import { TypingDots } from '@/ui/chat/TypingDots';
import type { GuideId } from '@/ui/people/GuideLine';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const THINKING = 150;

/** How the wait for a redraft is going: as usual, past the usual time, or with no signal. */
export type RedraftWait = 'working' | 'slow' | 'offline';

const useStyles = makeStyles((th) => ({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['20'],
  },
  centred: { textAlign: 'center' },
}));

export function RedraftThinking({
  guide,
  dayNo,
  wait,
}: {
  readonly guide: GuideId;
  readonly dayNo: number | null;
  readonly wait: RedraftWait;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(guide);
  const guideName = info.name;
  const n = dayNo ?? 0;
  return (
    <View style={styles.centre} testID="redraft-thinking">
      <Sticker kind={info.kind} name={info.name} pose="think" size={THINKING} />
      <Text variant="h2" style={styles.centred} accessibilityLiveRegion="polite">
        {dayNo === null
          ? t({ id: 'planDraft.diff.thinkingAny', message: `${guideName} is redrafting` })
          : t({ id: 'planDraft.diff.thinking', message: `${guideName} is redrafting day ${n}` })}
      </Text>
      <TypingDots color={guideColour(guide)} />
      {wait === 'offline' ? <OfflinePill /> : null}
      {wait === 'working' ? null : (
        <Text
          variant="body"
          color={theme.semantic.text.secondary}
          style={styles.centred}
          testID="redraft-thinking-line"
        >
          {wait === 'offline'
            ? t({
                id: 'planDraft.diff.thinkingOffline',
                message: 'I can’t reach it without signal. It shows here once you’re back online.',
              })
            : t({
                id: 'planDraft.diff.thinkingSlow',
                message: 'Taking longer than usual. You can leave: I’ll tell you when it’s ready.',
              })}
        </Text>
      )}
    </View>
  );
}
