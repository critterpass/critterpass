/**
 * The avatar picker's pieces on the premium kit: the small face the crew sees in chat and on the
 * map, the guides to wear in a row of discs, and the Critterdex forms in their rarity rings, the
 * picked one ringed in ink.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { FormSticker } from '@/features/critters';
import { GUIDE_AVATAR_IDS, guideSticker, type GuideAvatarId } from '@/ui/avatar/guides';
import { CritterSticker, PressableScale, Text, ring, usePremiumTheme } from '@/ui/premium';

import type { MemberFace } from '../../avatar/member-face';
import type { OwnedForm } from '../../avatar/owned-forms';

const GUIDE_DISC = 64;
const FORM_DISC = 72;
const STICKER_FILL = 0.82;

/** A face as small as chat and the map draw it: photo, sticker, or the initial on sun. */
export function SmallFace(props: {
  readonly face: MemberFace;
  readonly photoUri: string | null;
  readonly name: string;
  readonly size: number;
}) {
  const th = usePremiumTheme();
  const { face, size } = props;
  const sticker = Math.round(size * STICKER_FILL);
  let inner: ReactNode;
  if (face.kind === 'photo' && props.photoUri !== null) {
    inner = (
      <Image
        source={{ uri: props.photoUri }}
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />
    );
  } else if (face.kind === 'guide') {
    const guide = guideSticker(face.guide);
    inner = <CritterSticker kind={guide.kind} name={guide.name} seed={guide.seed} size={sticker} />;
  } else if (face.kind === 'form') {
    inner = <FormSticker form={face.formId} size={sticker} />;
  } else {
    inner = (
      <Text variant="avatarInitialSmall" tone="onAccent">
        {Array.from(props.name.trim())[0]?.toLocaleUpperCase() ?? ''}
      </Text>
    );
  }
  const initial = face.kind === 'initials' || (face.kind === 'photo' && props.photoUri === null);
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: initial ? th.accent.sun : th.color.status.booked.bg,
      }}
    >
      {inner}
    </View>
  );
}

export function GuideDiscs(props: {
  readonly selected: GuideAvatarId | null;
  readonly onPick: (guide: GuideAvatarId) => void;
}) {
  const th = usePremiumTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -th.space.gutter }}
      contentContainerStyle={{
        gap: th.space.gap10,
        paddingHorizontal: th.space.gutter,
        paddingVertical: th.space.gap6,
      }}
      accessibilityRole="radiogroup"
      testID="you-avatar-guide"
    >
      {GUIDE_AVATAR_IDS.map((id) => {
        const guide = guideSticker(id);
        const on = props.selected === id;
        return (
          <PressableScale
            key={id}
            onPress={() => props.onPick(id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={guide.name}
            testID={`you-avatar-guide-${id}`}
            style={{
              width: GUIDE_DISC,
              height: GUIDE_DISC,
              borderRadius: GUIDE_DISC / 2,
              backgroundColor: th.color.card,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: on
                ? `${ring(2.5, th.color.ground)}, ${ring(5, th.color.ink)}`
                : th.shadow.raised,
            }}
          >
            <CritterSticker kind={guide.kind} name={guide.name} seed={guide.seed} size={52} />
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

export function PremiumFormGrid(props: {
  readonly forms: readonly OwnedForm[];
  readonly selected: string | null;
  readonly onPick: (key: string) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap14 }}
      accessibilityRole="radiogroup"
      testID="you-avatar-forms"
    >
      {props.forms.map((form, index) => {
        const picked = props.selected === form.key;
        const tier =
          form.ring === 'rare'
            ? th.color.tier.rare
            : form.ring === 'epic'
              ? th.color.tier.epic
              : form.ring === 'legendary'
                ? th.accent.sun
                : th.color.fieldBorder;
        return (
          <PressableScale
            key={form.key}
            onPress={() => props.onPick(form.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={t({ id: 'you.avatar.formLabel', message: `Critter ${index + 1}` })}
            testID={`you-avatar-form-${index}`}
            style={{
              width: FORM_DISC,
              height: FORM_DISC,
              borderRadius: FORM_DISC / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: th.color.card,
              boxShadow: picked
                ? `${ring(3, tier)}, ${ring(5.5, th.color.ink)}`
                : `${ring(3, tier)}, ${th.shadow.raised}`,
            }}
          >
            <FormSticker form={form.key} size={FORM_DISC - 12} />
          </PressableScale>
        );
      })}
    </View>
  );
}
