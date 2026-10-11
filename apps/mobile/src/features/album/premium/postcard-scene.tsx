/**
 * Send it home (8.14), the recap's last card as the postcard composer: "Last card" over the title,
 * the postcard (back and front, both tappable), Postcard / Story 9:16 / Poster, Send to the crew,
 * and "Mail a real one to each of you" with its Pass+ tag. ✕ saves and closes.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  CritterSticker,
  GlassIconButton,
  PressableScale,
  SegmentedControl,
  Tag,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { postcardCardCopy } from '../postcard/postcard-card-copy';
import type { PostcardViewProps } from '../postcard/postcard-view';
import { PostcardCards } from './postcard-cards';

const useStyles = makePremiumStyles((th) => ({
  mail: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 25,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
}));

export function PremiumPostcardScene(props: PostcardViewProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const copy = postcardCardCopy();
  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="postcard-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
          gap: 18,
        }}
      >
        <GlassIconButton
          icon="close"
          label={t({ id: 'album.postcard.close', message: 'Done' })}
          onPress={props.onClose}
          disabled={props.closing === true}
          testID="postcard-close"
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="muted">
              {copy.eyebrow}
            </Text>
            <Text variant="largeTitle" accessibilityRole="header">
              {copy.title}
            </Text>
          </View>
          <CritterSticker kind="temple" name={props.place} size={58} />
        </View>
        <PostcardCards {...props} />
        <SegmentedControl
          options={[
            {
              value: 'classic',
              label: t({ id: 'album.postcard.format.classic', message: 'Postcard' }),
            },
            {
              value: 'story',
              label: t({ id: 'album.postcard.format.story', message: 'Story 9:16' }),
            },
            {
              value: 'square',
              label: t({ id: 'album.postcard.format.square', message: 'Poster' }),
            },
          ]}
          value={props.format}
          onChange={props.onFormat}
          accessibilityLabel={t({ id: 'album.premium.postcard.format', message: 'Format' })}
          testID="postcard-format"
        />
        <Button
          label={t({ id: 'album.postcard.send', message: 'Send to the crew' })}
          onPress={props.onSend}
          loading={props.sending}
          disabled={!props.canSend || props.closing === true}
          testID="postcard-send"
        />
        {props.sentLine === null ? null : (
          <Text variant="body" testID="postcard-sent">
            {props.sentLine}
          </Text>
        )}
        {props.canSend ? null : (
          <Text variant="captionMuted" tone="muted" testID="postcard-solo">
            {t({
              id: 'album.postcard.solo',
              message: 'Nobody else is on this trip yet, so there is no one to send it to.',
            })}
          </Text>
        )}
        <PressableScale
          style={styles.mail}
          onPress={props.onMail}
          disabled={props.mailingPending === true}
          accessibilityRole="button"
          accessibilityState={{ busy: props.mailingPending === true }}
          testID="postcard-mail"
        >
          <Text variant="rowTextStrong">
            {props.mailingPending === true
              ? t({ id: 'album.postcard.mailing', message: 'Ordering the prints…' })
              : t({ id: 'album.postcard.mail', message: 'Mail a real one to each of you' })}
          </Text>
          <Tag
            label={t({ id: 'album.postcard.passPlus', message: 'Pass+' })}
            color={th.accent.sun}
            rotate={0}
          />
        </PressableScale>
        {props.mailing}
      </ScrollView>
    </View>
  );
}
