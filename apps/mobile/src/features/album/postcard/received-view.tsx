/**
 * A postcard a crewmate sent you (undesigned; the composer's own parts, read-only): who it is from,
 * the postcard pair in the sender's format, and a way on to sending your own.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PostcardPair, type PostcardFormat } from './postcard-pair';

export interface ReceivedViewProps {
  readonly sender: string;
  readonly format: PostcardFormat;
  readonly photoKey: string | null;
  readonly place: string;
  readonly note: string;
  readonly guide: GuideId;
  readonly onOwn: () => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
}));

export function ReceivedView(props: ReceivedViewProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const sender = props.sender;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="postcard-received">
      <ScrollView contentContainerStyle={styles.content}>
        <Row justify="space-between" align="flex-start">
          <Stack gap="4" flex={1}>
            <Text variant="eyebrow" color={theme.color.yellow}>
              {t({ id: 'album.received.from', message: `From ${sender}` })}
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {t({ id: 'album.received.title', message: 'A postcard for you' })}
            </Text>
          </Stack>
          <PillButton
            label={t({ id: 'album.postcard.close', message: 'Done' })}
            onPress={props.onClose}
            size="sm"
            variant="tertiary"
            testID="postcard-received-close"
          />
        </Row>
        <PostcardPair
          format={props.format}
          photoKey={props.photoKey}
          photoCaption={null}
          place={props.place}
          note={props.note}
          signature={sender.slice(0, 1).toUpperCase()}
          guide={props.guide}
        />
        <PillButton
          label={t({ id: 'album.received.own', message: 'Send your own' })}
          onPress={props.onOwn}
          variant="secondary"
          block
          testID="postcard-received-own"
        />
      </ScrollView>
    </Scaffold>
  );
}
