import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { GuideId } from '@/lib/navigation/active-guide';

import { guideColour } from '../avatar/guides';
import { Row } from '../layout/Row';
import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export type { GuideId };

export interface GuideLineProps {
  /** Which guide speaks: sets the voice colour (darkened on paper). */
  readonly guide: GuideId;
  /** The guide's display name, read before the line. */
  readonly name: string;
  readonly line: string;
  /** The guide's sticker (`LiveSticker` / `Sticker`), usually 40–56 pt. */
  readonly sticker?: ReactNode;
  /** Wrap the line in a speech bubble (home tips, 3b-2). */
  readonly bubble?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  bubble: {
    flex: 1,
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
  },
  plain: { flex: 1 },
}));

/**
 * A guide speaking: sticker + a Borel voice line in the guide's colour (Geist italic under the
 * "plain text for guide" setting, which `<Text variant="voice">` applies). Read as one element.
 */
export function GuideLine({ guide, name, line, sticker, bubble = false, testID }: GuideLineProps) {
  const styles = useStyles();
  const tone = useSurfaceTone();
  return (
    <Row testID={testID} gap="10" align="center" accessible accessibilityLabel={`${name}: ${line}`}>
      {sticker}
      <View style={bubble ? styles.bubble : styles.plain}>
        <Text variant="voice" color={guideColour(guide, tone === 'paper')}>
          {line}
        </Text>
      </View>
    </Row>
  );
}
