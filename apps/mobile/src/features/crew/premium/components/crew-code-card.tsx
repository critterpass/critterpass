/**
 * The crew code card (3.12): the code's QR, "Crew code · 7 days left" and the code; Share opens
 * the invite sheet and a hold makes a new code. With no live code the organiser makes one here.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Card, hitSlopFor, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { CodeRow } from '../../crews-sheet/crew-data';
import { qrChannelLink } from '../../invite-composer/qr-path';
import { codeDaysLeft } from '../crew-copy';
import { QrCode } from './qr-code';

export interface CrewCodeCardProps {
  readonly code: CodeRow | null;
  /** The code's invite link, which the QR carries. */
  readonly url: string | null;
  readonly canManage: boolean;
  readonly minting: boolean;
  readonly now: Date;
  readonly onMint: () => void;
  readonly onShare: () => void;
  readonly onNewCode: () => void;
}

export function CrewCodeCard({
  code,
  url,
  canManage,
  minting,
  now,
  onMint,
  onShare,
  onNewCode,
}: CrewCodeCardProps) {
  const th = usePremiumTheme();
  return (
    <Card style={styles.codeCard}>
      {url === null ? null : (
        <QrCode url={qrChannelLink(url)} size={46} testID="crew-settings-qr" />
      )}
      <View style={styles.grow}>
        <Text variant="caption" tone="muted">
          {[
            t({ id: 'crew.start.codeLabel', message: 'Crew code' }),
            codeDaysLeft(code?.expires_at ?? null, now),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {code === null ? (
          // No code: a plain line, not the code's spaced-out title style.
          <Text variant="rowTitle" tone="muted" testID="crew-settings-code">
            {t({ id: 'crew.settings.noCode', message: 'No live code' })}
          </Text>
        ) : (
          <Text variant="title" style={styles.code} testID="crew-settings-code">
            {code.code}
          </Text>
        )}
      </View>
      {code === null && canManage ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'crew.settings.rotate', message: 'New code' })}
          onPress={onMint}
          disabled={minting}
          hitSlop={PILL_SLOP}
          style={[styles.pill, { backgroundColor: th.color.control }]}
          testID="crew-settings-mint"
        >
          <Text variant="pillSmall">{t({ id: 'crew.settings.rotate', message: 'New code' })}</Text>
        </PressableScale>
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'crew.premium.share', message: 'Share' })}
          accessibilityHint={
            canManage
              ? t({ id: 'crew.premium.code.holdHint', message: 'Hold for a new code' })
              : undefined
          }
          onPress={onShare}
          onLongPress={canManage ? onNewCode : undefined}
          hitSlop={PILL_SLOP}
          style={[styles.pill, { backgroundColor: th.color.control }]}
          testID="crew-settings-rotate"
        >
          <Text variant="pillSmall">{t({ id: 'crew.premium.share', message: 'Share' })}</Text>
        </PressableScale>
      )}
    </Card>
  );
}

/** The 34 pt pill still takes a 44 pt tap. */
const PILL_SLOP = hitSlopFor(0, 34);

const styles = StyleSheet.create({
  codeCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  grow: { flex: 1 },
  code: { letterSpacing: 1.7 },
  pill: { height: 34, borderRadius: 17, paddingHorizontal: 13, justifyContent: 'center' },
});
