/**
 * The profile's photo slot: the person's own photo, the critter they wear, or their initial, in a
 * double ring of their critter's tier colour.
 */
import { Image, View } from 'react-native';

import { FormSticker } from '@/features/critters';
import { guideSticker } from '@/ui/avatar/guides';
import { CritterSticker, ring, Text, usePremiumTheme } from '@/ui/premium';

import type { AvatarRing, ProfileAvatar } from '../../profile/profile-model';

export interface ProfileFaceProps {
  readonly avatar: ProfileAvatar;
  readonly name: string;
  readonly ring: AvatarRing | null;
  readonly photoUri: string | null;
  readonly size: number;
}

export function PremiumProfileFace({ avatar, name, ring: tier, photoUri, size }: ProfileFaceProps) {
  const t = usePremiumTheme();
  const tierColour =
    tier === 'rare' ? t.color.tier.rare : tier === 'epic' ? t.color.tier.epic : t.accent.sun;
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    backgroundColor: t.color.status.booked.bg,
    boxShadow: `${ring(3, t.accent.stickerEdge)}, ${ring(5, tier === null ? t.color.fieldBorder : tierColour)}`,
  };
  if (photoUri !== null) {
    return (
      <View style={circle} testID="you-profile-face">
        <Image
          source={{ uri: photoUri }}
          style={{ width: size, height: size }}
          accessibilityLabel={name}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  if (avatar.kind === 'form') {
    return (
      <View style={circle} testID="you-profile-face">
        <FormSticker form={avatar.formId} size={size - 4} />
      </View>
    );
  }
  if (avatar.kind === 'guide') {
    const guide = guideSticker(avatar.guide);
    return (
      <View style={circle} testID="you-profile-face">
        <CritterSticker kind={guide.kind} name={guide.name} seed={guide.seed} size={size - 4} />
      </View>
    );
  }
  return (
    <View
      style={[circle, { justifyContent: 'center', backgroundColor: t.accent.sun }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      testID="you-profile-face"
    >
      <Text variant="display" tone="onAccent">
        {Array.from(name.trim())[0]?.toLocaleUpperCase() ?? ''}
      </Text>
    </View>
  );
}
