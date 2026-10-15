/**
 * The avatar picker on the premium kit, pushed from Edit profile: the face being picked, big, with
 * how the crew sees it (a chat line and the map pill), then Initials / Critter / Photo. Critter
 * holds the guides and the forms found in the Critterdex; Photo picks, cuts out and uploads a real
 * photo in place. Done, the one header action, appears once something new is picked.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Avatar, Card, CrossFade, SegmentedControl, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useAvatarPicker, type PhotoServices } from '../../avatar/use-avatar-picker';
import type { AvatarTab } from '../../avatar/tab-choice';
import { PremiumProfileFace } from '../profile/profile-face';
import { GuideDiscs, PremiumFormGrid, SmallFace } from './avatar-parts';
import { AvatarPhotoPanel } from './avatar-photo-panel';

const PREVIEW = 132;
const SMALL = 28;

function Caption({ children, aside }: { readonly children: string; readonly aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 }}>
      <Text variant="caption" tone="muted" accessibilityRole="header">
        {children}
      </Text>
      {aside === undefined ? null : (
        <Text variant="caption" tone="muted">
          {aside}
        </Text>
      )}
    </View>
  );
}

export function AvatarPremiumScreen({ photos }: { readonly photos: PhotoServices }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const picker = useAvatarPicker(photos);
  const { real } = picker;
  const preview = real.state.kind === 'preview' ? real.state.uri : null;
  const faceKey =
    preview ??
    (picker.shown.kind === 'guide'
      ? picker.shown.guide
      : picker.shown.kind === 'form'
        ? picker.shown.formId
        : picker.shown.kind === 'photo'
          ? picker.shown.mediaKey
          : 'initials');
  const crewAccents = [
    th.accent.sun,
    th.accent.sky,
    th.accent.pink,
    th.accent.mint,
    th.accent.tangerine,
    th.accent.neutral,
  ];
  const tabs: readonly { value: AvatarTab; label: string }[] = [
    { value: 'initials', label: t({ id: 'you.avatar.tab.initials', message: 'Initials' }) },
    { value: 'critter', label: t({ id: 'you.avatar.tab.critter', message: 'Critter' }) },
    { value: 'photo', label: t({ id: 'you.avatar.tab.photo', message: 'Photo' }) },
  ];
  return (
    <PushScreen
      title={t({ id: 'you.avatar.tabs', message: 'Avatar' })}
      backLabel={t({ id: 'you.avatar.back', message: 'Edit profile' })}
      testID="you-avatar"
      {...(picker.canDone
        ? {
            action: {
              key: 'done',
              label: t({ id: 'you.avatar.done', message: 'Done' }),
              sfSymbol: 'checkmark',
              glyph: 'check' as const,
              primary: true,
              text: true,
              onPress: picker.onDone,
              testID: 'you-avatar-done',
            },
          }
        : {})}
    >
      <View
        style={{
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        <View style={{ alignItems: 'center', gap: th.space.gap16 }}>
          <CrossFade swapKey={faceKey}>
            <PremiumProfileFace
              avatar={picker.avatar}
              name={picker.name}
              ring={picker.ring}
              photoUri={preview ?? picker.photoUri}
              size={PREVIEW}
            />
          </CrossFade>
        </View>
        <View style={{ gap: th.space.gap4 }}>
          <Caption>{t({ id: 'you.avatar.crewSees', message: 'How the crew sees it' })}</Caption>
          <Card padded>
            <View style={{ gap: th.space.gap12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.gap8 }}>
                <SmallFace
                  face={picker.shown}
                  photoUri={picker.photoUri}
                  name={picker.name}
                  size={SMALL}
                />
                <View
                  style={{
                    backgroundColor: th.color.control,
                    borderRadius: th.radius.pill,
                    paddingHorizontal: th.space.gap12,
                    paddingVertical: th.space.gap6,
                  }}
                >
                  <Text variant="rowText">
                    {t({ id: 'you.avatar.sampleLine', message: 'on my way!' })}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: th.space.gap6,
                  padding: 2,
                  paddingEnd: th.space.gap12,
                  borderRadius: th.radius.round,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.raised,
                }}
              >
                <SmallFace
                  face={picker.shown}
                  photoUri={picker.photoUri}
                  name={picker.name}
                  size={SMALL}
                />
                <Text variant="label">{picker.name}</Text>
              </View>
            </View>
          </Card>
        </View>
        <SegmentedControl
          options={tabs}
          value={picker.tab}
          onChange={picker.onTab}
          accessibilityLabel={t({ id: 'you.avatar.tabs', message: 'Avatar' })}
          testID="you-avatar-tabs"
        />
        <CrossFade swapKey={picker.tab}>
          {picker.tab === 'critter' ? (
            <View style={{ gap: th.space.gap10 }}>
              <Caption>{t({ id: 'you.avatar.guides', message: 'Your guides' })}</Caption>
              <GuideDiscs selected={picker.guide} onPick={picker.onGuide} />
              {picker.forms.length > 0 ? (
                <>
                  <Caption
                    aside={t({
                      id: 'you.avatar.unlocked',
                      message: `${picker.forms.length} unlocked`,
                    })}
                  >
                    {t({ id: 'you.avatar.fromDex', message: 'From your Critterdex' })}
                  </Caption>
                  <PremiumFormGrid
                    forms={picker.forms}
                    selected={picker.form}
                    onPick={picker.onForm}
                  />
                  <Text variant="caption" tone="muted" style={{ paddingHorizontal: 6 }}>
                    {t({
                      id: 'you.avatar.ringsLine',
                      message:
                        'Rare forms and up keep their coloured ring wherever your avatar shows up. Legendary rings are gold.',
                    })}
                  </Text>
                </>
              ) : null}
            </View>
          ) : picker.tab === 'initials' ? (
            <View style={{ gap: th.space.gap12 }} testID="you-avatar-initials">
              <Caption>
                {t({ id: 'you.avatar.initialsTitle', message: 'One letter, every crew’s colour' })}
              </Caption>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap12 }}>
                {crewAccents.map((color, index) => (
                  <Avatar key={index} name={picker.name} color={color} size={52} />
                ))}
              </View>
              <Text variant="body" tone="muted" style={{ paddingHorizontal: 6 }}>
                {t({
                  id: 'you.avatar.initialsLine',
                  message: 'Your first letter in your crew colour. Each crew keeps its own colour.',
                })}
              </Text>
            </View>
          ) : (
            <AvatarPhotoPanel
              real={real}
              available={photos !== null}
              pending={picker.photoPending}
            />
          )}
        </CrossFade>
      </View>
    </PushScreen>
  );
}
