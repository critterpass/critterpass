/**
 * The foot of a stop's sheet (design in code): one line on what the change does to the rest of the
 * day (in the warning colour when it can't be saved), the first start that works one tap away when
 * the chosen time is taken, and SAVE, always in view.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock } from './format';
import type { ChangePreview } from './item-detail-sheet';

const useStyles = makeStyles((th) => ({
  foot: {
    gap: th.space['8'],
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['12'],
    paddingBottom: th.space['8'],
    borderTopWidth: th.space['2'] / 2,
    borderTopColor: th.color.divider,
  },
}));

export function SheetFoot({
  effect,
  saveLabel,
  canSave,
  onUseStart,
  onSave,
}: {
  readonly effect: ChangePreview;
  readonly saveLabel: string;
  readonly canSave: boolean;
  readonly onUseStart: (start: number) => void;
  readonly onSave: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { useStart } = effect;
  return (
    <View style={styles.foot}>
      {effect.line === null ? null : (
        <Text
          variant="bodySm"
          color={effect.blocked ? theme.semantic.state.warning : theme.semantic.text.secondary}
          testID="plan-item-preview"
        >
          {effect.line}
        </Text>
      )}
      {useStart === undefined ? null : (
        <TextLink
          label={t({
            id: 'plan.day.item.useStart',
            message: `Start at ${clock(locale, useStart)} instead`,
          })}
          onPress={() => onUseStart(useStart)}
          testID="plan-item-use-start"
        />
      )}
      <PillButton
        label={saveLabel}
        disabled={!canSave}
        onPress={onSave}
        block
        testID="plan-item-save"
      />
    </View>
  );
}
