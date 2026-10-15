/**
 * One way out when no week fits everyone: its dates and who it leaves out, what it costs or misses,
 * and the guide's pick. The organiser picks one (a radio); a member only reads them.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { WindowOption } from '../../when/model';
import { optionLine, optionTitle, type OptionPeople } from '../../when/option-lines';

export function WindowOptionCard(props: {
  readonly option: WindowOption;
  readonly people: OptionPeople;
  readonly guideName: string;
  /** Null for a member, who reads the options without picking. */
  readonly pick: { readonly selected: boolean; readonly onSelect: () => void } | null;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { option, people } = props;
  const on = props.pick?.selected === true;
  const closed = option.askState === 'not_movable' || option.askState === 'timed_out';
  const look = {
    borderRadius: theme.radius.cardRow,
    backgroundColor: theme.color.card,
    borderWidth: 2,
    borderColor: on ? theme.color.ink : 'transparent',
    boxShadow: theme.shadow.card,
    paddingVertical: theme.space.gap14,
    paddingHorizontal: theme.space.gap16,
    gap: theme.space.gap4,
    opacity: closed ? 0.5 : 1,
  };
  const testID = `window-option-${option.kind}`;
  const body = (
    <>
      <Text variant="headline">{optionTitle(locale, option, people)}</Text>
      <Text variant="note" tone="muted">
        {optionLine(locale, option, people)}
      </Text>
      {option.isPick ? (
        <Text variant="bannerAction" color={theme.color.status.tangerine.text}>
          {t({ id: 'setup.premium.when.option.pick', message: `${props.guideName}'s pick` })}
        </Text>
      ) : null}
    </>
  );
  if (props.pick === null) {
    return (
      <View testID={testID} style={look}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={props.pick.onSelect}
      disabled={closed}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: closed }}
      testID={testID}
      style={look}
    >
      {body}
    </PressableScale>
  );
}
