/**
 * 3b-2's tip strip: one data-backed line from the place's guide, in their voice (Borel) inside a
 * speech bubble. Tapping opens the place's destination page; a fling either way dismisses it for the
 * whole crew (`dismiss_tip`, queued offline) and it leaves at once. Hidden when there is no tip or
 * the user turned guide tips off; sponsored content never comes through here.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useCommand } from '@/data/commands/use-command';
import { useSwipeDeck } from '@/motion/gestures/swipe-deck';
import { guideSticker } from '@/ui/avatar/guides';
import { GuideLine } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';

import type { TipRow } from './data/home-queries';
import { guideOr } from './format';
import { dismissTipCommand } from './home-commands';
import { homeRoutes } from './routes';

const TIP_STICKER = 44;

export interface TipStripProps {
  readonly tip: TipRow;
}

export function TipStrip({ tip }: TipStripProps) {
  const { t } = useLingui();
  const dismiss = useCommand(dismissTipCommand);
  const guide = guideOr(tip.guide_slug);
  const sticker = guideSticker(guide);
  const swipe = useSwipeDeck({
    onSwiped: () => void dismiss.send({ tip_id: tip.id }),
    accessibilityLabel: t({ id: 'home.tip.dismiss', message: 'Dismiss tip' }),
  });
  const href = tip.place_id === null ? undefined : homeRoutes.destination(tip.place_id);
  const line = (
    <GuideLine
      guide={guide}
      name={sticker.name}
      bubble
      line={tip.text}
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={TIP_STICKER} />}
    />
  );
  return (
    <GestureDetector gesture={swipe.gesture}>
      <Animated.View
        testID="home-tip-swipe"
        style={swipe.animatedStyle}
        accessibilityActions={[...swipe.accessibilityActions]}
        onAccessibilityAction={swipe.onAccessibilityAction}
      >
        {href === undefined ? (
          // A tip about no place opens nothing, so it is not a button.
          <View testID="home-tip">{line}</View>
        ) : (
          <PressScale
            testID="home-tip"
            widthClass="wide"
            accessibilityLabel={`${sticker.name}: ${tip.text}`}
            onPress={() => router.push(href)}
          >
            {line}
          </PressScale>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
