/**
 * Before the last free redraft (4f-3): "{PLACE} · REDRAFT 3 OF 3", LAST FREE REDRAFT with the guide
 * rubbing its chin, the used pips crossed out and the last one glowing, the guide's line, USE MY
 * LAST ONE (runs the normal redraft) and the boost, one tap away. Redrafts reset every trip.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sheet } from '@/ui/sheet/Sheet';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

const STICKER = 84;
const PIP_HEIGHT = 6;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['14'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  grow: { flex: 1, gap: th.space['6'] },
  pips: { flexDirection: 'row', gap: th.space['8'] },
  pip: { flex: 1, height: PIP_HEIGHT, borderRadius: PIP_HEIGHT / 2 },
  voice: {
    backgroundColor: th.semantic.bg.control,
    borderRadius: th.radius.md,
    padding: th.space['12'],
  },
  actions: { gap: th.space['10'], alignItems: 'stretch' },
  centred: { textAlign: 'center' },
}));

export interface LastRedraftViewProps {
  readonly guide: GuideId;
  readonly destination: string;
  readonly n: number;
  readonly limit: number;
  readonly sending: boolean;
  readonly problem: string | null;
  readonly onUse: () => void;
  readonly onBoost: (() => void) | undefined;
  readonly onClose?: () => void;
}

export function LastRedraftView(props: LastRedraftViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const wiggle = useLoop('wiggle');
  const pulse = useLoop('pulse');
  const info = GUIDE_STICKERS[props.guide];
  const destination = props.destination;
  const n = props.n;
  const limit = props.limit;
  return (
    <Sheet
      detents={['fit']}
      closable
      accessibilityLabel={t({ id: 'planDraft.last.title', message: 'Last free redraft' })}
      {...(props.onClose === undefined ? {} : { onDismiss: props.onClose })}
      testID="last-redraft"
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.grow}>
            <Text variant="eyebrow" color={theme.semantic.state.warning}>
              {t({
                id: 'planDraft.last.eyebrow',
                message: `${destination} · Redraft ${n} of ${limit}`,
              })}
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {t({ id: 'planDraft.last.title', message: 'Last free redraft' })}
            </Text>
          </View>
          <Animated.View style={wiggle}>
            <Sticker kind={info.kind} name={info.name} pose="think" size={STICKER} />
          </Animated.View>
        </View>
        <View
          style={styles.pips}
          accessible
          accessibilityLabel={t({ id: 'planDraft.last.pips', message: `${n} of ${limit}` })}
        >
          {Array.from({ length: limit }, (_, index) =>
            index < n - 1 ? (
              <View
                key={index}
                style={[
                  styles.pip,
                  {
                    backgroundColor: theme.semantic.bg.control,
                    transform: [{ rotate: degrees(-2) }],
                  },
                ]}
              />
            ) : index === n - 1 ? (
              <Animated.View
                key={index}
                style={[styles.pip, { backgroundColor: theme.semantic.state.warning }, pulse]}
              />
            ) : (
              <View
                key={index}
                style={[styles.pip, { borderWidth: 1, borderColor: theme.semantic.border.control }]}
              />
            ),
          )}
        </View>
        <View style={styles.voice}>
          <Text variant="voice" color={theme.guide[props.guide]}>
            {props.onBoost === undefined
              ? t({
                  id: 'planDraft.last.lineNoBoost',
                  message: 'Make it count. This is the last one on this trip.',
                })
              : t({
                  id: 'planDraft.last.line',
                  message:
                    'Make it count. Or boost the trip and I’ll keep redrafting until everyone’s happy.',
                })}
          </Text>
        </View>
        {props.problem === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.warning}>
            {props.problem}
          </Text>
        )}
        <View style={styles.actions}>
          <PillButton
            tone="orange"
            label={t({ id: 'planDraft.last.use', message: 'Use my last one' })}
            onPress={props.onUse}
            loading={props.sending}
            testID="last-redraft-use"
          />
          {props.onBoost === undefined ? null : (
            <PillButton
              variant="secondary"
              label={t({ id: 'planDraft.last.boost', message: 'Boost · unlimited redrafts' })}
              onPress={props.onBoost}
              testID="last-redraft-boost"
            />
          )}
          <Text variant="caption" color={theme.semantic.text.tertiary} style={styles.centred}>
            {t({ id: 'planDraft.spent.reset', message: 'Redrafts reset every trip.' })}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}
