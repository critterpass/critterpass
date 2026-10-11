/** The recap page's next-step links and its loading, writing and failed states. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  EmptyState,
  Icon,
  PressableScale,
  Skeleton,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import type { SummaryViewProps } from '../summary/summary-view';

const useStyles = makePremiumStyles((th) => ({
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

export function NextLink({
  title,
  detail,
  onPress,
  testID,
}: {
  readonly title: string;
  readonly detail: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <PressableScale
      style={styles.next}
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
    >
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="captionMuted" tone="muted">
          {detail}
        </Text>
      </View>
      <Icon name="forward" size={14} color={th.color.muted} />
    </PressableScale>
  );
}

export function NotReady(props: SummaryViewProps) {
  const art = guideSticker(props.guide);
  const guideName = props.guideName;
  if (props.model.phase === 'loading') {
    return (
      <View style={{ gap: 12 }} testID="recap-loading">
        <Skeleton height={148} radius={24} />
        <Skeleton height={148} radius={24} />
      </View>
    );
  }
  if (props.model.phase === 'writing') {
    return (
      <EmptyState
        testID="recap-writing"
        critter={{ kind: art.kind, name: guideName }}
        title={t({
          id: 'recap.summary.writing.title',
          message: `${guideName} is writing your recap`,
        })}
        line={t({
          id: 'recap.summary.writing.line',
          message: "Counting the kilometres and the photos. I'll ping you when it's ready.",
        })}
      />
    );
  }
  return (
    <EmptyState
      testID="recap-failed"
      critter={{ kind: art.kind, name: guideName }}
      title={t({ id: 'recap.summary.failed.title', message: "The recap didn't come together" })}
      line={t({
        id: 'recap.summary.failed.line',
        message: 'Something went wrong on my side. Nothing from the trip is lost. Try again?',
      })}
      action={
        <Button
          size="medium"
          label={
            props.retrying
              ? t({ id: 'recap.summary.failed.retrying', message: 'Asking again…' })
              : t({ id: 'recap.summary.failed.retry', message: 'Try again' })
          }
          onPress={props.onRetry}
          testID="recap-retry"
        />
      }
    />
  );
}
