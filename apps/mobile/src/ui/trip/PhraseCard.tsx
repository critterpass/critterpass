import { t } from '@lingui/core/macro';

import { Card } from '../cards/Card';
import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

export interface PhraseCardProps {
  /** The local-language phrase, verbatim ("Saya butuh dokter."). */
  readonly phrase: string;
  /** BCP 47 tag of the phrase ("id"), for screen-reader pronunciation and TTS. */
  readonly lang: string;
  readonly translation: string;
  /** Heading ("Show this to Made"). */
  readonly eyebrow?: string;
  /** Reads the phrase aloud (TTS). */
  readonly onPlay?: () => void;
  readonly playing?: boolean;
  /** Paper card for showing to someone; dark by default. */
  readonly tone?: 'paper' | 'raised';
  readonly testID?: string;
}

/** A phrase to show or play to a local: large phrase, translation, play button. */
export function PhraseCard({
  phrase,
  lang,
  translation,
  eyebrow,
  onPlay,
  playing = false,
  tone = 'raised',
  testID,
}: PhraseCardProps) {
  const theme = useTheme();
  const play = playing
    ? t({ id: 'common.trip.stopPhrase', message: 'Stop reading aloud' })
    : t({ id: 'common.trip.playPhrase', message: 'Read aloud' });
  return (
    <Card tone={tone} {...(testID ? { testID } : {})}>
      <Row gap="12" align="center">
        <Stack gap="6" flex={1}>
          {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
          <Text variant="input" accessibilityLanguage={lang}>
            {phrase}
          </Text>
          <SecondaryText variant="body">{translation}</SecondaryText>
        </Stack>
        {onPlay ? (
          <ActionPill
            round
            tone="primary"
            label={play}
            selected={playing}
            icon={
              <Text variant="title" color={theme.semantic.text.onAccent}>
                {playing ? '■' : '▶'}
              </Text>
            }
            onPress={onPlay}
          />
        ) : null}
      </Row>
    </Card>
  );
}
