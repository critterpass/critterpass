/**
 * Lab scenes for shake to report, without the shake: a screen with private amounts on it, and a
 * shake over another area's screen. "Shake here" takes the masked screenshot a shake would, then
 * opens the real problem report with it attached (or, over another screen, shows the picture full
 * size, so what the screen's own private parts cover is plain to see).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ListCard, Row, Text, usePremiumTheme } from '@/ui/premium';

import { feedbackHref } from '../routes';
import { captureMasked } from '../shake/capture';
import { PrivateContent } from '../shake/PrivateContent';
import { deviceCapturePorts } from '../shake/ShakeListener';

const SPENDING = [
  { title: 'Villa in Ubud', paidBy: 'Winston paid · split 5 ways', amount: 'Rp 9.600.000' },
  { title: 'Scooter rental', paidBy: 'Jordan paid · split 4 ways', amount: 'Rp 1.200.000' },
  { title: 'Dinner at Locavore', paidBy: 'Alex paid · split 5 ways', amount: 'Rp 4.850.000' },
  { title: 'Tegallalang entry', paidBy: 'You paid · split 5 ways', amount: 'Rp 250.000' },
] as const;

/** A shake over another area's screen: the screen as it is in the app, then the picture taken. */
export function ShakeOver({ children }: { readonly children: ReactNode }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  if (shot !== undefined) {
    return (
      <View
        style={[styles.fill, { backgroundColor: th.color.ground, paddingTop: insets.top }]}
        testID="help-shake-picture"
      >
        {shot === null ? (
          <Text variant="body">No picture could be taken.</Text>
        ) : (
          <Image source={{ uri: shot }} style={styles.fill} resizeMode="contain" />
        )}
      </View>
    );
  }
  return (
    <View style={styles.fill}>
      {children}
      <View
        style={[
          styles.shake,
          { left: th.space.gutter, right: th.space.gutter, bottom: insets.bottom + 32 },
        ]}
      >
        <Button
          label="Shake here"
          onPress={() => void captureMasked('/explore', deviceCapturePorts).then(setShot)}
          testID="help-shake-here"
        />
      </View>
    </View>
  );
}

/** What a shake does: the masked screenshot of this scene, then the problem report with it. */
export function ShakeReportScene() {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const shake = (pathname: string) =>
    void captureMasked(pathname, deviceCapturePorts).then((shot) =>
      router.push(
        feedbackHref({
          mode: 'problem',
          context: pathname,
          shake: true,
          ...(shot === null ? {} : { shot }),
        }),
      ),
    );
  return (
    <ScrollView
      style={{ backgroundColor: th.color.ground }}
      contentContainerStyle={{
        padding: th.space.gutter,
        paddingTop: insets.top + 16,
        gap: th.space.gap16,
      }}
      testID="help-shake-lab"
    >
      <Text variant="label" tone="muted">
        You owe Winston
      </Text>
      <PrivateContent>
        <Text variant="display">Rp 4.500.000</Text>
      </PrivateContent>
      <Text variant="body">Amounts are marked private; names and places are not.</Text>
      <Button label="Shake here" onPress={() => shake('/explore')} testID="help-shake-here" />
      <Button
        label="Shake on a private screen"
        variant="secondary"
        onPress={() => shake('/wallet')}
        testID="help-shake-private"
      />
      <ListCard>
        {SPENDING.map((row) => (
          <Row
            key={row.title}
            title={row.title}
            subtitle={row.paidBy}
            trailing={
              <PrivateContent>
                <Text variant="rowTitle">{row.amount}</Text>
              </PrivateContent>
            }
          />
        ))}
      </ListCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shake: { position: 'absolute' },
});
