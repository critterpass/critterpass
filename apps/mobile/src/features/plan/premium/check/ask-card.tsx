/**
 * An organiser's private ask on the premium plan check (undesigned; the guide's yellow note with
 * the two pills): who asked which of your saves should go in, that only the two of you see it and
 * nothing moves to make room, with Add them and Not now.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Button, CritterSticker, Text, usePremiumTheme } from '@/ui/premium';

import { askLine, type AskCardProps } from '../../check/check-props';
import { usePlanGuide } from '../../plan-guide';

export function PremiumAskCard(props: AskCardProps) {
  const theme = usePremiumTheme();
  const guide = usePlanGuide();
  return (
    <View
      testID="plan-check-ask"
      style={{
        borderRadius: theme.radius.banner,
        backgroundColor: theme.color.banner.guide.bg,
        padding: theme.space.gap12,
        gap: theme.space.gap10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
        <CritterSticker kind={guide.kind} name={guide.name} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTextStrong" color={theme.color.banner.guide.text}>
            {askLine(props.asker, props.places)}
          </Text>
          <Text variant="captionMuted" color={theme.color.banner.guide.text}>
            {t({
              id: 'plan.check.ask.private',
              message: 'Only you two see this. Nothing moves to make room.',
            })}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.space.gap6 }}>
        <Button
          alignSelf="auto"
          size="small"
          label={t({ id: 'plan.check.ask.yes', message: 'Add them' })}
          onPress={props.onYes}
          testID="plan-check-ask-yes"
        />
        <Button
          alignSelf="auto"
          size="small"
          variant="control"
          label={t({ id: 'plan.check.ask.no', message: 'Not now' })}
          onPress={props.onNo}
          testID="plan-check-ask-no"
        />
      </View>
    </View>
  );
}
