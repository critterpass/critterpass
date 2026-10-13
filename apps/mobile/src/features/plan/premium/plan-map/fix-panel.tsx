/**
 * A problem's fix opened in place under its day on the whole-trip sheet (4.43): the vote-open pink
 * panel with what is wrong and why, the fix in one white line with its check, and Fix it (Suggest
 * for a member), Other ways (the plan check with every way to fix it) and Leave it. The card's
 * words and actions are the plan check's own.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, Icon, Text, usePremiumTheme } from '@/ui/premium';

import type { IssueCardProps } from '../../check/check-props';

export interface DayFix {
  readonly card: IssueCardProps;
  readonly onKeep: () => void;
}

export function FixPanel(props: {
  readonly fix: DayFix;
  readonly onOtherWays: () => void;
  /** Set in from the screen edge (the map sheet); flush inside a card. */
  readonly inset?: boolean;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { card } = props.fix;
  const pink = theme.color.status.voteOpen;
  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      testID={`trip-fix-${card.id}`}
      style={{
        marginHorizontal: props.inset === false ? 0 : theme.space.gap12,
        marginBottom: props.inset === false ? 0 : theme.space.gap12,
        borderRadius: 18,
        backgroundColor: pink.bg,
        padding: theme.space.gap12,
        gap: theme.space.gap6,
      }}
    >
      <Text variant="rowTitle" color={pink.text}>
        {card.title}
      </Text>
      <Text variant="caption" color={pink.text}>
        {card.body}
      </Text>
      {card.summary === null ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap8,
            borderRadius: 14,
            backgroundColor: theme.color.card,
            paddingVertical: theme.space.gap8,
            paddingHorizontal: theme.space.gap10,
          }}
        >
          <Icon name="check" size={16} color={theme.color.toggleOn} />
          <Text variant="rowTextStrong" style={{ flex: 1 }}>
            {card.summary}
          </Text>
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.space.gap6,
          marginTop: theme.space.gap4,
        }}
      >
        {card.fixLabel === null ? null : (
          <Button
            size="small"
            label={card.fixLabel}
            onPress={card.onFix}
            loading={card.busy}
            testID={`trip-fix-apply-${card.id}`}
          />
        )}
        <Button
          size="small"
          variant="control"
          label={t({ id: 'plan.premium.fix.otherWays', message: 'Other ways' })}
          onPress={props.onOtherWays}
          testID={`trip-fix-other-${card.id}`}
        />
        <Button
          size="small"
          variant="control"
          label={t({ id: 'plan.premium.check.leave', message: 'Leave it' })}
          onPress={props.fix.onKeep}
          testID={`trip-fix-leave-${card.id}`}
        />
      </View>
    </Animated.View>
  );
}
