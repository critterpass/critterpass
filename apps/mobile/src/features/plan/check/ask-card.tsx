/**
 * An organiser's private ask, as the asked member sees it on their plan check (and from the inbox
 * row): Tokek says who asked and which of their saves would go in, with yes and no. Only the two
 * of them see it; the crew chat never does. Undesigned: built from the Tokek note and pill buttons.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlanGuideSticker } from '../plan-guide';

export interface AskCardProps {
  readonly asker: string;
  readonly places: readonly string[];
  readonly onYes: () => void;
  readonly onNo: () => void;
}

const useStyles = makeStyles((th) => ({
  card: {
    gap: th.space['12'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderColor: th.semantic.action.primary,
    backgroundColor: th.semantic.bg.raised,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  text: { flex: 1, minWidth: 0, gap: th.space['4'] },
  actions: { flexDirection: 'row', gap: th.space['12'] },
}));

export function askLine(asker: string, places: readonly string[]): string {
  const list = places.join(', ');
  return places.length === 0
    ? t({ id: 'plan.check.ask.linePlain', message: `${asker} asked if your saves should go in.` })
    : t({ id: 'plan.check.ask.line', message: `${asker} asked if ${list} should go in.` });
}

export function AskCard(props: AskCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.card} testID="plan-check-ask">
      <View style={styles.row}>
        <PlanGuideSticker size={40} />
        <View style={styles.text}>
          <Text variant="voice" singleLine={false}>
            {askLine(props.asker, props.places)}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
            {t({
              id: 'plan.check.ask.private',
              message: 'Only you two see this. Nothing moves to make room.',
            })}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <PillButton
          label={t({ id: 'plan.check.ask.yes', message: 'Add them' })}
          onPress={props.onYes}
          size="sm"
          testID="plan-check-ask-yes"
        />
        <PillButton
          label={t({ id: 'plan.check.ask.no', message: 'Not now' })}
          onPress={props.onNo}
          size="sm"
          variant="secondary"
          testID="plan-check-ask-no"
        />
      </View>
    </View>
  );
}
