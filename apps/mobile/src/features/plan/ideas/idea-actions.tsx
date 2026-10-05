/**
 * What can be done with one saved idea (undesigned; logged in docs/undesigned-states.md): put it
 * on a day, take back my own save, or (an organiser) take it off Ideas for everyone.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['16'], gap: t.space['12'] },
}));

export interface IdeaActionsProps {
  readonly name: string;
  /** Where the place already is in the plan ("Tue, Oct 20"), when it is. */
  readonly inPlan: string | null;
  /** Null while there is no plan to add to yet. */
  readonly onAddToDay: (() => void) | null;
  /** Takes back my own save; null when I never saved it. */
  readonly onRemoveMine: (() => void) | null;
  /** Organisers only. */
  readonly onRemoveForEveryone: (() => void) | null;
  readonly onClose: () => void;
}

export function IdeaActions(props: IdeaActionsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const day = props.inPlan ?? '';
  return (
    <Sheet
      title={props.name}
      detents={['fit']}
      onDismiss={props.onClose}
      accessibilityLabel={props.name}
      testID="plan-idea-actions"
    >
      <View style={styles.body}>
        {props.inPlan === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({ id: 'plan.ideas.inPlanLine', message: `Already in the plan on ${day}.` })}
          </Text>
        )}
        {props.onAddToDay === null ? null : (
          <PillButton
            label={
              props.inPlan === null
                ? t({ id: 'plan.ideas.action.add', message: 'Add to a day' })
                : t({ id: 'plan.ideas.action.move', message: 'Move it to another day' })
            }
            onPress={props.onAddToDay}
            block
            testID="plan-idea-action-add"
          />
        )}
        {props.onRemoveMine === null ? null : (
          <PillButton
            variant="secondary"
            label={t({ id: 'plan.ideas.action.remove', message: 'Remove from my saved' })}
            onPress={props.onRemoveMine}
            block
            testID="plan-idea-action-remove"
          />
        )}
        {props.onRemoveForEveryone === null ? null : (
          <PillButton
            variant="destructive"
            label={t({ id: 'plan.ideas.action.removeAll', message: 'Remove for everyone' })}
            onPress={props.onRemoveForEveryone}
            block
            testID="plan-idea-action-remove-all"
          />
        )}
      </View>
    </Sheet>
  );
}
