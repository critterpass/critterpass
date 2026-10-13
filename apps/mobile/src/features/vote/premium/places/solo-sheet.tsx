/**
 * Solo trip confirm (4.07), a half sheet over the place: the solo pass ticket ("YOU ⇢ RAK", dates
 * open, the guide plans with you) with its stub, "Just you, Marrakech", what a solo trip skips,
 * Start solo trip and Not now. Online, setup opens once the trip is made; offline it opens at once.
 */
import { useLingui } from '@lingui/react/macro';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  CritterSticker,
  GlassSurface,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { useShellExtras } from '@/ui/premium/shell/shell-theme';

import { useSoloStart } from '../../places/use-solo-start';

export interface SoloPassSheetProps {
  readonly placeName: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onClose: () => void;
}

/** The sheet itself; the page that opens it starts the trip (vote's guest guide, Explore's page). */
export function SoloPassSheet(props: SoloPassSheetProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { scrim } = useShellExtras();
  const { t } = useLingui();
  const place = props.placeName;
  const guideName = props.guide.name;
  const code = place.slice(0, 3).toLocaleUpperCase();
  return (
    <Modal transparent visible animationType="slide" onRequestClose={props.onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
          onPress={props.onClose}
          accessibilityLabel={t({ id: 'vote.solo.cancel', message: 'Not now' })}
        />
        <GlassSurface
          kind="sheet"
          testID="solo-confirm"
          style={{
            marginHorizontal: theme.space.gap8,
            marginBottom: Math.max(insets.bottom, theme.space.gap8),
            borderRadius: theme.radius.sheet,
            paddingHorizontal: 22,
            paddingTop: theme.space.gap16,
            paddingBottom: 26,
            gap: theme.space.gap16,
          }}
        >
          <View
            style={{
              height: 118,
              borderRadius: theme.radius.card,
              backgroundColor: theme.color.card,
              boxShadow: theme.shadow.card,
              flexDirection: 'row',
              overflow: 'hidden',
              // eslint-disable-next-line lingui/no-unlocalized-strings -- a tilt, never copy.
              transform: [{ rotate: '-1.5deg' }],
            }}
          >
            <View style={{ flex: 1, padding: theme.space.gap16, justifyContent: 'center', gap: 2 }}>
              <Text variant="mono" tone="muted">
                {t({
                  id: 'vote.premium.solo.pass',
                  message: 'Solo pass · 1 seat',
                }).toLocaleUpperCase()}
              </Text>
              <Text variant="stat">
                {t({ id: 'vote.premium.solo.route', message: `You ⇢ ${code}` })}
              </Text>
              <Text variant="captionMuted" tone="muted">
                {t({
                  id: 'vote.premium.solo.line',
                  message: `Dates open · ${guideName} plans with you`,
                })}
              </Text>
            </View>
            <View
              style={{
                width: 86,
                borderLeftWidth: 2,
                borderStyle: 'dashed',
                borderColor: theme.color.fieldBorder,
                backgroundColor: theme.color.banner.guide.bg,
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <CritterSticker kind={props.guide.kind} name={guideName} size={70} edge={false} />
            </View>
          </View>
          <View style={{ gap: theme.space.gap6 }}>
            <Text variant="emptyTitle" align="center" accessibilityRole="header">
              {t({ id: 'vote.premium.solo.title', message: `Just you, ${place}` })}
            </Text>
            <Text variant="emptyLine" tone="muted" align="center">
              {t({
                id: 'vote.solo.body',
                message: `${guideName} plans it with you. No vote, no RSVP. A solo trip doesn't use a crew's free first trip.`,
              })}
            </Text>
          </View>
          <View style={{ gap: theme.space.gap4, alignItems: 'center' }}>
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={t({ id: 'vote.solo.start', message: 'Start solo trip' })}
                onPress={props.onStart}
                loading={props.busy}
                testID="solo-start"
              />
            </View>
            <TextButton
              label={t({ id: 'vote.solo.cancel', message: 'Not now' })}
              onPress={props.onClose}
              testID="solo-cancel"
            />
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

/** The solo sheet over a guest guide's page, starting the trip from the vote area. */
export function SoloSheet(props: {
  readonly placeId: string;
  readonly placeName: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly crewId: string | undefined;
  readonly onClose: () => void;
}) {
  const { start, busy } = useSoloStart(props);
  return (
    <SoloPassSheet
      placeName={props.placeName}
      guide={props.guide}
      busy={busy}
      onStart={() => void start()}
      onClose={props.onClose}
    />
  );
}
