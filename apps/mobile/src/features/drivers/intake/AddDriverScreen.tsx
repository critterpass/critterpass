/**
 * Add a driver (6c-1): PASTE a message or link, pick a SCREENSHOT (read on the phone, only its
 * text is shared), or type a CONTACT. READ IT shares it to the trip and Tokek reads it into a card
 * to check (6c-2). SHARED WITH TOKEK lists what the crew shared, with where each one stands. Tokek
 * only reads what the traveller sends.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
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

import { driversRoute } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';
import { contactCard, useIntake } from './use-intake';

type Mode = 'paste' | 'contact';

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

/** The phone's text reader (the `cp-ocr` module, passed in by the route); null without one. */
export interface TextReader {
  recognize(uri: string): Promise<{ readonly lines: readonly { readonly text: string }[] }>;
}

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
  const plan = useDriverDays(tripId);
  const { state: drivers, refresh } = useDrivers(tripId);
  const intake = useIntake(tripId);
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const sticker = guideSticker(plan.guide.id);
  const reading = intake.state.kind === 'reading';
  const openCheck = (intakeId: string) =>
    router.push(driversRoute(tripId, 'check', { intake: intakeId, ...(days ? { days } : {}) }));
  const read = async (
    kind: 'text' | 'image' | 'contact',
    body: string,
    preset?: ReturnType<typeof contactCard>,
  ) => {
    const item = await intake.submit(kind, body, preset);
    void refresh();
    if (item !== null) openCheck(item.intakeId);
  };
  const screenshot = async () => {
    const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const uri = picked.canceled ? null : (picked.assets[0]?.uri ?? null);
    if (uri === null) return;
    const result = ocr === null ? null : await ocr.recognize(uri).catch(() => null);
    const lines = result?.lines.map((line) => line.text).join('\n') ?? '';
    if (lines.trim() === '') {
      router.push(driversRoute(tripId, 'check', { unread: '1', ...(days ? { days } : {}) }));
      return;
    }
    await read('image', lines);
  };
  const items =
    drivers.kind === 'ready' || drivers.kind === 'offline' ? (drivers.data?.intake ?? []) : [];
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
              onPress: () => {
                setMode('paste');
                void Clipboard.getStringAsync().then((clip) => {
                  if (clip.trim() !== '') setText(clip);
                });
              },
            },
            {
              id: 'screenshot',
              label: upper(t({ id: 'drivers.add.screenshot', message: 'Screenshot' }), locale),
              detail: t({ id: 'drivers.add.screenshotDetail', message: 'Drop or pick one' }),
              color: theme.color.pink,
              onPress: () => void screenshot(),
            },
            {
              id: 'contact',
              label: upper(t({ id: 'drivers.add.contact', message: 'Contact' }), locale),
              detail: t({ id: 'drivers.add.contactDetail', message: 'From WhatsApp' }),
              color: theme.color.blue,
              onPress: () => setMode('contact'),
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
                onChangeText={setText}
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
                  disabled={text.trim().length < 8 || reading}
                  onPress={() =>
                    void read(/^https?:\/\//u.test(text.trim()) ? 'text' : 'text', text)
                  }
                  testID="drivers-add-read"
                />
              </Row>
            </Stack>
          ) : (
            <Stack gap="10">
              <TextField
                label={t({ id: 'drivers.add.contactName', message: 'Name' })}
                value={name}
                onChangeText={setName}
                testID="drivers-add-contact-name"
              />
              <TextField
                label={t({
                  id: 'drivers.add.contactPhone',
                  message: 'WhatsApp number, with its country code',
                })}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                testID="drivers-add-contact-phone"
              />
              <PillButton
                label={t({ id: 'drivers.add.addContact', message: 'Add him' })}
                tone="yellow"
                size="sm"
                disabled={name.trim() === '' || reading}
                onPress={() => void read('contact', `${name}\n${phone}`, contactCard(name, phone))}
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
