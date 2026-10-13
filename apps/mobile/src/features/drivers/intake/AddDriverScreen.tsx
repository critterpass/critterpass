/**
 * Add a driver (6c-1): PASTE a message or link, pick a SCREENSHOT (read on the phone, only its
 * text is shared), or type a CONTACT. READ IT shares it to the trip and Tokek reads it into a card
 * to check (6c-2). SHARED WITH TOKEK lists what the crew shared, with where each one stands. Tokek
 * only reads what the traveller sends.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { GuideLine } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { ImportTiles } from '@/ui/trip/ImportTiles';
import { makeStyles, useTheme } from '@/ui/theme';

import { useAddDriver, type TextReader } from './use-add-driver';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  paste: {
    borderRadius: t.radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.color.yellow,
    padding: t.space['14'],
  },
  list: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
  },
}));

export function AddDriverScreen({
  tripId,
  days,
  ocr,
}: {
  tripId: string;
  days?: string;
  ocr: TextReader | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const add = useAddDriver({ tripId, ocr, ...(days ? { days } : {}) });
  const { plan, intake, mode, text, name, phone, reading, items, openCheck } = add;
  const sticker = guideSticker(plan.guide.id);
  return (
    <Scaffold variant="dark" testID="drivers-add">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow
          label={upper(t({ id: 'drivers.back.find', message: 'Find a driver' }), locale)}
          onPress={() => router.back()}
        />
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.add.title', message: 'Add a driver' }), locale)}
        </Text>
        <ImportTiles
          testID="drivers-add-tiles"
          sources={[
            {
              id: 'paste',
              label: upper(t({ id: 'drivers.add.paste', message: 'Paste' }), locale),
              detail: t({ id: 'drivers.add.pasteDetail', message: 'Text or a link' }),
              color: theme.color.yellow,
              onPress: add.paste,
            },
            {
              id: 'screenshot',
              label: upper(t({ id: 'drivers.add.screenshot', message: 'Screenshot' }), locale),
              detail: t({ id: 'drivers.add.screenshotDetail', message: 'Drop or pick one' }),
              color: theme.color.pink,
              onPress: add.screenshot,
            },
            {
              id: 'contact',
              label: upper(t({ id: 'drivers.add.contact', message: 'Contact' }), locale),
              detail: t({ id: 'drivers.add.contactDetail', message: 'From WhatsApp' }),
              color: theme.color.blue,
              onPress: () => add.setMode('contact'),
            },
          ]}
        />
        <View style={styles.paste}>
          {mode === 'paste' ? (
            <Stack gap="10">
              <TextField
                label={t({ id: 'drivers.add.pasteLabel', message: 'The driver’s message' })}
                labelHidden
                value={text}
                onChangeText={add.setText}
                multiline
                maxLines={8}
                placeholder={t({
                  id: 'drivers.add.pastePlaceholder',
                  message: 'Paste what the driver wrote, or a link to his post',
                })}
                testID="drivers-add-text"
              />
              <Row align="center" style={{ justifyContent: 'flex-end' }}>
                <PillButton
                  label={t({ id: 'drivers.add.read', message: 'Read it' })}
                  tone="yellow"
                  size="sm"
                  loading={reading}
                  disabled={!add.canRead}
                  onPress={add.readText}
                  testID="drivers-add-read"
                />
              </Row>
            </Stack>
          ) : (
            <Stack gap="10">
              <TextField
                label={t({ id: 'drivers.add.contactName', message: 'Name' })}
                value={name}
                onChangeText={add.setName}
                testID="drivers-add-contact-name"
              />
              <TextField
                label={t({
                  id: 'drivers.add.contactPhone',
                  message: 'WhatsApp number, with its country code',
                })}
                value={phone}
                onChangeText={add.setPhone}
                keyboardType="phone-pad"
                testID="drivers-add-contact-phone"
              />
              <PillButton
                label={t({ id: 'drivers.add.addContact', message: 'Add him' })}
                tone="yellow"
                size="sm"
                disabled={!add.canAddContact}
                onPress={add.addContact}
                testID="drivers-add-contact-add"
              />
            </Stack>
          )}
        </View>
        {intake.state.kind === 'queued' ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="drivers-add-queued">
            {t({
              id: 'drivers.add.queued',
              message: 'Saved. I’ll read it when you’re back online.',
            })}
          </Text>
        ) : null}
        {intake.state.kind === 'failed' ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="drivers-add-failed">
            {t({
              id: 'drivers.add.failed',
              message: 'That didn’t go through. Try again in a moment.',
            })}
          </Text>
        ) : null}
        {items.length === 0 ? null : (
          <Stack gap="8">
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {upper(
                t({
                  id: 'drivers.add.shared',
                  message: `Shared with ${plan.guide.name} · ${items.length}`,
                }),
                locale,
              )}
            </Text>
            <View style={styles.list} testID="drivers-add-shared">
              <Stack gap="12">
                {items.map((item, index) => {
                  const label =
                    item.parsed?.card.name ??
                    (item.kind === 'image'
                      ? t({ id: 'drivers.add.kindImage', message: 'Screenshot' })
                      : t({ id: 'drivers.add.kindText', message: 'Message' }));
                  const badge =
                    item.status === 'used'
                      ? t({ id: 'drivers.add.badge.shortlisted', message: 'Shortlisted' })
                      : item.status === 'failed'
                        ? t({ id: 'drivers.add.badge.unread', message: 'Couldn’t read' })
                        : item.status === 'parsed'
                          ? t({ id: 'drivers.add.badge.check', message: 'Check it' })
                          : t({ id: 'drivers.add.badge.new', message: 'New' });
                  return (
                    <PressScale
                      key={item.id}
                      accessibilityLabel={`${label}, ${badge}`}
                      onPress={() => openCheck(item.id)}
                      testID={`drivers-add-item-${index}`}
                    >
                      <Row gap="12" align="center">
                        <Avatar name={label} joinIndex={index + 2} size="md" />
                        <Stack gap="2" style={{ flex: 1 }}>
                          <Text variant="title">{upper(label, locale)}</Text>
                          <Text variant="bodySm" color={theme.semantic.text.secondary}>
                            {t({
                              id: 'drivers.add.sharedBy',
                              message: `shared by ${item.shared_by_name ?? ''}`,
                            })}
                          </Text>
                        </Stack>
                        <InfoPill variant={item.status === 'used' ? 'solid' : 'outline'}>
                          {upper(badge, locale)}
                        </InfoPill>
                      </Row>
                    </PressScale>
                  );
                })}
              </Stack>
            </View>
          </Stack>
        )}
        <GuideLine
          guide={plan.guide.id}
          name={plan.guide.name}
          line={t({
            id: 'drivers.add.footnote',
            message:
              'Copy any message from WhatsApp or Facebook and paste it here. I only read what you send.',
          })}
          sticker={<Sticker kind={sticker.kind} name={sticker.name} pose="idle" size={44} />}
        />
      </ScrollView>
    </Scaffold>
  );
}
