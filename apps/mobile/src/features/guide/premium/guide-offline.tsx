/**
 * The guide with no signal (5.17): questions asked offline wait faded for the connection, and the
 * offline tools card lists what still works on this phone.
 */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Chip, Icon, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import type { WaitingQuestion } from '../chat/data/guide-question-queue';
import { GuideQuestion } from './guide-bubbles';

const useStyles = makePremiumStyles((th) => ({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap8 },
  tools: {
    borderRadius: 24,
    padding: 14,
    gap: th.space.gap12,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  toolsHead: { flexDirection: 'row', alignItems: 'center', gap: th.space.gap10 },
  toolsDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.status.tangerine.bg,
  },
}));

/** Questions asked offline: faded, each waiting for signal. */
export function WaitingQuestionRows({
  questions,
}: {
  readonly questions: readonly WaitingQuestion[];
}) {
  const th = usePremiumTheme();
  if (questions.length === 0) return null;
  return (
    <View style={{ gap: th.space.gap6 }} testID="guide-offline-queue">
      {questions.map((question) => (
        <GuideQuestion key={question.id} text={question.text} author={null} faded />
      ))}
      <Text variant="captionMuted" tone="muted" align="right">
        {t({ id: 'guide.premium.waitsForSignal', message: 'Asks when you’re back online' })}
      </Text>
    </View>
  );
}

export interface OfflineTool {
  readonly key: string;
  readonly label: string;
  readonly href: Href;
}

/** What still works with no signal, saved on this phone for the trip. */
export function OfflineToolsCard({
  destination,
  tools,
}: {
  readonly destination: string | null;
  readonly tools: readonly OfflineTool[];
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  if (tools.length === 0) return null;
  const place = destination;
  return (
    <View style={styles.tools} testID="guide-offline-tools">
      <View style={styles.toolsHead}>
        <View style={styles.toolsDisc}>
          <Icon name="offline" size={18} color={th.color.status.tangerine.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">
            {t({ id: 'guide.premium.offlineTools', message: 'Still works offline' })}
          </Text>
          <Text variant="captionMuted" tone="muted">
            {place === null
              ? t({ id: 'guide.premium.offlineSaved', message: 'Saved on this phone' })
              : t({
                  id: 'guide.premium.offlineSavedFor',
                  message: `Saved on this phone for ${place}`,
                })}
          </Text>
        </View>
      </View>
      <View style={styles.pills}>
        {tools.map((tool) => (
          <Chip
            key={tool.key}
            label={tool.label}
            onPress={() => router.push(tool.href)}
            testID={`guide-offline-${tool.key}`}
          />
        ))}
      </View>
    </View>
  );
}
