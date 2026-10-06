/**
 * Couldn't read it (6c-3): what could be read and why not (cut off, a price inside a photo), the
 * shared text with where it stops, and TYPE THE REST IN, which opens the card with the gaps.
 */
import type { ParsedIntake } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  peek: { backgroundColor: t.color.paper.base, borderRadius: t.radius.md, padding: t.space['12'] },
}));

export function CouldntReadView(props: {
  readonly guide: string;
  readonly source: string;
  readonly parsed: ParsedIntake | null;
  readonly back: ReactNode;
  readonly onType: () => void;
}) {
  const { source, parsed, back } = props;
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const sticker = guideSticker(props.guide);
    return (
      <Scaffold variant="dark" testID="drivers-unread">
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}>
          {back}
          <Row gap="12" align="center">
            <Sticker kind={sticker.kind} name={sticker.name} pose="think" size={64} />
            <Text variant="h1" designSize={48} accessibilityRole="header" style={{ flex: 1 }}>
              {upper(t({ id: 'drivers.unread.title', message: 'Couldn’t read it' }), locale)}
            </Text>
          </Row>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {parsed?.unreadable.join(' ') ||
              t({
                id: 'drivers.unread.body',
                message: 'I couldn’t find a driver’s name, number or price in it.',
              })}
          </Text>
          {source === '' ? null : (
            <View style={styles.peek}>
              <Text variant="monoData" color={theme.color.paper.ink} numberOfLines={8}>
                {source}
              </Text>
              {parsed?.cut_off === true ? (
                <InfoPill variant="solid">
                  {upper(t({ id: 'drivers.unread.cutOff', message: 'Cut off here' }), locale)}
                </InfoPill>
              ) : null}
            </View>
          )}
          <PillButton
            label={t({ id: 'drivers.unread.type', message: 'Type the rest in' })}
            tone="yellow"
            block
            onPress={props.onType}
            testID="drivers-unread-type"
          />
          <TextLink
            label={t({ id: 'drivers.unread.another', message: 'Try another screenshot' })}
            onPress={() => router.back()}
          />
        </ScrollView>
      </Scaffold>
    );
}
