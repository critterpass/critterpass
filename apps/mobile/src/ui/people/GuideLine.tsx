import type { ReactNode } from 'react';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { Row } from '../layout/Row';
import { useSurfaceTone } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export type GuideId = (typeof tokens.guide.order)[number];

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

function voiceColour(guide: GuideId, onPaper: boolean): string {
  const palette = tokens.guide as unknown as Readonly<Record<string, string>> & {
    readonly onPaper: Readonly<Record<string, string>>;
  };
  return (onPaper ? palette.onPaper[guide] : palette[guide]) ?? tokens.semantic.text.primary;
}

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
        <Text variant="voice" color={voiceColour(guide, tone === 'paper')}>
          {line}
        </Text>
      </View>
    </Row>
  );
}
