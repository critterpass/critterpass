/**
 * Add a driver, in the Find a driver look (6.19): three ways in as tiles (paste a message or link,
 * pick a screenshot read on the phone, type a WhatsApp contact), the field for the picked one, and
 * the button riding the keyboard. What the crew already shared sits under it with where each item
 * stands; the guide's note says it only reads what the traveller sends.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideCritterKind } from '@/features/trip';
import { Banner, Button, GuideNote, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { useAddDriver, type AddDriverInput } from '../intake/use-add-driver';
import { SharedList, SourceTile } from './components/AddDriverParts';

export function AddDriverPremium(input: AddDriverInput) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const add = useAddDriver(input);
  const { plan, intake, mode } = add;
  const pasting = mode === 'paste';
  return (
    <PushScreen
      title={t({ id: 'drivers.add.title', message: 'Add a driver' })}
      backLabel={t({ id: 'drivers.back.find', message: 'Find a driver' })}
      scroll={false}
      testID="drivers-add"
    >
      <KeyboardAwareScroll
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
            paddingBottom: insets.bottom + 120,
          },
        ]}
      >
        <View style={styles.tiles} testID="drivers-add-tiles">
          <SourceTile
            icon="copy"
            tint={th.color.status.maybe}
            title={t({ id: 'drivers.add.paste', message: 'Paste' })}
            detail={t({ id: 'drivers.add.pasteDetail', message: 'Text or a link' })}
            on={pasting}
            onPress={add.paste}
            testID="drivers-add-tile-paste"
          />
          <SourceTile
            icon="camera"
            tint={th.color.status.voteOpen}
            title={t({ id: 'drivers.add.screenshot', message: 'Screenshot' })}
            detail={t({ id: 'drivers.add.screenshotDetail', message: 'Drop or pick one' })}
            on={false}
            onPress={add.screenshot}
            testID="drivers-add-tile-screenshot"
          />
          <SourceTile
            icon="phone"
            tint={th.color.status.rain}
            title={t({ id: 'drivers.add.contact', message: 'Contact' })}
            detail={t({ id: 'drivers.add.contactDetail', message: 'From WhatsApp' })}
            on={!pasting}
            onPress={() => add.setMode('contact')}
            testID="drivers-add-tile-contact"
          />
        </View>
        {pasting ? (
          <TextField
            accessibilityLabel={t({
              id: 'drivers.add.pasteLabel',
              message: 'The driver’s message',
            })}
            value={add.text}
            onChangeText={add.setText}
            multiline
            placeholder={t({
              id: 'drivers.add.pastePlaceholder',
              message: 'Paste what the driver wrote, or a link to his post',
            })}
            testID="drivers-add-text"
          />
        ) : (
          <View style={{ gap: th.space.gap10 }}>
            <TextField
              accessibilityLabel={t({ id: 'drivers.add.contactName', message: 'Name' })}
              placeholder={t({ id: 'drivers.add.contactName', message: 'Name' })}
              value={add.name}
              onChangeText={add.setName}
              textContentType="name"
              returnKeyType="next"
              testID="drivers-add-contact-name"
            />
            <TextField
              accessibilityLabel={t({
                id: 'drivers.add.contactPhone',
                message: 'WhatsApp number, with its country code',
              })}
              placeholder={t({
                id: 'drivers.add.contactPhone',
                message: 'WhatsApp number, with its country code',
              })}
              value={add.phone}
              onChangeText={add.setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              testID="drivers-add-contact-phone"
            />
          </View>
        )}
        {intake.state.kind === 'queued' ? (
          <Banner
            tone="info"
            text={t({
              id: 'drivers.add.queued',
              message: 'Saved. I’ll read it when you’re back online.',
            })}
            testID="drivers-add-queued"
          />
        ) : null}
        {intake.state.kind === 'failed' ? (
          <Banner
            tone="error"
            text={t({
              id: 'drivers.add.failed',
              message: 'That didn’t go through. Try again in a moment.',
            })}
            testID="drivers-add-failed"
          />
        ) : null}
        {add.items.length === 0 ? null : (
          <SharedList guideName={plan.guide.name} items={add.items} onOpen={add.openCheck} />
        )}
        <GuideNote
          name={plan.guide.name}
          critter={guideCritterKind(plan.guide.id)}
          text={t({
            id: 'drivers.add.footnote',
            message:
              'Copy any message from WhatsApp or Facebook and paste it here. I only read what you send.',
          })}
        />
        <Text variant="captionMuted" tone="muted" align="center">
          {t({
            id: 'drivers.premium.addPrivacy',
            message: 'A screenshot is read on your phone. Only its text is shared with the trip.',
          })}
        </Text>
      </KeyboardAwareScroll>
      <KeyboardStickyFooter openedOffset={th.space.gap12}>
        <View
          style={{
            paddingHorizontal: th.space.titleGutter,
            paddingBottom: Math.max(insets.bottom, th.space.gap12),
          }}
        >
          {pasting ? (
            <Button
              label={t({ id: 'drivers.add.read', message: 'Read it' })}
              disabled={!add.canRead}
              loading={add.reading}
              onPress={add.readText}
              testID="drivers-add-read"
            />
          ) : (
            <Button
              label={t({ id: 'drivers.add.addContact', message: 'Add him' })}
              disabled={!add.canAddContact}
              loading={add.reading}
              onPress={add.addContact}
              testID="drivers-add-contact-add"
            />
          )}
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  tiles: { flexDirection: 'row', gap: 8 },
});
