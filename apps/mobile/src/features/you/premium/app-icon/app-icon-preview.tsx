/**
 * The App icon page's home-screen preview (9.03): a sky wallpaper with two rows of glass neighbours
 * and a dock, ours lifted in the top row under its name. Every slot is the same size, so the
 * selected icon's ring stays inside its column.
 */
/* eslint-disable lingui/no-unlocalized-strings, critterpass/no-literal-style -- the wallpaper's own glass and CSS values the tokens do not carry, and the app's name, never copy. */
import type { AppIconBaseId } from '@cp/domain';
import { Image, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import { APP_ICON_PREVIEWS, type AppIconLook } from '../../app-icon/app-icon-previews';

export const ICON_CORNER = 0.225;
const ICON = 56;
const RING = 3;
/** The neighbours' and the dock's glass on the wallpaper, whatever the app's appearance. */
const NEIGHBOUR = 'rgba(255,255,255,.32)';
const DOCK = 'rgba(255,255,255,.22)';
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

function Neighbour() {
  return (
    <View
      style={{
        width: ICON,
        height: ICON,
        borderRadius: ICON * ICON_CORNER,
        backgroundColor: NEIGHBOUR,
      }}
    />
  );
}

/** A row of four slots spread over the wallpaper; `ours` puts our icon in the second. */
function Slots({ ours }: { readonly ours?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={{ width: ICON + 12, alignItems: 'center', gap: 4 }}>
          {index === 1 && ours !== undefined ? ours : <Neighbour />}
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
        experimental_backgroundImage:
          'linear-gradient(180deg, rgba(10,20,40,.05), rgba(10,20,40,.35))',
        paddingTop: 22,
        paddingHorizontal: 10,
        paddingBottom: 12,
        gap: 18,
      }}
      testID="you-app-icon-preview"
    >
      <Slots ours={ours} />
      <Slots />
      <View style={{ borderRadius: 26, paddingVertical: 12, backgroundColor: DOCK }}>
        <Slots />
      </View>
    </View>
  );
}
