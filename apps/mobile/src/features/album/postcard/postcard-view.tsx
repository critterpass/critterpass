/**
 * The postcard composer (3m-9, the recap's last card): LAST CARD / SEND IT HOME, the postcard
 * pair, the three formats (POSTCARD, STORY 9:16, POSTER), SEND TO THE CREW, and "Mail a real one
 * to each of you" with its PASS+ tag. After a send it says who it went to; a printed mailing shows
 * each recipient's progress (never an address).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { postcardCardCopy } from './postcard-card-copy';
import { PostcardPair, type PostcardFormat } from './postcard-pair';

export interface PostcardViewProps {
  readonly format: PostcardFormat;
  readonly photoKey: string | null;
  readonly photoCaption: string | null;
  readonly place: string;
  readonly note: string;
  readonly signature: string;
  readonly guide: GuideId;
  readonly sending: boolean;
  /** "Sent to Mai, Jon and Ana": the last send, when there was one. */
  readonly sentLine: string | null;
  /** Null when the crew is only the sender (nobody to send to). */
  readonly canSend: boolean;
  readonly mailing: React.ReactNode;
  readonly onFormat: (format: PostcardFormat) => void;
  readonly onPhoto: () => void;
  readonly onNote: () => void;
  readonly onSend: () => void;
  readonly onMail: () => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  badge: {
    borderRadius: t.radius.pill,
    backgroundColor: t.color.yellow,
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['2'],
  },
  mail: { minHeight: 44 },
}));

export function PostcardView(props: PostcardViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const theme = useTheme();
  const styles = useStyles();
  const copy = postcardCardCopy();
  const formats: readonly { value: PostcardFormat; label: string }[] = [
    { value: 'classic', label: t({ id: 'album.postcard.format.classic', message: 'Postcard' }) },
    { value: 'story', label: t({ id: 'album.postcard.format.story', message: 'Story 9:16' }) },
    { value: 'square', label: t({ id: 'album.postcard.format.square', message: 'Poster' }) },
  ];
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="postcard-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Row justify="space-between" align="flex-start">
          <Stack gap="4" flex={1}>
            <Text variant="eyebrow" color={theme.color.yellow}>
              {copy.eyebrow}
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {copy.title}
            </Text>
          </Stack>
          <PillButton
            label={t({ id: 'album.postcard.close', message: 'Done' })}
            onPress={props.onClose}
            size="sm"
            variant="tertiary"
            testID="postcard-close"
          />
        </Row>
        <PostcardPair
          format={props.format}
          photoKey={props.photoKey}
          photoCaption={props.photoCaption}
          place={props.place}
          note={props.note}
          signature={props.signature}
          guide={props.guide}
          onFront={props.onPhoto}
          onBack={props.onNote}
        />
        <Row gap="8" wrap>
          {formats.map((format) => (
            <ChoiceChip
              key={format.value}
              label={upper(format.label, locale)}
              selected={props.format === format.value}
              onPress={() => props.onFormat(format.value)}
              testID={`postcard-format-${format.value}`}
            />
          ))}
        </Row>
        <PillButton
          label={t({ id: 'album.postcard.send', message: 'Send to the crew' })}
          onPress={props.onSend}
          loading={props.sending}
          disabled={!props.canSend}
          block
          size="lg"
          testID="postcard-send"
        />
        {props.sentLine === null ? null : (
          <Text variant="body" testID="postcard-sent">
            {props.sentLine}
          </Text>
        )}
        <Pressable
          onPress={props.onMail}
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'album.postcard.mail',
            message: 'Mail a real one to each of you',
          })}
          style={styles.mail}
          testID="postcard-mail"
        >
          <Row justify="space-between" align="center">
            <Text variant="body">
              {t({ id: 'album.postcard.mail', message: 'Mail a real one to each of you' })}
            </Text>
            <View style={styles.badge}>
              <Text variant="label" color={theme.color.ink['950']}>
                {t({ id: 'album.postcard.passPlus', message: 'Pass+' })}
              </Text>
            </View>
          </Row>
        </Pressable>
        {props.mailing}
      </ScrollView>
    </Scaffold>
  );
}
