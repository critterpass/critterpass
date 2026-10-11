/**
 * The boarding pass full screen (7.11): dark around a white pass that stays light in both modes,
 * ✕ on clear glass, a "Brightness up" chip that confirms the screen went to full brightness (tap
 * to let it go back), and share. The pass: the airline band, the route large, the stub (gate,
 * boards, seat) and the code, then the name and the confirmation code. It reads only this phone's
 * saved copy, so it opens at the gate with no signal.
 */
import { premium } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBackOr } from '@/lib/navigation/back';
import {
  GlassIconButton,
  GlassPill,
  PremiumThemeProvider,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { useBoardingPass } from '../boarding-pass/use-boarding-pass';
import { BOOKINGS_ROUTES } from '../routes';
import { PassCode } from './components/PassCode';

/** The airline band and its code tile: brand colours the design keeps in both modes. */
const AIRLINE_BAND = '#1f2a52';

function Stub({
  fields,
}: {
  readonly fields: readonly { key: string; label: string; value: string }[];
}) {
  const th = usePremiumTheme();
  return (
    <View style={styles.stub}>
      {fields.map((field) => (
        <View key={field.key} style={styles.stubCell}>
          <Text variant="badge" tone="placeholder" style={styles.caps} numberOfLines={1}>
            {field.label.toUpperCase()}
          </Text>
          <Text
            variant="headline"
            style={[styles.stubValue, { color: th.color.ink }]}
            numberOfLines={1}
          >
            {field.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PassCard({ bookingId }: { readonly bookingId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { width } = useWindowDimensions();
  const pass = useBoardingPass(bookingId);
  const { leg, booking } = pass;
  const code = Math.min(width - 120, 220);
  const stub = [
    ...(leg?.gate == null
      ? []
      : [
          {
            key: 'gate',
            label: t({ id: 'bookings.flight.gate', message: 'Gate' }),
            value: leg.gate,
          },
        ]),
    ...(pass.boards === ''
      ? []
      : [
          {
            key: 'boards',
            label: t({ id: 'bookings.pass.boards', message: 'Boards' }),
            value: pass.boards,
          },
        ]),
    ...pass.fields.filter((field) => field.key === 'seat'),
  ];
  return (
    <View
      style={[styles.card, { borderRadius: 30, backgroundColor: th.color.card }]}
      testID="bookings-pass-card"
    >
      {leg === null ? null : (
        <View style={[styles.band, { backgroundColor: AIRLINE_BAND }]}>
          <View style={[styles.carrier, { backgroundColor: premium.accent.sun }]}>
            <Text variant="badge" color={AIRLINE_BAND} style={styles.heavy}>
              {leg.carrier}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="rowTitle" color={premium.accent.paper}>
              {`${leg.carrier} ${leg.flight_no}`}
            </Text>
            <Text variant="label" color={premium.accent.paper} style={styles.soft}>
              {pass.subtitle}
            </Text>
          </View>
        </View>
      )}
      {leg === null ? (
        <View style={styles.route}>
          <Text variant="title" numberOfLines={2}>
            {booking?.title ?? ''}
          </Text>
        </View>
      ) : (
        <View style={styles.route}>
          <View>
            <Text style={styles.code}>{leg.dep_airport}</Text>
            <Text variant="caption" tone="muted">
              {pass.departs}
            </Text>
          </View>
          <Text variant="title" tone="placeholder" accessibilityElementsHidden>
            ✈︎
          </Text>
          <View style={styles.end}>
            <Text style={styles.code}>{leg.arr_airport}</Text>
            <Text variant="caption" tone="muted">
              {pass.arrives}
            </Text>
          </View>
        </View>
      )}
      {stub.length === 0 ? null : <Stub fields={stub} />}
      <View style={[styles.divider, { borderColor: th.color.fieldBorder }]} />
      <View style={styles.codeWrap}>
        <PassCode
          payload={pass.payload}
          size={code}
          missing={t({
            id: 'bookings.pass.noCode',
            message: 'No code saved yet. It saves when this phone next has signal.',
          })}
        />
        {booking?.supplierRef == null ? null : (
          <Text variant="label" tone="muted" style={styles.mono}>
            {booking.supplierRef}
          </Text>
        )}
      </View>
    </View>
  );
}

export function BoardingPassPremium({ bookingId }: { readonly bookingId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const pass = useBoardingPass(bookingId);
  const [bright, setBright] = useState(true);
  const share = () => {
    // The pass's flight and times, never the seat or the code: whoever gets it may forward it.
    void Share.share({
      message: [pass.title, pass.subtitle, pass.departs].filter(Boolean).join('\n'),
    });
  };
  return (
    <FullScreen
      closeLabel={t({ id: 'bookings.pass.close', message: 'Close' })}
      brighten={bright && pass.payload !== null}
      onClose={() => goBackOr(BOOKINGS_ROUTES.wallet)}
      testID="bookings-pass"
    >
      <View style={[styles.root, { backgroundColor: premium.modes.dark.color.ground }]}>
        <View style={[styles.top, { top: insets.top + th.space.gap6 }]}>
          {pass.payload === null ? null : (
            <GlassPill
              kind="clear"
              icon="sun"
              label={
                bright
                  ? t({ id: 'bookings.pass.bright', message: 'Brightness up' })
                  : t({ id: 'bookings.pass.dim', message: 'Brightness back' })
              }
              onPress={() => setBright((on) => !on)}
              testID="bookings-pass-brightness"
            />
          )}
        </View>
        <View style={[styles.share, { top: insets.top + th.space.gap6, right: th.space.gutter }]}>
          <GlassIconButton
            icon="share"
            kind="clear"
            label={t({ id: 'bookings.pass.share', message: 'Share the flight' })}
            onPress={share}
            testID="bookings-pass-share"
          />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 70,
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: th.space.gutter,
            gap: 20,
          }}
        >
          {/* The pass stays light in dark mode: scanners and gate agents read it. */}
          <PremiumThemeProvider scheme="light">
            <PassCard bookingId={bookingId} />
          </PremiumThemeProvider>
          <Text variant="label" align="center" color="rgba(255,255,255,0.75)">
            {t({ id: 'bookings.pass.offline', message: 'Saved on this phone · works offline' })}
          </Text>
        </ScrollView>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  share: { position: 'absolute', zIndex: 1 },
  card: { overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)' },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  carrier: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heavy: { fontWeight: '800' },
  soft: { opacity: 0.8 },
  flex: { flex: 1 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  end: { alignItems: 'flex-end' },
  code: { fontSize: 46, fontWeight: '800', letterSpacing: -1.6, lineHeight: 50 },
  stub: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 14, gap: 6 },
  stubCell: { flex: 1 },
  caps: { letterSpacing: 0.8, fontSize: 10, fontWeight: '700' },
  stubValue: { fontSize: 19, fontWeight: '700' },
  divider: { borderTopWidth: 1.5, borderStyle: 'dashed', marginHorizontal: 20 },
  codeWrap: { alignItems: 'center', gap: 10, paddingTop: 22, paddingBottom: 18 },
  mono: { fontFamily: 'Menlo', letterSpacing: 1.5 },
});
