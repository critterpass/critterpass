/**
 * Share recap in the premium look: the recap's picture (Story or Post, Share, Save to Photos), then
 * "Share a link" (a web page with the place, the month, how far and first names; no photos, no
 * money) and, while a link is live, "Stop sharing".
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Icon, PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import { useRecapShareCard } from '../summary/share-card';
import type { RecapShareProps } from '../summary/summary-screen';
import { PremiumShareSheet } from './premium-share-sheet';

const useStyles = makePremiumStyles((th) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

function LinkRow({
  title,
  line,
  onPress,
  testID,
}: {
  readonly title: string;
  readonly line: string;
  readonly onPress?: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <PressableScale
      style={styles.row}
      onPress={onPress}
      disabled={onPress === undefined}
      accessibilityRole="button"
      testID={testID}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="captionMuted" tone="muted">
          {line}
        </Text>
      </View>
      <Icon name="forward" size={14} color={th.color.muted} />
    </PressableScale>
  );
}

export function PremiumRecapShare({ model, guide, unit, link, onClose }: RecapShareProps) {
  const share = useRecapShareCard({ model, guide, unit });
  const count = link.stoppable;
  return (
    <PremiumShareSheet
      title={t({ id: 'recap.share.title', message: 'Share the recap' })}
      altText={share.altText}
      render={share.render}
      deps={share.deps}
      onClose={onClose}
      testID="recap-share"
      moreActions={
        <>
          <LinkRow
            title={t({ id: 'recap.share.link', message: 'Share a link' })}
            line={t({
              id: 'recap.share.linkLine',
              message:
                'A web page anyone with the link can open: the place, the month, how far you went, places on the trail and first names. No photos, no money.',
            })}
            {...(link.busy ? {} : { onPress: () => void link.share() })}
            testID="recap-share-link"
          />
          {count > 0 ? (
            <LinkRow
              title={t({ id: 'recap.share.stop', message: 'Stop sharing' })}
              line={t({
                id: 'recap.share.stopLine',
                message: plural(count, {
                  one: 'Switches off # link. It opens nothing after that.',
                  other: 'Switches off # links. They open nothing after that.',
                }),
              })}
              {...(link.busy ? {} : { onPress: () => void link.stop() })}
              testID="recap-share-stop"
            />
          ) : null}
        </>
      }
    />
  );
}
