/**
 * The trip guide's voice line on a setup step: their sticker and a Caveat line in their colour, or
 * (`note`) the handwritten line on a paper speech bubble in ink, as the no-fit options show it.
 */
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import type { GuideId } from '@/ui/people/GuideLine';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const STICKER_PT = 44;

const useStyles = makeStyles((th) => ({
  note: {
    flex: 1,
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
}));

export function guideName(guide: GuideId): string {
  return guideSticker(guide).name;
}

export function GuideNote({
  guide,
  line,
  bubble = false,
  note = false,
  testID,
}: {
  readonly guide: GuideId;
  readonly line: string;
  readonly bubble?: boolean;
  /** Paper speech bubble with the line in ink. */
  readonly note?: boolean;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(guide);
  const sticker = <Sticker kind={info.kind} name={info.name} size={STICKER_PT} />;
  if (note) {
    return (
      <Row
        gap="10"
        align="center"
        accessible
        accessibilityLabel={`${info.name}: ${line}`}
        testID={testID}
      >
        {sticker}
        <SurfaceToneProvider value="paper">
          <View style={styles.note}>
            <Text variant="voice" color={theme.color.paper.ink}>
              {line}
            </Text>
          </View>
        </SurfaceToneProvider>
      </Row>
    );
  }
  return (
    <GuideLine
      guide={guide}
      name={info.name}
      line={line}
      bubble={bubble}
      sticker={sticker}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
