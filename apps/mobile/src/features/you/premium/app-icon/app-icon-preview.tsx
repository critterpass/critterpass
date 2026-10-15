/**
 * The App icon page's home-screen preview (9.03): a beach wallpaper with two rows of frosted
 * neighbours (the top row named like a phone's: Maps, Photos, Notes) and a dock, ours lifted in
 * the top row under its name. Every slot is the same size, so the selected icon's ring stays
 * inside its column.
 */
/* eslint-disable lingui/no-unlocalized-strings, critterpass/no-literal-style -- the wallpaper's own glass and CSS values the tokens do not carry, and the app's name, never copy. */
import type { AppIconBaseId } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Image, StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import WALLPAPER from '../../../../../assets/splash-photos/kelingking.jpg';
import { APP_ICON_PREVIEWS, type AppIconLook } from '../../app-icon/app-icon-previews';

export const ICON_CORNER = 0.225;
const ICON = 56;
const RING = 3;
/** The neighbours' and the dock's glass on the wallpaper, whatever the app's appearance. */
const NEIGHBOUR = 'rgba(255,255,255,.38)';
const NEIGHBOUR_EDGE = 'rgba(255,255,255,.55)';
const DOCK = 'rgba(255,255,255,.26)';
/** The wallpaper dimmed a touch at the foot, so the dock and the names read on it. */
const WALLPAPER_SHADE = 'linear-gradient(180deg, rgba(10,20,40,0) 40%, rgba(10,20,40,.3) 100%)';
const ON_WALLPAPER = '#ffffff';

export function IconImage({
  id,
  look,
  size,
}: {
  readonly id: AppIconBaseId;
  readonly look: AppIconLook;
  readonly size: number;
}) {
  const preview = APP_ICON_PREVIEWS[id];
  if (preview === undefined) return null;
  return (
    <Image
      source={preview[look]}
      style={{ width: size, height: size, borderRadius: size * ICON_CORNER }}
      accessibilityIgnoresInvertColors
    />
  );
}

function Neighbour({ name }: { readonly name?: string }) {
  return (
    <>
      <View
        style={{
          width: ICON,
          height: ICON,
          borderRadius: ICON * ICON_CORNER,
          backgroundColor: NEIGHBOUR,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: NEIGHBOUR_EDGE,
        }}
      />
      {name === undefined ? null : (
        <Text variant="captionMuted" color={ON_WALLPAPER} numberOfLines={1}>
          {name}
        </Text>
      )}
    </>
  );
}

/** A row of four slots spread over the wallpaper; `ours` puts our icon in the third. */
function Slots({
  ours,
  names,
}: {
  readonly ours?: React.ReactNode;
  readonly names?: readonly string[];
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={{ width: ICON + 12, alignItems: 'center', gap: 4 }}>
          {index === 2 && ours !== undefined ? (
            ours
          ) : (
            <Neighbour {...(names?.[index] === undefined ? {} : { name: names[index] })} />
          )}
        </View>
      ))}
    </View>
  );
}

export function AppIconPreview({
  id,
  look,
}: {
  readonly id: AppIconBaseId;
  readonly look: AppIconLook;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const names = [
    t({ id: 'you.premium.appIcon.maps', message: 'Maps' }),
    t({ id: 'you.premium.appIcon.photos', message: 'Photos' }),
    '',
    t({ id: 'you.premium.appIcon.notes', message: 'Notes' }),
  ];
  const ours = (
    <>
      <View
        style={{
          width: ICON,
          height: ICON,
          borderRadius: ICON * ICON_CORNER,
          borderWidth: RING,
          borderColor: th.accent.stickerEdge,
          boxShadow: th.shadow.raised,
          overflow: 'hidden',
        }}
      >
        <IconImage id={id} look={look} size={ICON - RING * 2} />
      </View>
      <Text variant="captionMuted" color={ON_WALLPAPER} numberOfLines={1}>
        CritterPass
      </Text>
    </>
  );
  return (
    <View
      style={{
        borderRadius: 30,
        overflow: 'hidden',
        backgroundColor: th.accent.sky,
        paddingTop: 22,
        paddingHorizontal: 10,
        paddingBottom: 12,
        gap: 18,
      }}
      testID="you-app-icon-preview"
    >
      <Image source={WALLPAPER} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { experimental_backgroundImage: WALLPAPER_SHADE }]}
      />
      <Slots ours={ours} names={names} />
      <Slots />
      <View style={{ borderRadius: 26, paddingVertical: 12, backgroundColor: DOCK }}>
        <Slots />
      </View>
    </View>
  );
}
